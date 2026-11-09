import { useState } from 'react'
import { Download, FileText, Trash2 } from 'lucide-react'
import { repository, supabase } from './data/repository'

export function DataRightsCard({ email, setNotice }: { email: string; setNotice: (value: string) => void }) {
  const [request, setRequest] = useState<'access' | 'correction' | 'deletion'>('access')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const submit = async () => {
    if (!supabase) return
    setBusy(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Please sign in again before sending a data request.')
      const labels = { access: 'Personal data access request', correction: 'Personal data correction request', deletion: 'Personal data deletion request' }
      const result = await supabase.from('support_tickets').insert({ user_id: auth.user.id, subject: labels[request], category: 'account', message: `${details.trim() || 'Please process my request.'}\n\nAccount email: ${email}` })
      if (result.error) throw new Error(result.error.message)
      setDetails('')
      setNotice('Your private data request was sent to the platform administrator.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the data request.')
    } finally { setBusy(false) }
  }
  const exportBasicData = async () => {
    if (!supabase) return
    setExporting(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Please sign in again before exporting your data.')
      const localDrafts: Record<string, unknown> = {}
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index)
        if (key?.startsWith('g13-research-writer.')) {
          try { localDrafts[key] = JSON.parse(window.localStorage.getItem(key) ?? '') } catch { localDrafts[key] = window.localStorage.getItem(key) }
        }
      }
      const payload = { exported_at: new Date().toISOString(), account: { id: auth.user.id, email: auth.user.email, created_at: auth.user.created_at, user_metadata: auth.user.user_metadata }, browser_saved_research_drafts: localDrafts, note: 'This quick download contains your account metadata and browser-saved Research Writer drafts. Use the access request above for a complete copy of server-held personal data.' }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'law-hub-account-data.json'; link.click(); URL.revokeObjectURL(url)
      setNotice('Basic account data downloaded. Use the access request for a complete copy.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export account data.') }
    finally { setExporting(false) }
  }
  return <div className="card card-pad data-rights-card"><div className="card-header"><span className="section-label"><FileText size={14} /> DATA CONTROLS</span></div><p className="field-hint">Download basic account information or send a private request to access, correct, or delete personal data held by the platform.</p><button type="button" className="secondary-button" disabled={exporting} onClick={() => void exportBasicData()}><Download size={14} /> {exporting ? 'Preparing…' : 'Download basic account data'}</button><label>Request type<select value={request} onChange={(event) => setRequest(event.target.value as typeof request)}><option value="access">Access or full copy of my data</option><option value="correction">Correct my personal data</option><option value="deletion">Delete specific personal data</option></select></label><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={2000} placeholder="Explain what you want changed or included…" /><button type="button" className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : 'Send private data request'}</button></div>
}

export function DeleteAccountCard({ email, isAdmin, onDeleted, setNotice }: { email: string; isAdmin: boolean; onDeleted: () => void; setNotice: (value: string) => void }) { const [busy, setBusy] = useState(false); const remove = async () => { if (isAdmin || !window.confirm(`Delete ${email} and all your uploaded data?`)) return; setBusy(true); try { await repository.deleteMyAccount(); onDeleted() } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not delete account.') } finally { setBusy(false) } }; return <div className="card card-pad danger-card"><div className="card-header"><span className="section-label">Danger zone</span></div><p className="field-hint">Delete your account and your personal uploads.</p><button className="danger-button" disabled={busy || isAdmin} onClick={() => void remove()}><Trash2 size={14} /> {isAdmin ? 'Super admin account protected' : busy ? 'Deleting…' : 'Delete account'}</button></div> }
