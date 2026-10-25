// Static PDF security triage — our own JS port of ideas from ref/ (see ref/README.md):
//  - DidierStevensSuite/pdfid.py : keyword triage incl. #XX name-obfuscation handling,
//    header-at-0 / %%EOF / chars-after-EOF checks
//  - pdf-defang/_scan.py         : risk buckets none/low/medium/high + dangerous URI schemes
//  - pdfchecker / pdfstudio      : weighted 0-100 score with severity floors
// No code copied — logic re-implemented for the browser (raw-text triage, no pikepdf).
// Dependency-free so it can be unit-tested in plain node.

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const SCAN_CAP = 12 * 1024 * 1024 // raw-text triage window (keeps UI snappy on huge files)
const TAIL = 64 * 1024 // always inspect the tail for %%EOF / appended data

const NAME_KEYWORDS = [
  '/Encrypt', '/ObjStm', '/JS', '/JavaScript', '/AA', '/OpenAction', '/AcroForm',
  '/JBIG2Decode', '/RichMedia', '/Launch', '/EmbeddedFile', '/EmbeddedFiles',
  '/XFA', '/URI', '/SubmitForm', '/GoToR', '/GoToE', '/ImportData', '/Names', '/Page',
]
const STRUCT_WORDS = ['obj', 'endobj', 'stream', 'endstream', 'xref', 'trailer', 'startxref']

const SAFE_URI_SCHEMES = new Set(
  ['http', 'https', 'mailto', 'tel', 'ftp', 'sftp', 'news', 'nntp', 'irc', 'ircs', 'magnet'],
)

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countMatches(text, re) {
  re.lastIndex = 0
  let n = 0
  while (re.exec(text)) {
    n++
    if (n > 100000) break
    if (re.lastIndex === 0) break // safety for zero-length matches
  }
  return n
}

function bytesToLatin1(bytes) {
  // chunked to avoid call-stack limits on large files
  let out = ''
  const CHUNK = 65536
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return out
}

function shannonEntropy(bytes, maxSample = 262144) {
  if (!bytes.length) return 0
  const freq = new Uint32Array(256)
  const step = Math.max(1, Math.floor(bytes.length / maxSample))
  let count = 0
  for (let i = 0; i < bytes.length && count < maxSample; i += step) {
    freq[bytes[i]]++
    count++
  }
  let h = 0
  for (let f = 0; f < 256; f++) {
    if (freq[f]) {
      const p = freq[f] / count
      h -= p * Math.log2(p)
    }
  }
  return h
}

export function triageBuffer(buffer) {
  const bytes = new Uint8Array(buffer)
  const head = bytes.subarray(0, Math.min(bytes.length, SCAN_CAP))
  const tail = bytes.subarray(Math.max(0, bytes.length - TAIL))
  const raw = bytesToLatin1(head)
  const tailText = bytesToLatin1(tail)

  // pdfid-style: decode #XX hex escapes inside names (/J#53 == /JS), then compare.
  // Evasion counts ONLY if decoding reveals a risky keyword that plain text hides
  // (a bare `#XX` anywhere is normal — e.g. ASCII85 streams, fragments — not a signal).
  const normalized = raw.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))

  const counts = {}
  const rawCounts = {}
  for (const name of NAME_KEYWORDS) {
    const re = new RegExp(escapeRe(name) + '(?![A-Za-z0-9])', 'g')
    counts[name] = countMatches(normalized, re)
    rawCounts[name] = countMatches(raw, new RegExp(escapeRe(name) + '(?![A-Za-z0-9])', 'g'))
  }
  for (const w of STRUCT_WORDS) {
    counts[w] = countMatches(normalized, new RegExp(`\\b${escapeRe(w)}\\b`, 'g'))
  }

  // header must be %PDF-x.y at byte 0 (pdfid relaxes this slightly; we flag it)
  const headerAtZero = bytes.length >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
    && bytes[3] === 0x46 && bytes[4] === 0x2d
  const headerVersion = (normalized.match(/%PDF-(\d\.\d)/) || [])[1] || ''
  const eofCount = bytes.length <= SCAN_CAP
    ? countMatches(raw, /%%EOF/g)
    : countMatches(tailText, /%%EOF/g)
  const lastEof = tailText.lastIndexOf('%%EOF')
  const charsAfterEof = lastEof === -1 ? -1 : tailText.length - (lastEof + 5)

  // URI actions: /URI (scheme) — flag anything outside the safe-scheme allowlist
  const uriSchemes = []
  const uriRe = /\/URI\s*\(\s*([^)]{1,208})/g
  let m
  while ((m = uriRe.exec(normalized))) {
    const val = m[1].trim()
    const scheme = (val.match(/^([A-Za-z][A-Za-z0-9+.-]*):/) || [])[1]?.toLowerCase()
      || (val.startsWith('\\\\') ? 'unc-path' : '')
    if (scheme) uriSchemes.push(scheme)
    if (uriRe.lastIndex > 200000) break
  }
  const dangerousSchemes = [...new Set(uriSchemes.filter((s) => !SAFE_URI_SCHEMES.has(s)))]
  const httpLinks = uriSchemes.filter((s) => s === 'http' || s === 'https').length

  // Concealed = risky keyword visible only after #XX-decoding (real evasion, e.g. /J#53).
  const RISKY = new Set(['/JS', '/JavaScript', '/AA', '/OpenAction', '/Launch', '/EmbeddedFile',
    '/EmbeddedFiles', '/XFA', '/URI', '/SubmitForm', '/GoToR', '/GoToE', '/ImportData',
    '/ObjStm', '/Encrypt', '/JBIG2Decode', '/RichMedia'])
  const concealedKeywords = NAME_KEYWORDS.filter(
    (k) => RISKY.has(k) && (counts[k] || 0) > (rawCounts[k] || 0),
  )

  return {
    counts,
    concealedKeywords,
    headerAtZero,
    headerVersion,
    eofCount,
    charsAfterEof,
    truncated: bytes.length > SCAN_CAP,
    uriSchemes: [...new Set(uriSchemes)].slice(0, 12),
    dangerousSchemes,
    dangerousUriCount: uriSchemes.filter((s) => !SAFE_URI_SCHEMES.has(s)).length,
    httpLinks,
    entropy: shannonEntropy(bytes),
  }
}

