// Document analysis: hashing + metadata/text via pdf.js, security via ./pdfTriage
// (triage logic ported from ref/ — see ref/README.md and pdfTriage.js header).
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { triageBuffer, scoreTriage, sha256Hex } from './pdfTriage'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { sha256Hex }

export async function analyzePdf(file) {
  const buf = await file.arrayBuffer()
  const hash = await sha256Hex(buf.slice(0))
  const security = scoreTriage(triageBuffer(buf.slice(0)))

  let doc = null
  let metadata = {}
  let pages = 0
  let text = ''
  let textPages = 0
  let encrypted = (security.keywords.encrypt || 0) > 0
  try {
    doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
    pages = doc.numPages
    encrypted = false
    try {
      const meta = await doc.getMetadata().catch(() => null)
      if (meta?.info) {
        const i = meta.info
        metadata = {
          title: i.Title || '',
          author: i.Author || '',
          creator: i.Creator || '',
          producer: i.Producer || '',
          subject: i.Subject || '',
          keywords: i.Keywords || '',
          creationDate: i.CreationDate || '',
          modDate: i.ModDate || '',
        }
      }
    } catch { /* ignore */ }
    const maxPages = Math.min(pages, 5)
    const parts = []
    for (let p = 1; p <= maxPages; p++) {
      try {
        const page = await doc.getPage(p)
        const tc = await page.getTextContent()
        const str = (tc.items || []).map((it) => it.str || '').join(' ')
        if (str.trim()) { parts.push(str); textPages++ }
      } catch { /* skip page */ }
    }
    text = parts.join('\n\n').slice(0, 20000)
  } catch (e) {
    // Encrypted / unparseable PDFs still get hash + triage instead of a hard error
    if (/password|encrypt/i.test(e?.message || e?.name || '')) encrypted = true
    if (!encrypted && !pages) {
      // Re-throw only for genuinely unreadable non-PDF blobs if triage also looks empty
      if (security.header.eofCount === 0 && !security.header.atZero) throw e
    }
  } finally {
    try { await doc?.destroy() } catch { /* ignore */ }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const isScanned = pages > 0 && text.trim().length < 50
  const checks = [
    { key: 'hash', label: 'SHA-256 computed', status: 'pass', detail: `${hash.slice(0, 16)}…` },
    { key: 'pages', label: encrypted && !pages ? 'Encrypted — pages unreadable without password' : pages ? `${pages} page${pages > 1 ? 's' : ''} readable` : 'Could not read pages', status: pages ? 'pass' : 'warn' },
    { key: 'text', label: isScanned ? 'Scanned image — needs OCR' : `${words.toLocaleString()} words extracted`, status: isScanned ? 'warn' : 'pass' },
    ...security.findings.map((f) => ({
      key: f.key,
      label: f.label,
      status: f.present ? 'warn' : 'pass',
      detail: f.present ? `${f.severity} risk · +${f.weight}` : '',
    })),
  ]

  return { hash, pages, metadata, text, words, chars: text.length, textPages, isScanned, encrypted, checks, security }
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
