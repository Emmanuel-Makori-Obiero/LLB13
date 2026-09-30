import { useRef, useState } from 'react'
import { Download, Mic, MicOff, Upload, X } from 'lucide-react'
import type { Discussion } from './data/types'

type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
const MAX_AUDIO_SECONDS = 3 * 60 * 60

export default function MeetingRoom({ discussion, onClose }: { discussion: Discussion; onClose: () => void }) {
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const [language, setLanguage] = useState('en-US')
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState('')
  const roomName = `Group13-${discussion.id.replace(/[^a-zA-Z0-9-]/g, '')}`
  const jitsiUrl = `https://meet.jit.si/${encodeURIComponent(roomName)}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.disableAP=true&interfaceConfig.SHOW_JITSI_WATERMARK=false`

  const toggleTranscription = () => {
    const speech = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
    if (transcribing) { recognition.current?.stop(); setTranscribing(false); setStatus('Live transcription stopped.'); return }
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition
    if (!Constructor) { setStatus('Live transcription is not supported in this browser. Upload an audio file instead.'); return }
    const instance = new Constructor(); instance.continuous = true; instance.interimResults = true; instance.lang = language
    instance.onresult = event => { let text = ''; for (let index = 0; index < event.results.length; index += 1) if (event.results[index].isFinal) text += `${event.results[index][0].transcript} `; if (text) setTranscript(value => `${value}${text}`) }
    instance.onerror = () => setStatus('Live transcription stopped. Check microphone permission and try again.')
    recognition.current = instance; instance.start(); setTranscribing(true); setStatus('Live transcription is on. Speak naturally in the selected language.')
  }

  const downloadTranscript = () => { const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([transcript || 'No transcript yet.'], { type: 'text/plain' })); link.href = url; link.download = `${discussion.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-transcript.txt`; link.click(); URL.revokeObjectURL(url) }
  const uploadAudio = async (file?: File) => {
    if (!file) return
    setStatus('Checking audio length…')
    const audio = document.createElement('audio')
    const objectUrl = URL.createObjectURL(file)
    const duration = await new Promise<number>(resolve => { audio.onloadedmetadata = () => resolve(audio.duration); audio.onerror = () => resolve(Number.NaN); audio.src = objectUrl })
    URL.revokeObjectURL(objectUrl)
    if (Number.isFinite(duration) && duration > MAX_AUDIO_SECONDS) { setStatus('That file is longer than the 3-hour limit.'); return }
    const endpoint = import.meta.env.VITE_TRANSCRIBE_URL as string | undefined
    if (!endpoint) { setStatus('Audio accepted. Add VITE_TRANSCRIBE_URL to enable full uploaded-audio transcription.'); return }
    const form = new FormData(); form.append('audio', file); form.append('language', language); setStatus('Transcribing… this may take a while for a long recording.')
    try { const response = await fetch(endpoint, { method: 'POST', body: form }); if (!response.ok) throw new Error(); const data = await response.json() as { text?: string }; setTranscript(data.text ?? ''); setStatus('Transcript ready. The returned transcript was kept intact.') } catch { setStatus('The audio was not transcribed. Check the transcription service and try again.') }
  }

  return <div className="meeting-overlay"><div className="meeting-shell video-room"><header className="meeting-header"><div><div className="eyebrow">Live room · up to 20 participants</div><h2>{discussion.title}</h2><p>{discussion.day} · {discussion.time} · Powered by Jitsi Meet</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></header><div className="jitsi-frame-wrap"><iframe title={`${discussion.title} video meeting`} src={jitsiUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" /></div><section className="transcription-panel"><div className="transcription-head"><div><div className="section-label">Free transcription</div><p className="field-hint">Jitsi handles the group call. This panel transcribes English or Kiswahili.</p></div><select value={language} onChange={event => setLanguage(event.target.value)} disabled={transcribing}><option value="en-US">English</option><option value="sw-KE">Kiswahili</option></select></div><div className="transcription-actions"><button className="secondary-button" onClick={toggleTranscription}>{transcribing ? <><MicOff size={14} /> Stop live transcript</> : <><Mic size={14} /> Start live transcript</>}</button><label className="secondary-button upload-button"><Upload size={14} /> Upload audio (up to 3 hours)<input type="file" accept="audio/*" onChange={event => void uploadAudio(event.target.files?.[0])} /></label><button className="secondary-button" onClick={downloadTranscript} disabled={!transcript}><Download size={14} /> Download .txt</button></div>{status && <p className="transcript-status">{status}</p>}<textarea className="transcript-box" value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Your transcript will appear here…" /></section></div></div>
}
