// In-memory store for the active PDF (File handles can't go in the URL).
let activeDoc = null
const listeners = new Set()

export function setActiveDoc(doc) {
  if (activeDoc?.objectUrl && doc?.objectUrl !== activeDoc.objectUrl) {
    try { URL.revokeObjectURL(activeDoc.objectUrl) } catch { /* ignore */ }
  }
  activeDoc = doc || null
  listeners.forEach((fn) => fn(activeDoc))
}

export function getActiveDoc() {
  return activeDoc
}

export function subscribeActiveDoc(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function openWorkbench(doc) {
  setActiveDoc(doc)
  window.location.hash = '#/workbench'
}
