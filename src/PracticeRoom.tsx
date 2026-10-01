import { useEffect, useRef, useState } from "react";
import { askAI, type AIMessage } from "./lib/ai";

type RecognitionEvent = {
  results: {
    length: number;
    [index: number]: { [index: number]: { transcript: string } };
  };
};
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
type JudgeState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "question"
  | "warning";

const MAX_MINUTES = 60;
const MAX_TURNS = 30;
const PAUSE_TO_SEND_MS = 1500;
const ACK_AFTER_MS = 5000;

function Avatar({ state }: { state: JudgeState }) {
  const speaking = state === "speaking";
  const serious = state === "warning";
  return (
    <div
      className={`judge-avatar judge-${state}`}
      aria-label={`Judge is ${state}`}
    >
      <svg viewBox="0 0 220 220" role="img" aria-hidden="true">
        <circle className="avatar-bg" cx="110" cy="110" r="104" />
        <path
          className="avatar-robe"
          d="M48 210c5-52 30-73 62-73s57 21 62 73H48Z"
        />
        <path className="avatar-neck" d="M94 133v24h32v-24" />
        <ellipse className="avatar-face" cx="110" cy="94" rx="46" ry="53" />
        <path
          className="avatar-hair"
          d="M65 91c-4-45 17-67 47-67 34 0 50 25 43 69-11-22-26-31-47-31-18 0-31 10-43 29Z"
        />
        <path
          className="avatar-brow"
          d={serious ? "M82 84l18-5M120 79l18 5" : "M82 82l18 2M120 84l18-2"}
        />
        <circle className="avatar-eye" cx="92" cy="93" r="4" />
        <circle className="avatar-eye" cx="128" cy="93" r="4" />
        <path className="avatar-nose" d="M110 94l-5 18h10" />
        <path
          className={`avatar-mouth ${speaking ? "moving" : ""}`}
          d={serious ? "M95 128q15-8 30 0" : "M94 124q16 12 32 0"}
        />
        <path className="avatar-collar" d="M82 143l28 28 28-28" />
        <path
          className="avatar-gavel"
          d="M157 165l22 22M151 153l18 18M145 148l18-18 12 12-18 18Z"
        />
      </svg>
      <span className="judge-state-label">
        {state === "question"
          ? "Question"
          : state[0].toUpperCase() + state.slice(1)}
      </span>
    </div>
  );
}

