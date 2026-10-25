import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzePdf, formatSize } from '../lib/pdfTools'
import { analyzeWithCohere } from '../lib/cohere'
import { saveDocToLocalStorage } from '../lib/storage'
import './Workbench.scss'

// Completed scan results, keyed by doc id. Restoring from here means
// navigating away/back never re-runs analysis or spends another AI call.
const scanCache = new Map()

export default function Workbench({ doc }) {
  const [phase, setPhase] = useState('starting') // starting | analyzing | ai | done | error
  const [log, setLog] = useState(['Queued scan…'])
  const [analysis, setAnalysis] = useState(null)
  const [ai, setAi] = useState({ status: 'idle', report: '', error: '' })
  const [saveState, setSaveState] = useState({ status: 'idle', msg: '' })

  // Stable primitive key — the effect must fire once per document, never on re-renders.
  const runKey = doc?.id ?? `${doc?.name || 'doc'}-${doc?.size || 0}`
  const startedFor = useRef(null)

  const objectUrl = useMemo(() => doc?.objectUrl || (doc?.file ? URL.createObjectURL(doc.file) : ''), [doc])

  useEffect(() => {
    if (!doc?.file) { setPhase('error'); return }
    // Same document re-render (or StrictMode second pass with a finished run): skip.
    if (startedFor.current === runKey) return
    // Instant restore — no re-analysis, no extra AI call.
    const cached = scanCache.get(runKey)
    if (cached) {
      startedFor.current = runKey
      setAnalysis(cached.analysis)
      setAi(cached.ai)
      setLog(cached.log)
      setPhase('done')
      return
    }
    startedFor.current = runKey
    // Fresh scan for a new document: reset instead of appending to the old log.
    setLog(['Queued scan…'])
    setAnalysis(null)
    setAi({ status: 'idle', report: '', error: '' })
    setSaveState({ status: 'idle', msg: '' })
    setPhase('starting')

    let cancelled = false
    let completed = false
    async function run() {
      try {
        setPhase('analyzing')
        setLog((l) => [...l, 'Hashing (SHA-256)…'])
        const result = await analyzePdf(doc.file)
        if (cancelled) return
        setAnalysis(result)
        setLog((l) => [...l, `Extracted ${result.pages} page(s), ${result.words.toLocaleString()} words.`, 'Asking Cohere AI…'])
        setPhase('ai')
        setAi({ status: 'loading', report: '', error: '' })
        // The single AI call for this scan: final report only.
        const aiRes = await analyzeWithCohere({
          fileName: doc.name,
          metadata: result.metadata,
          stats: { pages: result.pages, words: result.words, hash: result.hash, checks: result.checks, security: result.security },
          text: result.text,
        })
        if (cancelled) return
        let finalAi
        let finalLogTail
        if (aiRes.ok) {
          finalAi = { status: 'done', report: aiRes.report, error: '' }
          finalLogTail = `AI report ready (${aiRes.model}).`
        } else {
          finalAi = { status: 'error', report: '', error: aiRes.error }
          finalLogTail = `AI failed: ${aiRes.error} — local report still available.`
        }
        setAi(finalAi)
        setLog((l) => {
          const next = [...l, finalLogTail]
          if (scanCache.size > 20) scanCache.delete(scanCache.keys().next().value)
          scanCache.set(runKey, { analysis: result, ai: finalAi, log: next })
          return next
        })
        setPhase('done')
        completed = true
      } catch (e) {
        if (!cancelled) {
          setPhase('error')
          setLog((l) => [...l, `Scan failed: ${e?.message || e}`])
          completed = true
        }
      }
    }
    run()
    return () => {
      cancelled = true
      // Unfinished pass (e.g. StrictMode dev double-mount): let the next mount run it.
      if (!completed) startedFor.current = null
    }
  }, [runKey])

  const handleSave = async () => {
    if (!analysis) return
    setSaveState({ status: 'saving', msg: 'Saving…' })
    const res = await saveDocToLocalStorage({
      file: doc.file, name: doc.name, size: doc.size,
      hash: analysis.hash, analysis, aiReport: ai.report,
    })
    if (res.ok) setSaveState({ status: 'saved', msg: res.warning || (res.embedded ? 'Saved to local storage (with file).' : 'Saved to local storage (report only).') })
    else setSaveState({ status: 'error', msg: res.error })
  }

  if (!doc) return null
  const busy = phase === 'analyzing' || phase === 'ai' || phase === 'starting'

  return (
    <div className="wb" aria-live="polite">
      <div className="wb__actions">
        {saveState.msg && <p className={`wb__savemsg wb__savemsg--${saveState.status}`}>{saveState.msg}</p>}
        <button className="btn btn--primary btn--sm" disabled={!analysis || saveState.status === 'saving'} onClick={handleSave}>
          {saveState.status === 'saved' ? '✓ Saved' : saveState.status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="wb__grid">
        <div className="wb__preview">
          {objectUrl
            ? <iframe src={objectUrl} title={`Preview of ${doc.name}`} className="wb__frame" />
            : <div className="wb__empty">No preview available.</div>}
        </div>

        <div className="wb__report">
          {analysis?.security ? (
            <div className={`wb__verdict wb__verdict--${analysis.security.level}`} role="status">
              <span className="wb__verdict-wave" aria-hidden="true">
                <svg viewBox="0 0 20 120" preserveAspectRatio="none">
                  <path className="wb__verdict-wavefill" d="M0 0 H12 C 15 20, 9 40, 12 60 C 15 80, 9 100, 12 120 H0 Z" />
                  <path className="wb__verdict-waveline" d="M12 0 C 15 20, 9 40, 12 60 C 15 80, 9 100, 12 120" />
                </svg>
              </span>
              <div className="wb__verdict-body">
                <div className="wb__verdict-status">
                  <span className="wb__verdict-dot" />
                  <span className="wb__verdict-label">{analysis.security.badge}</span>
                </div>
                <strong className="wb__verdict-headline">{analysis.security.headline}</strong>
                <p className="wb__verdict-summary">{analysis.security.summary}</p>
              </div>
            </div>
          ) : null}

          <div className="wb__card">
            <h3>Scan progress</h3>
            <ul className="wb__log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            {busy && <div className="wb__bar-anim"><i /></div>}
          </div>

          <div className="wb__card">
            <h3>File identity</h3>
            {!analysis ? <p className="wb__muted">Hashing…</p> : (
              <>
                <div className="wb__row"><span>SHA-256</span><code title={analysis.hash}>{analysis.hash.slice(0, 32)}…</code></div>
                <div className="wb__row"><span>Size</span><span>{formatSize(doc.size)}</span></div>
                <div className="wb__row"><span>Pages</span><span>{analysis.pages}</span></div>
                <button className="wb__copy" onClick={() => navigator.clipboard?.writeText(analysis.hash)}>Copy full hash</button>
              </>
            )}
          </div>

          <div className="wb__card">
            <h3>Metadata</h3>
            {!analysis ? <p className="wb__muted">Reading…</p> : (
              <dl className="wb__meta">
                <div><dt>File name</dt><dd title={doc.name}>{doc.name}</dd></div>
                <div><dt>Size</dt><dd>{formatSize(doc.size)}</dd></div>
                <div><dt>Pages</dt><dd>{analysis.pages}</dd></div>
                {Object.entries(analysis.metadata).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>
                ))}
              </dl>
            )}
          </div>

          <div className="wb__card">
            <h3>Content safety</h3>
            {!analysis ? <p className="wb__muted">Checking…</p> : (
              <ul className="wb__checks">
                {analysis.checks.map((c) => (
                  <li key={c.key} className={`wb__check wb__check--${c.status}`}>
                    <span className="wb__dot" />{c.label}{c.detail ? <em> — {c.detail}</em> : null}
                  </li>
                ))}
              </ul>
            )}
            {analysis?.isScanned && <p className="wb__warn">Scanned-image PDF: text layer empty. OCR (e.g. Tesseract.js) recommended as next step.</p>}
          </div>

          <div className="wb__card wb__card--ai">
            <h3>AI report <span className="wb__pill">Cohere</span></h3>
            {ai.status === 'idle' || ai.status === 'loading'
              ? <p className="wb__muted">{analysis ? 'Generating with Cohere…' : 'Waiting for extraction…'}</p>
              : ai.status === 'done'
                ? <pre className="wb__ai">{ai.report}</pre>
                : <p className="wb__error">AI unavailable: {ai.error}. Local hash / metadata / safety above still valid.</p>}
          </div>

          {analysis && (
            <div className="wb__card">
              <h3>Extracted text {analysis.words ? `(${analysis.words.toLocaleString()} words)` : ''}</h3>
              <pre className="wb__text">{analysis.text?.slice(0, 3000) || '(no selectable text)'}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
