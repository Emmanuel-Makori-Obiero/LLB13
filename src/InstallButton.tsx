import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, X } from 'lucide-react'
import './install.css'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

// One shared store, so every InstallButton on screen sees the same browser prompt.
let deferredPrompt: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

if (typeof window !== 'undefined') {
  installed = isStandalone()
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    emit()
  })
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => (installed ? 'installed' : deferredPrompt ? 'ready' : 'manual')

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export default function InstallButton({ className = 'secondary-button', label = 'Download app' }: { className?: string; label?: string }) {
  const state = useSyncExternalStore(subscribe, snapshot)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (!help) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setHelp(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [help])

  if (state === 'installed') return null

  const install = async () => {
    if (!deferredPrompt) { setHelp(true); return }
    const prompt = deferredPrompt
    deferredPrompt = null
    emit()
    await prompt.prompt()
    await prompt.userChoice
  }

  return (
    <>
      <button className={className} onClick={() => void install()}><Download size={14} /> {label}</button>
      {help && (
        <div className="form-overlay" onClick={() => setHelp(false)}>
          <div className="form-card" role="dialog" aria-label="Install Group 13" onClick={event => event.stopPropagation()}>
            <div className="detail-title">
              <h2>Install Group 13</h2>
              <button className="icon-button" onClick={() => setHelp(false)} aria-label="Close"><X size={16} /></button>
            </div>
            {isIos() ? (
              <ol className="install-steps">
                <li>Open this page in <strong>Safari</strong>.</li>
                <li>Tap the <strong>Share</strong> button (the square with an arrow).</li>
                <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
              </ol>
            ) : (
              <ol className="install-steps">
                <li><strong>Android (Chrome):</strong> tap the ⋮ menu, then <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li><strong>Windows / Mac (Chrome or Edge):</strong> click the install icon at the right of the address bar, or open the browser menu and choose <strong>Install Group 13</strong>.</li>
                <li><strong>iPhone / iPad:</strong> open in Safari, tap Share, then <strong>Add to Home Screen</strong>.</li>
              </ol>
            )}
            <p className="field-hint">Group 13 then opens in its own window with its own icon, like any other app.</p>
          </div>
        </div>
      )}
    </>
  )
}
