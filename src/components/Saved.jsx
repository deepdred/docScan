import { useEffect, useRef, useState } from 'react'
import { listSavedDocs, getSavedDoc, deleteSavedDoc } from '../lib/storage'
import { openWorkbench } from '../lib/docStore'
import { verifyFileAgainstSaved } from '../lib/verify'
import { formatSize } from '../lib/pdfTools'
import ConfirmDialog from './ConfirmDialog'
import './Saved.scss'

function idFromHash() {
  const m = window.location.hash.match(/^#\/saved\/([^/]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso || ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
  } catch { return iso || '' }
}

async function dataUrlToFile(dataUrl, name) {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], name || 'document.pdf', { type: 'application/pdf' })
}

export default function Saved() {
  const [docs, setDocs] = useState(() => listSavedDocs())
  const [selId, setSelId] = useState(() => idFromHash())
  const [verify, setVerify] = useState({ status: 'idle', result: null }) // idle | busy | done
  const [pendingDelete, setPendingDelete] = useState(null) // record awaiting delete confirmation
  const fileRef = useRef(null)

  useEffect(() => {
    const onHash = () => {
      setSelId(idFromHash())
      setDocs(listSavedDocs())
      setVerify({ status: 'idle', result: null })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = (id) => { window.location.hash = `#/saved/${encodeURIComponent(id)}` }
  const back = () => { window.location.hash = '#/saved' }

  const remove = (rec) => setPendingDelete(rec)

  const confirmDelete = () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    deleteSavedDoc(id)
    setDocs(listSavedDocs())
    setPendingDelete(null)
    if (selId === id) back()
  }

  const openInWorkbench = async (rec) => {
    if (!rec.dataUrl) return
    const file = await dataUrlToFile(rec.dataUrl, rec.name)
    openWorkbench({
      id: `saved-${rec.id}-${Date.now()}`,
      name: rec.name, size: file.size, file,
      objectUrl: URL.createObjectURL(file),
    })
  }

  const runVerify = async (rec, file) => {
    if (!file) return
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    setVerify({ status: 'busy', step: 'Hashing re-uploaded file…', result: null })
    const pending = verifyFileAgainstSaved(file, rec) // local re-scan starts at once
    await sleep(700)
    setVerify({ status: 'busy', step: 'Comparing safety signals…', result: null })
    await sleep(700)
    const result = await pending
    setVerify({ status: 'busy', step: 'Finalizing verdict…', result: null })
    await sleep(500)
    setVerify({ status: 'done', result })
  }

  // ---- detail view ----
  if (selId) {
    const rec = getSavedDoc(selId)
    if (!rec) {
      return (
        <section className="scan"><div className="wrap scan__inner">
          <h1 className="scan__title">Not found.</h1>
          <p className="scan__sub">This saved report no longer exists.</p>
          <a href="#/saved" className="btn btn--primary">Back to Saved</a>
        </div></section>
      )
    }
    const sec = rec.security
    return (
      <section className="saved">
        <div className="wrap saved__inner">
          <button className="saved__back" onClick={back}>← All saved</button>
          <h1 className="saved__title" title={rec.name}>{rec.name}</h1>
          <p className="saved__sub">Saved {fmtDate(rec.savedAt)} · {formatSize(rec.size)} · {rec.pages} page(s)</p>

          <div className="saved__actions">
            {rec.dataUrl && <button className="btn btn--primary btn--sm" onClick={() => openInWorkbench(rec)}>Open in workbench</button>}
            <button className="btn btn--primary btn--sm" aria-label={`Delete ${rec.name}`} title="Delete saved report" onClick={() => remove(rec)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete</span>
            </button>
          </div>

          {sec ? (
            <div className={`saved__verdict saved__verdict--${sec.level}`} role="status">
              <span className="saved__verdict-wave" aria-hidden="true">
                <svg viewBox="0 0 20 120" preserveAspectRatio="none">
                  <path className="saved__verdict-wavefill" d="M0 0 H12 C 15 20, 9 40, 12 60 C 15 80, 9 100, 12 120 H0 Z" />
                  <path className="saved__verdict-waveline" d="M12 0 C 15 20, 9 40, 12 60 C 15 80, 9 100, 12 120" />
                </svg>
              </span>
              <div className="saved__verdict-body">
                <div className="saved__verdict-status">
                  <span className="saved__verdict-dot" />
                  <span className="saved__verdict-label">{sec.badge}</span>
                </div>
                <strong className="saved__verdict-headline">{sec.headline}</strong>
                <p className="saved__verdict-summary">{sec.summary}</p>
              </div>
            </div>
          ) : (
            <p className="saved__muted">Saved before security scoring existed — checks below still apply.</p>
          )}

          <div className="saved__card">
            <h3>File identity (saved baseline)</h3>
            <div className="saved__row"><span>SHA-256</span><code title={rec.hash}>{rec.hash}</code></div>
            <div className="saved__row"><span>Size</span><span>{formatSize(rec.size)}</span></div>
            <div className="saved__row"><span>Pages / words</span><span>{rec.pages} / {(rec.words || 0).toLocaleString()}</span></div>
          </div>

          <div className="saved__card">
            <h3>Metadata</h3>
            {Object.keys(rec.metadata || {}).filter((k) => rec.metadata[k]).length === 0
              ? <p className="saved__muted">No embedded metadata.</p>
              : <dl className="saved__meta">
                {Object.entries(rec.metadata).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>
                ))}
              </dl>}
          </div>

          <div className="saved__card">
            <h3>Safety checks (saved)</h3>
            <ul className="saved__checks">
              {(rec.checks || []).map((c) => (
                <li key={c.key} className={`saved__check saved__check--${c.status}`}>
                  <span className="saved__dot" />{c.label}{c.detail ? <em> — {c.detail}</em> : null}
                </li>
              ))}
            </ul>
          </div>

          {rec.aiReport && (
            <div className="saved__card">
              <h3>AI report (saved)</h3>
              <pre className="saved__ai">{rec.aiReport}</pre>
            </div>
          )}

          {rec.textPreview && (
            <div className="saved__card">
              <h3>Text preview (saved)</h3>
              <pre className="saved__text">{rec.textPreview.slice(0, 3000)}</pre>
            </div>
          )}

          <div className="saved__card saved__card--verify">
            <h3>Verify integrity</h3>
            <p className="saved__muted">
              Upload the file again — we re-scan it locally (SHA-256 + triage signals from our
              reference logic) and compare against this saved baseline. Same, re-saved, or altered.
            </p>
            <input
              ref={fileRef} type="file" accept=".pdf,application/pdf" hidden
              onChange={(e) => { runVerify(rec, e.target.files?.[0]); e.target.value = '' }}
            />
            <div className="saved__verifyactions">
              <button
                className="btn btn--primary btn--sm"
                disabled={verify.status === 'busy'}
                onClick={() => fileRef.current?.click()}
              >
                {verify.status === 'busy' ? 'Verifying…' : 'Upload file to verify'}
              </button>
            </div>

            {verify.status === 'busy' && (
              <div className="saved__vload" role="status" aria-live="polite">
                <div className="saved__bar-anim"><i /></div>
                <p>{verify.step}</p>
              </div>
            )}

            {verify.status === 'done' && verify.result && (
              <div className={`saved__vres saved__vres--${verify.result.verdict}`} role="status">
                <div className="saved__vres-top">
                  <span className="saved__badge">{verify.result.badge}</span>
                  <strong>{verify.result.headline}</strong>
                </div>
                <p>{verify.result.summary}</p>
                {verify.result.newSecurity && (
                  <p className="saved__muted">
                    Re-scan risk: {verify.result.newSecurity.badge} ({verify.result.newSecurity.score}/100) — {verify.result.newSecurity.headline}
                  </p>
                )}
                {verify.result.rows.length > 0 && (
                  <table className="saved__table">
                    <thead><tr><th>Compared</th><th>Saved</th><th>Re-uploaded</th><th /></tr></thead>
                    <tbody>
                      {verify.result.rows.map((r, i) => (
                        <tr key={i} className={r.match ? '' : 'saved__rowdiff'}>
                          <td>{r.label}</td>
                          <td><code>{r.saved}</code></td>
                          <td><code>{r.current}</code></td>
                          <td>{r.match ? '✓' : '✗'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
        {pendingDelete && (
          <ConfirmDialog
            title="Delete saved report?"
            message={`“${pendingDelete.name}” and its scan report will be permanently removed from this browser. This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </section>
    )
  }

  // ---- list view ----
  return (
    <section className="saved">
      <div className="wrap saved__inner">
        <h1 className="saved__title">Saved files.</h1>
        <p className="saved__sub">Every saved scan and its report — open one to review or verify it.</p>
        {docs.length === 0 ? (
          <div className="saved__empty">
            <p>Nothing saved yet. Scan a PDF and hit <strong>Save</strong> in the workbench.</p>
            <a href="#/scan" className="btn btn--primary">Go to Scan</a>
          </div>
        ) : (
          <ul className="saved__list">
            {docs.map((d) => (
              <li key={d.id} className="saved__item">
                <button className="saved__main" onClick={() => open(d.id)} title={`Open ${d.name}`}>
                  <span className="saved__thumb" aria-hidden="true">PDF</span>
                  <span className="saved__text">
                    <span className="saved__name">{d.name}</span>
                    <span className="saved__detail">
                      {fmtDate(d.savedAt)} · {formatSize(d.size)} · {d.pages} page(s) · <code>{(d.hash || '').slice(0, 12)}…</code>
                    </span>
                  </span>
                </button>
                <span className="saved__side">
                  {d.security && <span className={`saved__badge saved__badge--${d.security.level}`}>{d.security.badge}</span>}
                  <button
                    className="saved__iconbtn saved__iconbtn--quiet"
                    aria-label={`Delete ${d.name}`}
                    title="Delete saved report"
                    onClick={() => remove(d)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title="Delete saved report?"
          message={`“${pendingDelete.name}” and its scan report will be permanently removed from this browser. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}
