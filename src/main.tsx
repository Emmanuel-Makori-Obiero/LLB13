import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './layout.css'
import './mobile.css'
import './guide.css'
import './assignment-helper.css'

type BoundaryState = { hasError: boolean }

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Group 13 Hub runtime error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f1e8' }}>
        <section style={{ width: 'min(560px, 100%)', padding: 28, border: '1px solid #d7cec0', background: '#fffdf8', color: '#17352d', boxShadow: '0 16px 45px rgba(23,53,45,.12)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7a6b5b' }}>Group 13 Hub</p>
          <h1 style={{ margin: '0 0 12px', fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 500 }}>The page needs a refresh.</h1>
          <p style={{ margin: '0 0 20px', lineHeight: 1.6, color: '#53645d' }}>Your work is normally saved as you go. Refresh the page to recover the workspace and continue where you left off.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '11px 16px', border: 0, background: '#17352d', color: '#fffdf8', cursor: 'pointer', fontWeight: 700 }}>Refresh workspace</button>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
}
