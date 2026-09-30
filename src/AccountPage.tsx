import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { repository } from './data/repository'
import './admin.css'

type Props = {
  email: string
  isAdmin: boolean
  onDeleted: () => void
  setNotice: (notice: string) => void
}

export function DeleteAccountCard({ email, isAdmin, onDeleted, setNotice }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = confirmText.trim() === 'DELETE'

  const remove = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      await repository.deleteMyAccount()
      setNotice('Your account and uploads have been deleted.')
      onDeleted()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete your account.')
      setBusy(false)
    }
  }

  return (
    <div className="card card-pad danger-card">
      <div className="card-header"><span className="section-label">Delete account</span></div>
      {isAdmin ? (
        <div className="callout"><p><strong>Super admin account.</strong> This account oversees Group 13 and cannot be deleted from the app.</p></div>
      ) : (
        <>
          <p className="subheading">
            This permanently deletes <strong>{email}</strong>, your private to-dos and media, and every library file you uploaded.
            It cannot be undone.
          </p>
          <div className="data-form">
            <label>
              Type DELETE to confirm
              <input value={confirmText} onChange={event => setConfirmText(event.target.value)} placeholder="DELETE" autoComplete="off" />
            </label>
            <button className="danger-button" disabled={!ready || busy} onClick={() => void remove()}>
              <Trash2 size={14} /> {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
