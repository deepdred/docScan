const KEY = 'docsecure_saved_docs'

export function listSavedDocs() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function getSavedDoc(id) {
  try {
    return listSavedDocs().find((d) => d.id === id) || null
  } catch { return null }
}

export function deleteSavedDoc(id) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listSavedDocs().filter((d) => d.id !== id)))
    return true
  } catch { return false }
}

// Saves report + optionally file bytes (small files only — localStorage quota ~5MB).
export async function saveDocToLocalStorage({ file, name, size, hash, analysis, aiReport }) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    size,
    hash,
    pages: analysis?.pages || 0,
    words: analysis?.words || 0,
    metadata: analysis?.metadata || {},
    checks: analysis?.checks || [],
    security: analysis?.security || null, // verdict + triage keywords = baseline for Verify
    textPreview: (analysis?.text || '').slice(0, 4000),
    aiReport: aiReport || '',
    savedAt: new Date().toISOString(),
    dataUrl: null,
  }
  // embed bytes only for small PDFs to avoid quota errors
  try {
    if (file && file.size < 1_800_000) {
      record.dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = reject
        r.readAsDataURL(file)
      })
    }
  } catch { record.dataUrl = null }

  const existing = listSavedDocs()
  existing.unshift(record)
  try {
    localStorage.setItem(KEY, JSON.stringify(existing))
    return { ok: true, id: record.id, embedded: !!record.dataUrl }
  } catch (e) {
    // retry without bytes
    try {
      record.dataUrl = null
      localStorage.setItem(KEY, JSON.stringify([record, ...listSavedDocs()]))
      return { ok: true, id: record.id, embedded: false, warning: 'File bytes skipped (storage quota). Report saved.' }
    } catch (e2) {
      return { ok: false, error: 'localStorage full — could not save. Try a smaller file.' }
    }
  }
}
