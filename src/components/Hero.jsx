import './Hero.scss'

export default function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero__inner">
        <p className="hero__tag"><span>Drop a PDF · Know what&rsquo;s inside · Keep it yours</span></p>
        <h1 className="hero__title">
          Secure your documents.
        </h1>
        <p className="hero__sub">
          Private PDF scanning — nothing stored, nothing trained.
        </p>
        <a href="#/scan" className="btn btn--primary btn--lg">Scan a PDF</a>
        <div className="hero__flow" aria-hidden="true">
          <span>Drop</span>
          <i className="flow-line" />
          <span>Scan</span>
          <i className="flow-line" />
          <span>Secure</span>
        </div>
      </div>
    </section>
  )
}
