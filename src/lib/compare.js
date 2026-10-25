// Pure offline comparison: saved baseline vs fresh analysis. No AI, no pdf.js —
// dependency-free so it runs in node tests and stays cheap in the browser.
import { sha256Hex } from './pdfTriage.js'

const te = new TextEncoder()

async function textHash(s) {
  return sha256Hex(te.encode(s || '').buffer)
}

function short(v, n = 60) {
  const s = String(v ?? '')
  return s.length > n ? s.slice(0, n) + '…' : s
}

export async function compareAnalyses(saved, current, currentFileSize) {
  const rows = []
  const row = (label, a, b) => rows.push({ label, saved: short(a), current: short(b), match: String(a ?? '') === String(b ?? '') })

  // 1) exact bytes
  row('SHA-256', saved.hash, current.hash)
  const identical = (saved.hash || '').toLowerCase() === (current.hash || '').toLowerCase()
  row('File size (bytes)', saved.size, currentFileSize)
  row('Pages', saved.pages, current.pages)

  // 2) text content (first 4k chars — same window we stored)
  const savedTextH = await textHash(saved.textPreview || '')
  const currentTextH = await textHash((current.text || '').slice(0, 4000))
  rows.push({
    label: 'Text content',
    saved: saved.textPreview ? `hash ${savedTextH.slice(0, 16)}…` : '(no baseline)',
    current: `hash ${currentTextH.slice(0, 16)}…`,
    match: !!saved.textPreview && savedTextH === currentTextH,
  })
  const textSame = !!saved.textPreview && savedTextH === currentTextH

  // 3) metadata fields
  const metaKeys = [...new Set([...Object.keys(saved.metadata || {}), ...Object.keys(current.metadata || {})])]
  let metaChanged = false
  for (const k of metaKeys) {
    const a = (saved.metadata || {})[k] || ''
    const b = (current.metadata || {})[k] || ''
    const match = a === b
    if (!match) metaChanged = true
    rows.push({ label: `Metadata · ${k}`, saved: short(a) || '(empty)', current: short(b) || '(empty)', match })
  }

  // 4) triage security signals (ref-repo logic: keyword counts + level)
  let secChanged = false
  let secBaseline = true
  const sk = saved.security?.keywords
  if (sk) {
    for (const k of Object.keys({ ...sk, ...current.security.keywords })) {
      const a = sk[k] ?? 0
      const b = current.security.keywords[k] ?? 0
      if (a !== b) secChanged = true
      rows.push({ label: `Signal · ${k}`, saved: String(a), current: String(b), match: a === b })
    }
    const levelMatch = saved.security.level === current.security.level
    if (!levelMatch) secChanged = true
    rows.push({ label: 'Risk level', saved: `${saved.security.badge} (${saved.security.score}/100)`, current: `${current.security.badge} (${current.security.score}/100)`, match: levelMatch })
  } else {
    secBaseline = false
  }

  if (identical) {
    return {
      ok: true, verdict: 'IDENTICAL', badge: 'SAME ✓',
      headline: 'Same document — not altered',
      summary: 'SHA-256 matches the saved file exactly. Bytes, content, metadata and safety signals are unchanged.',
      rows, newSecurity: current.security,
    }
  }

  const contentChanged = !textSame || Number(saved.pages) !== Number(current.pages)
  if (!contentChanged && !secChanged) {
    return {
      ok: true, verdict: 'WRAPPER_CHANGED', badge: 'COSMETIC',
      headline: 'Content matches — wrapper changed, not tampered',
      summary: `Text, pages and all safety signals match${metaChanged ? ', but metadata differs' : ''}. The file was likely re-saved or re-exported (timestamps, producer strings, compression) without changing what it says or what it can do.`,
      rows, newSecurity: current.security,
    }
  }

  const changed = []
  if (contentChanged) changed.push('text/pages')
  if (metaChanged) changed.push('metadata')
  if (!secBaseline) changed.push('safety signals (no baseline — saved before scoring existed)')
  else if (secChanged) changed.push('safety signals')
  return {
    ok: true, verdict: 'ALTERED', badge: 'ALTERED ✗',
    headline: 'File differs from the saved version',
    summary: `Changed: ${changed.join(', ')}. Treat this as a different document — review the rows below, especially any new script, launch-action or embedded-file signals.`,
    rows, newSecurity: current.security,
  }
}
