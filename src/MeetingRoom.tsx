import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Copy, Mic, MicOff, PhoneOff, Send, Video } from 'lucide-react'
import { supabase } from './data/repository'
import type { Discussion } from './data/types'

type Signal = { from: string; to?: string; kind: 'hello' | 'offer' | 'answer' | 'ice'; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
type ChatMessage = { id: string; sender: string; text: string }

function makeId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` }

export default function MeetingRoom({ discussion, onClose }: { discussion: Discussion; onClose: () => void }) {
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideos = useRef(new Map<string, HTMLVideoElement>())
  const peers = useRef(new Map<string, RTCPeerConnection>())
  const channel = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const participantId = useRef(makeId())
  const displayName = `Guest ${participantId.current.slice(0, 4)}`
  const [participants, setParticipants] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [status, setStatus] = useState('Connecting to room…')

  useEffect(() => {
    const client = supabase
    if (!client) { setStatus('Supabase is not configured.'); return () => undefined }
    const sendSignal = (payload: Omit<Signal, 'from'>) => channel.current?.send({ type: 'broadcast', event: 'signal', payload: { ...payload, from: participantId.current } })
    const createPeer = async (remoteId: string, initiator: boolean) => {
      if (peers.current.has(remoteId) || !stream.current) return peers.current.get(remoteId)
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      peers.current.set(remoteId, peer)
      stream.current.getTracks().forEach(track => peer.addTrack(track, stream.current!))
      peer.onicecandidate = event => { if (event.candidate) void sendSignal({ to: remoteId, kind: 'ice', candidate: event.candidate.toJSON() }) }
      peer.ontrack = event => { const video = remoteVideos.current.get(remoteId); if (video && video.srcObject !== event.streams[0]) video.srcObject = event.streams[0] }
      peer.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) { peer.close(); peers.current.delete(remoteId) } }
      if (initiator) { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await sendSignal({ to: remoteId, kind: 'offer', description: offer }) }
      return peer
    }
    const start = async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (localVideo.current) { localVideo.current.srcObject = stream.current; await localVideo.current.play() }
        channel.current = client.channel(`meeting:${discussion.id}`, { config: { broadcast: { self: false }, presence: { key: participantId.current } } })
          .on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
            if (payload.from === participantId.current || (payload.to && payload.to !== participantId.current)) return
            if (payload.kind === 'hello') await createPeer(payload.from, participantId.current < payload.from)
            else if (payload.kind === 'offer') { const peer = await createPeer(payload.from, false); if (!peer || !payload.description) return; await peer.setRemoteDescription(payload.description); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await sendSignal({ to: payload.from, kind: 'answer', description: answer }) }
            else if (payload.kind === 'answer') { const peer = peers.current.get(payload.from); if (peer && payload.description) await peer.setRemoteDescription(payload.description) }
            else if (payload.kind === 'ice') { const peer = peers.current.get(payload.from); if (peer && payload.candidate) await peer.addIceCandidate(payload.candidate) }
          })
          .on('broadcast', { event: 'chat' }, ({ payload }: { payload: ChatMessage }) => setMessages(current => [...current, payload]))
          .on('presence', { event: 'sync' }, () => { const state = channel.current?.presenceState() ?? {}; setParticipants(Object.keys(state).filter(id => id !== participantId.current)) })
        await channel.current.subscribe(async subscribeStatus => { if (subscribeStatus === 'SUBSCRIBED') { setStatus('Room live'); await channel.current?.track({ name: displayName }); await sendSignal({ kind: 'hello' }) } else if (subscribeStatus === 'CHANNEL_ERROR') setStatus('Could not connect to the room') })
      } catch (error) { setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera and microphone permission is required' : 'Could not start your camera') }
    }
    void start()
    return () => { peers.current.forEach(peer => peer.close()); peers.current.clear(); stream.current?.getTracks().forEach(track => track.stop()); if (channel.current) void client.removeChannel(channel.current) }
  }, [discussion.id])

  const toggleMic = () => { const next = !micOn; stream.current?.getAudioTracks().forEach(track => { track.enabled = next }); setMicOn(next) }
  const toggleCamera = () => { const next = !cameraOn; stream.current?.getVideoTracks().forEach(track => { track.enabled = next }); setCameraOn(next) }
  const sendMessage = async (event: React.FormEvent) => { event.preventDefault(); const text = draft.trim(); if (!text || !channel.current) return; const message = { id: makeId(), sender: displayName, text }; setMessages(current => [...current, message]); setDraft(''); await channel.current.send({ type: 'broadcast', event: 'chat', payload: message }) }

  return <div className="meeting-overlay"><div className="meeting-shell"><header className="meeting-header"><div><div className="eyebrow">GROUP 13 ROOM</div><h2>{discussion.title}</h2><p>{discussion.day} · {discussion.time} · {status}</p></div><button className="icon-button" onClick={onClose} aria-label="Close meeting"><PhoneOff size={17} /></button></header><div className="meeting-layout"><section className="video-grid"><div className="video-tile local"><video ref={localVideo} muted playsInline /><span>{cameraOn ? displayName : 'Camera off'}</span></div>{participants.map(id => <div className="video-tile" key={id}><video ref={element => { if (element) remoteVideos.current.set(id, element) }} autoPlay playsInline /><span>Participant {id.slice(0, 4)}</span></div>)}{!participants.length && <div className="meeting-empty"><Video size={25} /><p>Waiting for someone else to join.</p><small>Share this room from the Discussions page.</small></div>}</section><aside className="meeting-chat"><div className="section-label">Room chat</div><div className="chat-messages">{messages.map(message => <div className="chat-message" key={message.id}><strong>{message.sender}</strong><span>{message.text}</span></div>)}</div><form onSubmit={sendMessage} className="chat-form"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Message the room" /><button type="submit" aria-label="Send message"><Send size={15} /></button></form></aside></div><footer className="meeting-controls"><button onClick={toggleMic} className={!micOn ? 'control-off' : ''} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>{micOn ? <Mic /> : <MicOff />}</button><button onClick={toggleCamera} className={!cameraOn ? 'control-off' : ''} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Camera /> : <CameraOff />}</button><button onClick={async () => { await navigator.clipboard?.writeText(window.location.href); setStatus('Room link copied') }} aria-label="Copy room link"><Copy /></button><button className="leave-button" onClick={onClose}>Leave room</button></footer></div></div>
}
