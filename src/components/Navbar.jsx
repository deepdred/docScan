import { useState } from 'react'
import Logo from './Logo'
import './Navbar.scss'

const LINKS = [
  { key: 'home', label: 'Home', href: '#/' },
  { key: 'scan', label: 'Scan', href: '#/scan' },
  { key: 'saved', label: 'Saved', href: '#/saved' },
]

export default function Navbar({ route }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="nav">
      <div className="nav__inner">
        <a href="#/" className="nav__brand" aria-label="DocSecure home">
          <Logo size={30} />
          <span className="nav__wordmark">DocSecure</span>
        </a>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              className={`nav__top-link ${route === l.key ? 'nav__top-link--active' : ''}`}
              aria-current={route === l.key ? 'page' : undefined}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <button
          className="nav__burger"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>
      </div>

      {mobileOpen && (
        <div className="mobile">
          {LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              className={`mobile__link ${route === l.key ? 'mobile__link--active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  )
}