// Weights adapted from pdf-defang _calculate_risk buckets + pdfchecker-style
// severity floors. Level is driven by signal class (like defang); the 0-100
// score is additive with a floor per level (like pdfchecker).
export const SECURITY_WEIGHTS = {
  js: 40, // /JS or /JavaScript — classic exploit carrier
  openAction: 35, // auto-run on open
  aa: 30, // /AA additional actions (auto-execute triggers)
  xfa: 30, // legacy XML-forms attack surface
  launch: 35, // /Launch, /ImportData, /GoToR, /GoToE
  formExfil: 15, // /SubmitForm, /ResetForm
  dangerousUri: 35, // javascript:/file:/data:/vbscript:/UNC…
  embedded: 20, // /EmbeddedFile(s)
  richMedia: 20, // Flash/multimedia legacy exploits
  jbig2: 20, // CVE-2009-0658 pattern
  objstm: 10, // object streams can hide objects
  concealed: 15, // #XX-encoded RISKY keyword — active evasion, not incidental encoding
  headerAnomaly: 10,
  trailingData: 10, // data after %%EOF (may be benign incremental update)
  encrypted: 10, // can't fully inspect content
}

export function scoreTriage(t) {
  const W = SECURITY_WEIGHTS
  const c = t.counts
  const findings = []
  const push = (key, present, severity, weight, label) => {
    findings.push({ key, present, severity, weight: present ? weight : 0, label })
  }

  const jsCount = (c['/JS'] || 0) + (c['/JavaScript'] || 0)
  push('js', jsCount > 0, 'high', W.js,
    jsCount > 0 ? `Embedded JavaScript found (${jsCount}×)` : 'No embedded JavaScript')
  push('openAction', (c['/OpenAction'] || 0) > 0, 'high', W.openAction,
    (c['/OpenAction'] || 0) > 0 ? 'Auto-action on open (/OpenAction)' : 'No open auto-action')
  push('aa', (c['/AA'] || 0) > 0, 'high', W.aa,
    (c['/AA'] || 0) > 0 ? `Auto-execute triggers (/AA ×${c['/AA']})` : 'No auto-execute triggers')
  push('xfa', (c['/XFA'] || 0) > 0, 'high', W.xfa,
    (c['/XFA'] || 0) > 0 ? 'Legacy XML form (XFA) present' : 'No XFA form')

  const launchCount = (c['/Launch'] || 0) + (c['/ImportData'] || 0) + (c['/GoToR'] || 0) + (c['/GoToE'] || 0)
  push('launch', launchCount > 0, 'high', W.launch,
    launchCount > 0 ? `External-launch actions (${launchCount}×: Launch/ImportData/GoToR/GoToE)` : 'No launch actions')
  const exfilCount = (c['/SubmitForm'] || 0)
  push('formExfil', exfilCount > 0, 'medium', W.formExfil,
    exfilCount > 0 ? `Form submits data outward (/SubmitForm ×${exfilCount})` : 'No outbound form actions')

  push('dangerousUri', t.dangerousUriCount > 0, 'high', W.dangerousUri,
    t.dangerousUriCount > 0
      ? `Risky link targets (${t.dangerousUriCount}×: ${t.dangerousSchemes.join(', ')})`
      : t.httpLinks > 0 ? `Links look standard (${t.httpLinks}× http/https)` : 'No risky link targets')

  const embCount = (c['/EmbeddedFile'] || 0) + (c['/EmbeddedFiles'] || 0)
  push('embedded', embCount > 0, 'medium', W.embedded,
    embCount > 0 ? `Embedded files detected (${embCount}×)` : 'No embedded files')
  push('richMedia', (c['/RichMedia'] || 0) > 0, 'medium', W.richMedia,
    (c['/RichMedia'] || 0) > 0 ? 'RichMedia / Flash content present' : 'No RichMedia content')
  push('jbig2', (c['/JBIG2Decode'] || 0) > 0, 'medium', W.jbig2,
    (c['/JBIG2Decode'] || 0) > 0 ? 'JBIG2 compression (known exploit vector)' : 'No JBIG2 compression')
  push('objstm', (c['/ObjStm'] || 0) > 0, 'low', W.objstm,
    (c['/ObjStm'] || 0) > 0 ? `Compressed object streams (${c['/ObjStm']}× — can hide objects)` : 'No hidden object streams')
  push('concealed', t.concealedKeywords.length > 0, 'medium', W.concealed,
    t.concealedKeywords.length > 0
      ? `Hidden risky keywords (${t.concealedKeywords.join(', ')} — #XX-encoded evasion)`
      : 'No hidden keywords')

  const headerBad = !t.headerAtZero || t.eofCount === 0
  push('header', headerBad, 'low', W.headerAnomaly,
    headerBad ? 'Malformed header or missing %%EOF' : 'Header and structure look normal')
  push('trailing', t.charsAfterEof > 32, 'low', W.trailingData,
    t.charsAfterEof > 32 ? `Appended data after %%EOF (${t.charsAfterEof} chars — revisions or tampering)` : 'No appended data')
  push('encrypt', (c['/Encrypt'] || 0) > 0, 'low', W.encrypted,
    (c['/Encrypt'] || 0) > 0 ? 'Encrypted / access-restricted (content partly uninspectable)' : 'Not encrypted')

  const hasHigh = findings.some((f) => f.present && f.severity === 'high')
  // pdfid wisdom: JS + auto-action together is the classic malicious pattern
  const jsAutoCombo = jsCount > 0 && ((c['/OpenAction'] || 0) > 0 || (c['/AA'] || 0) > 0)
  const hasMedium = findings.some((f) => f.present && f.severity === 'medium')
  const hasLow = findings.some((f) => f.present && f.severity === 'low')

  let level = 'none'
  if (hasHigh || jsAutoCombo) level = 'high'
  else if (hasMedium) level = 'medium'
  else if (hasLow) level = 'low'

  let score = Math.min(100, findings.reduce((s, f) => s + f.weight, 0))
  if (jsAutoCombo) score = Math.min(100, score + 15)
  if (level === 'high') score = Math.max(score, 60) // severity floors (pdfchecker-style)
  else if (level === 'medium') score = Math.max(score, 30)
  else if (level === 'low') score = Math.max(score, 10)

  const topRisks = findings
    .filter((f) => f.present)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((f) => f.label)

  const META = {
    none: {
      badge: 'SAFE',
      headline: 'Secure — no malicious signals found',
      summary: 'Static triage found no JavaScript, auto-actions, embedded files, or risky links. This file looks safe to open.',
    },
    low: {
      badge: 'LOW RISK',
      headline: 'Looks safe — minor flags worth a glance',
      summary: `Only low-severity notes (${topRisks.join('; ') || 'structural quirks'}). Nothing indicates malice, but skim the details below.`,
    },
    medium: {
      badge: 'REVIEW',
      headline: 'Needs review — suspicious features detected',
      summary: `Found: ${topRisks.join('; ')}. Review before trusting this file — disable JavaScript in your reader or sanitize it first.`,
    },
    high: {
      badge: 'RISKY',
      headline: jsAutoCombo
        ? 'Risky — auto-running script detected, do not open blindly'
        : 'Risky — malicious indicators detected, do not open blindly',
      summary: `Found: ${topRisks.join('; ')}. These are the same features abused by malicious PDFs. Open only in a sandboxed viewer with JavaScript disabled.`,
    },
  }[level]

  return {
    level, score,
    badge: META.badge,
    headline: META.headline,
    summary: META.summary,
    findings,
    keywords: {
      js: jsCount, openAction: c['/OpenAction'] || 0, aa: c['/AA'] || 0,
      launch: launchCount, embedded: embCount, xfa: c['/XFA'] || 0,
      uri: c['/URI'] || 0, objstm: c['/ObjStm'] || 0, encrypt: c['/Encrypt'] || 0,
    },
    header: {
      atZero: t.headerAtZero, version: t.headerVersion,
      eofCount: t.eofCount, charsAfterEof: t.charsAfterEof,
      concealedKeywords: t.concealedKeywords, entropy: +t.entropy.toFixed(2),
      truncated: t.truncated,
    },
  }
}
