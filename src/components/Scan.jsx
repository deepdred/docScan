import UploadCard from './UploadCard'
import { openWorkbench } from '../lib/docStore'
import './Scan.scss'

const STEPS = [
  { n: '1', title: 'Upload doc', desc: 'Drop your PDF securely' },
  { n: '2', title: 'AI scans PDF', desc: 'Instant private analysis' },
  { n: '3', title: 'Get results', desc: 'View clear scan results' },
]

export default function Scan() {
  return (
    <section className="scan">
      <div className="wrap scan__inner">
        <h1 className="scan__title">Scan a PDF.</h1>
        <p className="scan__sub">Drop your file below — checked instantly, in private.</p>
        <div className="scan__upload">
          <UploadCard onSelect={openWorkbench} />
        </div>
        <div className="scan__steps" aria-label="How it works">
          {STEPS.map((s) => (
            <div className="scan__step" key={s.n}>
              <div className="scan__circle" aria-hidden="true">{s.n}</div>
              <div className="scan__step-title">{s.title}</div>
              <div className="scan__step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
