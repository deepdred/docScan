import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Scan from './components/Scan'
import Saved from './components/Saved'
import WorkbenchPage from './components/WorkbenchPage'
import Footer from './components/Footer'
import './styles/main.scss'

function getRoute() {
  if (typeof window === 'undefined') return 'home'
  if (window.location.hash.startsWith('#/workbench')) return 'workbench'
  if (window.location.hash.startsWith('#/scan')) return 'scan'
  if (window.location.hash.startsWith('#/saved')) return 'saved'
  return 'home'
}

export default function App() {
  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const onHash = () => {
      setRoute(getRoute())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="page" id="top">
      <Navbar route={route === 'workbench' ? 'scan' : route} />
      <main>
        {route === 'workbench' ? <WorkbenchPage /> : route === 'scan' ? <Scan /> : route === 'saved' ? <Saved /> : <Hero />}
      </main>
      <Footer />
    </div>
  )
}
