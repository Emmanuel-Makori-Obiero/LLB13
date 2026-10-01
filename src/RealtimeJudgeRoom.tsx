import { useEffect, useRef, useState } from "react";
import { supabase } from "./data/repository";

type LiveState =
  | "offline"
  | "connecting"
  | "listening"
  | "speaking"
  | "interrupted"
  | "error";
type ServerMessage = {
  setupComplete?: unknown;
  sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: { inlineData?: { data?: string; mimeType?: string } }[];
    };
  };
  error?: { message?: string };
};
const LIVE_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
// The provisioning function issues a 29-minute token. A one-hour interview
// needs a second token plus session-resumption logic; do not display 60 minutes
// until that reconnection path is implemented.
const MAX_MINUTES = 60;
const TOKEN_WINDOW_MS = 29 * 60 * 1000;
const RESUME_BEFORE_MS = 24 * 60 * 1000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size)
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function pcm16ToFloat(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < result.length; i += 1)
    result[i] = view.getInt16(i * 2, true) / 32768;
  return result;
}
function downsample(input: Float32Array, from: number, to = 16000) {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1)
    output[i] = input[Math.min(input.length - 1, Math.round(i * ratio))];
  return output;
}
function floatToPcm16(input: Float32Array) {
  const bytes = new Uint8Array(input.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < input.length; i += 1) {
    const value = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return bytes;
}

export default function RealtimeJudgeRoom() {
  const [state, setState] = useState<LiveState>("offline");
  const [camera, setCamera] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [userText, setUserText] = useState("");
  const [judgeText, setJudgeText] = useState("");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const media = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const tokenRef = useRef<string | null>(null);
  const resumeHandle = useRef<string | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnecting = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const inputNode = useRef<AudioWorkletNode | null>(null);
  const outputTime = useRef(0);
  const outputSources = useRef<AudioBufferSourceNode[]>([]);
  const frameTimer = useRef<number | null>(null);
  const started = useRef<number | null>(null);

  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (!started.current) return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started.current!) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [started.current]);

  const stopOutput = () => {
    outputSources.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    outputSources.current = [];
    outputTime.current = 0;
  };
  const handleServer = (message: ServerMessage) => {
    if (message.sessionResumptionUpdate?.newHandle)
      resumeHandle.current = message.sessionResumptionUpdate.newHandle;
    if (message.error?.message) {
      setError(message.error.message);
      setState("error");
      return;
    }
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      stopOutput();
      setState("interrupted");
      return;
    }
    if (content.inputTranscription?.text)
      setUserText((value) => value + content.inputTranscription!.text);
    if (content.outputTranscription?.text) {
      setJudgeText((value) => value + content.outputTranscription!.text);
      setState("speaking");
    }
    for (const part of content.modelTurn?.parts ?? []) {
      const encoded = part.inlineData?.data;
      if (!encoded || !audio.current) continue;
      const pcm = pcm16ToFloat(base64ToBytes(encoded));
      const buffer = audio.current.createBuffer(1, pcm.length, 24000);
      buffer.copyToChannel(pcm, 0);
      const source = audio.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.current.destination);
      const start = Math.max(
        audio.current.currentTime + 0.03,
        outputTime.current || audio.current.currentTime + 0.03,
      );
      source.start(start);
      outputTime.current = start + buffer.duration;
      outputSources.current.push(source);
      source.onended = () => {
        outputSources.current = outputSources.current.filter(
          (item) => item !== source,
        );
        if (!outputSources.current.length) setState("listening");
      };
    }
    if (content.turnComplete) setState("listening");
  };
  const send = (payload: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(payload));
  };

  const connectSocket = async (token: string, resume: boolean) => {
    const ws = new WebSocket(
      `${LIVE_WS}?access_token=${encodeURIComponent(token)}`,
    );
    socket.current = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        send({
          setup: {
            model: "models/gemini-3.8-live",
            responseModalities: ["AUDIO"],
            systemInstruction: {
              parts: [
                {
                  text: "You are a demanding but supportive moot-court judge. Use natural brief acknowledgements such as mm-hm or go on. Interrupt only when needed to correct a serious legal error, a time violation, or an unsafe claim. Ask one bench question at a time. Do not give a full submission unless asked. Speak clearly and keep turns concise.",
                },
              ],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
            realtimeInputConfig: {
              automaticActivityDetection: { disabled: false },
            },
            ...(resume && resumeHandle.current
              ? { sessionResumption: { handle: resumeHandle.current } }
              : {}),
          },
        });
        resolve();
      };
      ws.onerror = () =>
        reject(
          new Error(
            "Live voice connection failed. Check the Gemini key, model access, and quotas.",
          ),
        );
    });
    ws.onmessage = (event) => {
      try {
        handleServer(JSON.parse(event.data) as ServerMessage);
      } catch {
        /* ignore malformed provider frames */
      }
    };
    ws.onerror = () => {
      if (!reconnecting.current) {
        setError(
          "Live voice connection failed. Check the Gemini key, model access, and quotas.",
        );
        setState("error");
      }
    };
    ws.onclose = () => {
      if (!reconnecting.current && state !== "error") setState("offline");
    };
  };
  const scheduleResume = () => {
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = window.setTimeout(async () => {
      if (!tokenRef.current || !resumeHandle.current || !started.current)
        return;
      reconnecting.current = true;
      setState("connecting");
      const old = socket.current;
      try {
        await connectSocket(tokenRef.current, true);
        old?.close();
        setState("listening");
        scheduleResume();
      } catch {
        setError(
          "The realtime connection could not resume. Please start a new judge session.",
        );
        setState("error");
      } finally {
        reconnecting.current = false;
      }
    }, RESUME_BEFORE_MS);
  };
  const start = async () => {
    if (state === "connecting" || state === "listening" || state === "speaking")
      return;
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setState("connecting");
    setError("");
    setUserText("");
    setJudgeText("");
    resumeHandle.current = null;
    try {
      const { data, error: tokenError } = await supabase.functions.invoke(
        "live-token",
        { body: {} },
      );
      if (tokenError || !data?.token)
        throw new Error(
          tokenError?.message ||
            data?.error ||
            "Could not obtain a Live API token.",
        );
      tokenRef.current = data.token;
      await connectSocket(data.token, false);
      const context = new AudioContext();
      audio.current = context;
      await context.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [
              `class MicProcessor extends AudioWorkletProcessor { process(inputs) { const input=inputs[0]?.[0]; if(input) this.port.postMessage(input); return true; } } registerProcessor('mic-processor', MicProcessor);`,
            ],
            { type: "application/javascript" },
          ),
        ),
      );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: camera,
      });
      media.current = stream;
      if (video.current && camera) {
        video.current.srcObject = stream;
        video.current.play().catch(() => undefined);
      }
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "mic-processor");
      node.port.onmessage = (event: MessageEvent<Float32Array>) =>
        send({
          realtimeInput: {
            audio: {
              data: bytesToBase64(
                floatToPcm16(downsample(event.data, context.sampleRate)),
              ),
              mimeType: "audio/pcm;rate=16000",
            },
          },
        });
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(node);
      node.connect(silent);
      silent.connect(context.destination);
      inputNode.current = node;
      setState("listening");
      started.current = Date.now();
      scheduleResume();
      if (camera)
        frameTimer.current = window.setInterval(() => {
          const v = video.current;
          const c = canvas.current;
          if (!v || !c || !v.videoWidth) return;
          c.width = 640;
          c.height = Math.round((640 * v.videoHeight) / v.videoWidth);
          c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(
            (blob) => {
              if (!blob) return;
              const reader = new FileReader();
              reader.onload = () =>
                send({
                  realtimeInput: {
                    video: {
                      data: String(reader.result).split(",")[1],
                      mimeType: "image/jpeg",
                    },
                  },
                });
              reader.readAsDataURL(blob);
            },
            "image/jpeg",
            0.7,
          );
        }, 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start realtime judge.",
      );
      setState("error");
    }
  };
  const stop = () => {
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    reconnecting.current = false;
    tokenRef.current = null;
    resumeHandle.current = null;
    if (frameTimer.current) window.clearInterval(frameTimer.current);
    frameTimer.current = null;
    inputNode.current?.disconnect();
    inputNode.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    audio.current?.close().catch(() => undefined);
    audio.current = null;
    stopOutput();
    socket.current?.close();
    socket.current = null;
    started.current = null;
    setElapsed(0);
    setState("offline");
  };

  return (
    <div className="card card-pad realtime-room">
      <div className="card-header">
        <div>
          <div className="section-label">Layer 2 · Realtime Live Judge</div>
          <p className="subheading">
            WebSocket audio, native voice replies, VAD barge-in, and optional
            camera frames.
          </p>
        </div>
        <span className="chip">
          {state} ·{" "}
          {Math.floor(elapsed / 60)
            .toString()
            .padStart(2, "0")}
          :{(elapsed % 60).toString().padStart(2, "0")} / {MAX_MINUTES}:00
        </span>
      </div>
      <div className="realtime-grid">
        <div>
          <div className="realtime-video">
            {camera ? (
              <video ref={video} muted playsInline />
            ) : (
              <span>Camera off</span>
            )}
          </div>
          <canvas ref={canvas} hidden />
          <label className="realtime-check">
            <input
              type="checkbox"
              checked={camera}
              disabled={state !== "offline"}
              onChange={(event) => setCamera(event.target.checked)}
            />{" "}
            Send one camera frame per second
          </label>
          <div className="live-controls">
            <button
              className="primary-button"
              onClick={() =>
                state === "offline" || state === "error" ? void start() : stop()
              }
            >
              {state === "offline" || state === "error"
                ? "Start realtime judge"
                : "End session"}
            </button>
            <button className="secondary-button" onClick={stopOutput}>
              Stop judge audio
            </button>
          </div>
        </div>
        <div>
          <div className="realtime-transcript">
            <strong>You</strong>
            <p>{userText || "Waiting for speech…"}</p>
            <strong>AI judge</strong>
            <p>{judgeText || "The judge will speak here…"}</p>
          </div>
          <p className="field-hint">
            Gemini Live's automatic voice activity detection handles barge-in:
            when you start speaking, model audio is interrupted and cleared.
          </p>
          <p className="field-hint">
            This connection is limited to {MAX_MINUTES} minutes by the ephemeral
            token. Start a second session for a longer interview.
          </p>
        </div>
      </div>
      {error && (
        <div className="connection-error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
    </div>
  );
}