export default function PracticeRoom() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [autoSend, setAutoSend] = useState(true);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [state, setState] = useState<JudgeState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const pauseTimer = useRef<number | null>(null);
  const ackTimer = useRef<number | null>(null);
  const speechText = useRef("");
  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);

  const userTurns = messages.filter(
    (message) => message.role === "user",
  ).length;
  const limitReached = elapsed >= MAX_MINUTES * 60 || userTurns >= MAX_TURNS;
  const clock = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;

  useEffect(() => {
    const Ctor =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    setSpeechSupported(Boolean(Ctor));
    return () => {
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis?.cancel();
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
      if (ackTimer.current) window.clearTimeout(ackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const speak = (text: string, nextState: JudgeState = "speaking") => {
    if (!speakReplies || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setState(nextState);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-KE";
    utterance.rate = 0.96;
    utterance.onend = () => {
      if (!listening) setState("idle");
    };
    window.speechSynthesis.speak(utterance);
  };

  const stopJudgeVoice = () => {
    window.speechSynthesis?.cancel();
    if (!listening && !busy) setState("idle");
  };

  const send = async (value?: string) => {
    const text = (value ?? speechText.current).trim();
    if (!text || busy || limitReached) return;
    window.speechSynthesis?.cancel();
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    if (ackTimer.current) window.clearTimeout(ackTimer.current);
    speechText.current = "";
    setTranscript("");
    setBusy(true);
    setState("thinking");
    setError("");
    if (!startedAt) setStartedAt(Date.now());
    const user: AIMessage = { role: "user", content: text };
    const next = [...messages, user];
    setMessages(next);
    try {
      const result = await askAI({
        feature: "moot_judge",
        mode: "general",
        messages: [
          ...next.slice(-12),
          {
            role: "user",
            content:
              "You are my live one-on-one moot judge. Give a brief acknowledgement such as 'Mm-hm, I hear you' when appropriate, then one focused observation and one bench question. Wait for my answer; do not dump a complete submission. Keep the spoken answer under 90 seconds.",
          },
        ],
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer },
      ]);
      setState(result.answer.includes("?") ? "question" : "speaking");
      speak(
        result.answer,
        result.answer.includes("?") ? "question" : "speaking",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The judge is unavailable.");
      setState("warning");
    } finally {
      setBusy(false);
    }
  };

  const startListening = () => {
    const Ctor =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Ctor) {
      setError(
        "Continuous speech recognition is not supported in this browser. Use Chrome or type your answer.",
      );
      return;
    }
    if (listening) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-KE";
    recognition.onresult = (event) => {
      window.speechSynthesis?.cancel();
      setState("listening");
      let all = "";
      for (let index = 0; index < event.results.length; index += 1)
        all += event.results[index][0].transcript;
      speechText.current = all;
      setTranscript(all);
      if (ackTimer.current) window.clearTimeout(ackTimer.current);
      ackTimer.current = window.setTimeout(() => {
        if (listening && !busy) speak("Mm-hm, go on.", "listening");
      }, ACK_AFTER_MS);
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
      if (autoSend)
        pauseTimer.current = window.setTimeout(() => {
          if (speechText.current.trim()) void send();
        }, PAUSE_TO_SEND_MS);
    };
    recognition.onerror = () => {
      setError(
        "Microphone recognition stopped. Check microphone permission or use headphones.",
      );
      setListening(false);
      setState("warning");
    };
    recognition.onend = () => {
      if (
        listening &&
        !limitReached &&
        recognitionRef.current === recognition
      ) {
        try {
          recognition.start();
        } catch {
          /* browser is already restarting */
        }
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setState("listening");
      setError("");
    } catch {
      setError("Could not start the microphone.");
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    if (ackTimer.current) window.clearTimeout(ackTimer.current);
    if (speechText.current.trim() && !autoSend)
      setTranscript(speechText.current);
    if (!busy) setState("idle");
  };

  const toggleCamera = async () => {
    if (camera) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCamera(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamera(true);
      setError("");
    } catch {
      setError(
        "Camera access was denied. You can still use microphone or text mode.",
      );
    }
  };

  const recordVideo = async () => {
    if (!streamRef.current) await toggleCamera();
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("Video recording is unavailable in this browser.");
      return;
    }
    chunks.current = [];
    const current = new MediaRecorder(stream);
    current.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    current.onstop = () => {
      const blob = new Blob(chunks.current, {
        type: current.mimeType || "video/webm",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moot-practice-${new Date().toISOString().slice(0, 10)}.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setRecording(false);
    };
    current.start();
    recorder.current = current;
    setRecording(true);
  };

  const reset = () => {
    stopListening();
    stopJudgeVoice();
    recorder.current?.stop();
    setMessages([]);
    setTranscript("");
    speechText.current = "";
    setStartedAt(null);
    setElapsed(0);
    setError("");
    setState("idle");
  };

  return (
    <div className="card card-pad live-judge-room">
      <div className="card-header">
        <div>
          <div className="section-label">Live one-on-one judge room</div>
          <p className="subheading">
            Talk naturally. Pause to submit. The judge answers aloud and asks
            the next question.
          </p>
        </div>
        <span className="chip">
          {clock} / 60:00 · {userTurns}/{MAX_TURNS} turns
        </span>
      </div>
      <div className="live-room-grid">
        <div>
          <Avatar state={state} />
          <div className="live-video-wrap">
            {camera ? (
              <video ref={videoRef} autoPlay muted playsInline />
            ) : (
              <div className="live-video-empty">
                Camera off
                <br />
                <small>Turn it on to record your delivery locally.</small>
              </div>
            )}
          </div>
          <div className="live-controls">
            <button
              className="secondary-button"
              onClick={() => void toggleCamera()}
            >
              {camera ? "Turn camera off" : "Turn camera on"}
            </button>
            {camera && (
              <button
                className="secondary-button"
                onClick={() =>
                  recording ? recorder.current?.stop() : void recordVideo()
                }
              >
                {recording ? "Stop & download" : "Record video"}
              </button>
            )}
            <button
              className={listening ? "primary-button" : "secondary-button"}
              onClick={() => (listening ? stopListening() : startListening())}
            >
              {listening ? "Stop listening" : "Start microphone"}
            </button>
          </div>
          <div className="live-voice-options">
            <label>
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(event) => setAutoSend(event.target.checked)}
              />{" "}
              Send after a natural pause
            </label>
            <label>
              <input
                type="checkbox"
                checked={speakReplies}
                onChange={(event) => setSpeakReplies(event.target.checked)}
              />{" "}
              Judge speaks aloud
            </label>
            <button className="secondary-button" onClick={stopJudgeVoice}>
              Stop voice
            </button>
          </div>
          {!speechSupported && (
            <p className="field-hint">
              Speech recognition is unavailable in this browser. Try Chrome or
              use the text box.
            </p>
          )}
          <p className="field-hint">
            Use headphones to prevent the judge's voice from being picked up by
            the microphone. Camera video is saved locally; the current AI
            endpoint judges the transcript, not video frames.
          </p>
        </div>
        <div>
          <div className="live-thread">
            {messages.length === 0 && (
              <p className="field-hint">
                Start speaking. After a short pause, your answer will be sent
                automatically.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                className={`live-message ${message.role}`}
                key={`${message.role}-${index}`}
              >
                <span>{message.role === "user" ? "You" : "AI judge"}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <textarea
            className="oral-input"
            rows={5}
            value={transcript}
            onChange={(event) => {
              speechText.current = event.target.value;
              setTranscript(event.target.value);
            }}
            placeholder="Speak or type your submission…"
            disabled={limitReached}
          />
          <div className="live-submit">
            <button
              className="primary-button"
              onClick={() => void send()}
              disabled={busy || limitReached}
            >
              {busy
                ? "Judge is thinking…"
                : limitReached
                  ? "One-hour limit reached"
                  : "Send now"}
            </button>
            <button className="secondary-button" onClick={reset}>
              New session
            </button>
          </div>
        </div>
      </div>
      {limitReached && (
        <div className="callout" style={{ marginTop: 14 }}>
          This session has reached its one-hour safety limit. Start a new
          session later to protect free-tier availability.
        </div>
      )}
      {error && (
        <div className="connection-error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
    </div>
  );
}
