import { useEffect, useRef, useState } from 'react'
import './UploadCard.scss'

const MAX_MB = 25
const MAX_BYTES = MAX_MB * 1024 * 1024

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const isPdf = (f) => /\.pdf$/i.test(f.name || '')

export default function UploadCard({ onSelect }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const timers = useRef([])

  // Progress timers must not outlive the component (e.g. after navigating to the workbench).
  useEffect(() => () => {
    timers.current.forEach((t) => clearInterval(t))
    timers.current = []
  }, [])

  const pushFiles = (list) => {
    const arr = Array.from(list || [])
    if (!arr.length) return
    let ok = false
    let firstValid = null
    arr.forEach((f) => {
      if (!isPdf(f)) { setError(`"${f.name}" is not a PDF. PDF files only.`); return }
      if (f.size > MAX_BYTES) { setError(`"${f.name}" exceeds ${MAX_MB} MB.`); return }
      if (f.size === 0) { setError(`"${f.name}" appears empty.`); return }
      ok = true
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const rec = { id, name: f.name, size: f.size, progress: 0, done: false, file: f, objectUrl: URL.createObjectURL(f) }
      if (!firstValid) firstValid = rec
      setFiles((prev) => [rec, ...prev])
      // simulated secure-upload progress
      let p = 0
      const t = setInterval(() => {
        p += 14 + Math.random() * 26
        if (p >= 100) {
          clearInterval(t)
          setFiles((prev) => prev.map((x) => (x.id === id ? { ...x, progress: 100, done: true } : x)))
        } else {
          setFiles((prev) => prev.map((x) => (x.id === id ? { ...x, progress: Math.floor(p) } : x)))
        }
      }, 220)
      timers.current.push(t)
    })
    if (ok) setError('')
    // open workbench immediately for the uploaded PDF
    if (firstValid && onSelect) onSelect(firstValid)
  }

  return (
    <div className="console" id="scan">
      <div
        className={`drop ${dragging ? 'drop--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF — drag and drop or click to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pushFiles(e.dataTransfer?.files) }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => { pushFiles(e.target.files); e.target.value = '' }}
        />
        <div className="drop__icon">
          <svg width="36" height="36" viewBox="0 0 44 44" fill="none">
            <rect x="1" y="1" width="42" height="42" rx="12" fill="#F0EEE9" />
            <path d="M22 28.5V18.5M22 18.5L18.5 22M22 18.5L25.5 22" stroke="#17171C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15.5 27.5C14.5 27.5 13.5 26.9 13.2 25.9C12.9 24.9 13.4 23.8 14.3 23.3" stroke="#93939F" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M28.5 27.5C29.5 27.5 30.5 26.9 30.8 25.9C31.1 24.9 30.6 23.8 29.7 23.3" stroke="#93939F" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <p className="drop__title"><strong>Drag &amp; drop your PDF here</strong> or <span className="drop__browse">click to browse</span></p>
        <p className="drop__hint">PDF only · Max {MAX_MB} MB</p>
      </div>

      {files.length > 0 && (
        <div className="files" aria-live="polite">
          {files.map((f) => (
            <div key={f.id} className="file">
              <div className="file__badge">PDF</div>
              <div className="file__meta">
                <div className="file__name" title={f.name}>{f.name}</div>
                <div className="file__sub">{f.done ? formatSize(f.size) : `${formatSize(f.size)} · ${f.progress}%`}</div>
                <div className="file__bar"><i style={{ width: `${f.progress}%` }} /></div>
              </div>
              <button className="file__remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}>×</button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="console__error" role="alert">{error}</p>}
    </div>
  )
}
