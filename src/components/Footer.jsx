import Logo from './Logo'
import './Footer.scss'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        <span className="footer__brand"><Logo size={22} inverted />DocSecure</span>
        <span className="footer__note">© 2026 · Private by default</span>
      </div>
    </footer>
  )
}
