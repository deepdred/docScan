// Cohere AI analysis — browser-direct for prototype only.
// TODO(security): move this to a backend proxy so the API key is not shipped in the bundle.
const FALLBACK_KEY = 'cohere_6cbBJXfzsLTBrQ2po9a5mIAngwroh9bH5zN7rvcj0Rbxns'

export function getCohereKey() {
  return import.meta.env.VITE_COHERE_API_KEY || FALLBACK_KEY
}

const MODEL = import.meta.env.VITE_COHERE_MODEL || 'command-a-plus-05-2026'

function parseChatText(data) {
  try {
    const msg = data?.message?.content
    if (Array.isArray(msg)) return msg.map((c) => c.text || '').join('\n').trim()
    if (typeof data?.text === 'string') return data.text.trim()
    if (typeof data?.message === 'string') return data.message.trim()
  } catch { /* ignore */ }
  return ''
}

export async function analyzeWithCohere({ fileName, metadata, stats, text }) {
  const key = getCohereKey()
  if (!key) return { ok: false, error: 'Missing Cohere API key.' }
  const snippet = (text || '').slice(0, 6000) || '(no selectable text — scanned image PDF, OCR required)'
  const metaLine = Object.entries(metadata || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ') || 'no embedded metadata'

  const sec = stats.security
  const verdictLine = sec ? `Local static verdict: ${sec.badge} (${sec.score}/100 risk) — ${sec.headline}. ${sec.summary}` : ''
  const system = 'You are DocSecure, a document-intelligence assistant. Be concise, factual, and flag uncertainty. Never invent file contents.'
  const user = [
    `File: ${fileName}`,
    `Stats: ${stats.pages || 0} pages, ${stats.words || 0} words, SHA-256 ${stats.hash || ''}`,
    `Metadata: ${metaLine}`,
    verdictLine,
    `Safety flags: ${(stats.checks || []).filter((c) => c.status === 'warn').map((c) => c.label).join('; ') || 'none'}`,
    '',
    'Extracted text (first ~6000 chars):',
    snippet,
    '',
    'Return a clean report with exactly these sections:',
    '1) SUMMARY — 2-3 sentences on what this document appears to be.',
    '2) KEY POINTS — up to 5 bullets (metadata, structure, entities, dates).',
    '3) CONTENT SAFETY — verdict Safe / Review / Risky + one-line reason.',
    '4) NEXT STEPS — one line (e.g. run OCR, save, review embedded objects).',
  ].join('\n')

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 45000)
  try {
    const res = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      // fallback model once for 404/model errors
      if (res.status === 404 && MODEL !== 'command-r-plus-08-2024') {
        return analyzeWithCohereFallback({ fileName, metadata, stats, text }, key)
      }
      return { ok: false, error: `Cohere ${res.status}: ${errText.slice(0, 300) || res.statusText}` }
    }
    const data = await res.json()
    const report = parseChatText(data)
    if (!report) return { ok: false, error: 'Empty response from Cohere.' }
    return { ok: true, report, model: MODEL }
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'Cohere request timed out.' : `Cohere request failed: ${e?.message || e}` }
  } finally {
    clearTimeout(t)
  }
}

async function analyzeWithCohereFallback(input, key) {
  try {
    const res = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'command-r-plus-08-2024',
        messages: [{ role: 'user', content: `Summarize this PDF in 3 sentences and give a safety verdict (Safe/Review/Risky):\n${(input.text || '').slice(0, 4000)}` }],
        temperature: 0.3,
      }),
    })
    if (!res.ok) return { ok: false, error: `Cohere fallback ${res.status}` }
    const data = await res.json()
    return { ok: true, report: parseChatText(data), model: 'command-r-plus-08-2024' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}
