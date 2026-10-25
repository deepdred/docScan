import { useEffect, useState } from 'react'
import Workbench from './Workbench'
import { getActiveDoc, subscribeActiveDoc } from '../lib/docStore'
import './WorkbenchPage.scss'

export default function WorkbenchPage() {
  const [doc, setDoc] = useState(() => getActiveDoc())

  useEffect(() => subscribeActiveDoc(setDoc), [])

  return (
    <section className="wbpage">
      <div className="wrap wbpage__inner">
        <a href="#/scan" className="wbpage__back" aria-label="Back to scan">← Back</a>
        {!doc ? (
          <div className="wbpage__empty">
            <h1>No document open.</h1>
            <p>Upload a PDF to open its workbench.</p>
            <a href="#/scan" className="btn btn--primary">Go to Scan</a>
          </div>
        ) : (
          <Workbench doc={doc} />
        )}
      </div>
    </section>
  )
}
