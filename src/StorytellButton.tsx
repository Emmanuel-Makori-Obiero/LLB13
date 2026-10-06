import { useState } from "react";
import { BookOpen, Headphones, Loader2, Play } from "lucide-react";
import { askAI } from "./lib/ai";
import { generateAudio } from "./lib/cloudMedia";
import { Markdown } from "./Markdown";
import "./storytell.css";

function spokenText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14000);
}

export default function StorytellButton({ source, title = "this topic" }: { source: string; title?: string }) {
  const [busy, setBusy] = useState(false);
  const [simpleBusy, setSimpleBusy] = useState(false);
  const [simple, setSimple] = useState("");
  const [story, setStory] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const tellStory = async () => {
    if (busy || !source.trim()) return;
    setBusy(true); setError(""); setAudioUrl(null);
    try {
      const result = await askAI({
        feature: "chat",
        mode: "general",
        messages: [{ role: "user", content: `Turn the following explanation into a memorable chronological story for a Kenyan law student. Topic: ${title}. Begin with when and where it happened, introduce the real people or institutions only when they are supported by the supplied text or verified sources, then explain what happened next and why it mattered. Use a warm documentary storyteller voice, short scenes, cause-and-effect links, and a brief ending that connects the story to the concept. Do not invent names, dates, quotes, motives, or historical events. If the source is too thin to support a real historical narrative, say what is known and label any clearly marked illustrative scene as an example, not a fact. This is study support, not legal advice. Return only the story in readable Markdown.\n\nEXPLANATION TO RETELL:\n${source.slice(0, 18000)}` }],
      });
      const nextStory = result.answer.trim();
      if (!nextStory) throw new Error("The storyteller returned an empty story.");
      setStory(nextStory);
      const audio = await generateAudio({ text: `Speak in English with a warm, clear documentary storyteller voice, using natural pauses and gentle emphasis: ${spokenText(nextStory)}`, title: `Storytell — ${title}` });
      setAudioUrl(audio.signed_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Storytell is unavailable right now.");
    } finally { setBusy(false); }
  };

  const explainSimply = async () => {
    if (simpleBusy || busy || !source.trim()) return;
    setSimpleBusy(true); setError("");
    try {
      const result = await askAI({ feature: "chat", mode: "general", messages: [{ role: "user", content: `Explain the following definition or AI answer in very clear layman's language for a beginner. Start with one direct sentence beginning “In simple terms,” then use a short everyday analogy or example, and finish with one sentence explaining why it matters. Keep the meaning accurate, distinguish an analogy from a legal or historical fact, and do not add authorities, dates, names, or claims that are not supported by the supplied text. Avoid jargon; if a technical word is unavoidable, define it immediately.\n\nTOPIC: ${title}\n\nTEXT:\n${source.slice(0, 18000)}` }] });
      setSimple(result.answer.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The plain-language explanation is unavailable right now."); }
    finally { setSimpleBusy(false); }
  };

  return <div className="storytell-control"><div className="storytell-actions"><button type="button" className="secondary-button storytell-trigger" onClick={() => void explainSimply()} disabled={busy || simpleBusy || !source.trim()}>{simpleBusy ? <Loader2 size={13} className="storytell-spin" /> : <BookOpen size={13} />} {simpleBusy ? "Simplifying…" : "Explain simply"}</button><button type="button" className="secondary-button storytell-trigger" onClick={() => void tellStory()} disabled={busy || simpleBusy || !source.trim()}>{busy ? <Loader2 size={13} className="storytell-spin" /> : <BookOpen size={13} />} {busy ? "Building story…" : "Storytell"}</button></div>{error && <span className="storytell-error">{error}</span>}{simple && <div className="storytell-result storytell-simple"><div className="storytell-result-head"><strong><BookOpen size={13} /> In plain language</strong></div><Markdown text={simple} /></div>}{story && <div className="storytell-result"><div className="storytell-result-head"><strong><BookOpen size={13} /> {title} as a story</strong>{audioUrl && <span><Headphones size={12} /> Audio ready</span>}</div><Markdown text={story} />{audioUrl && <div className="storytell-audio"><audio controls preload="metadata" src={audioUrl} aria-label={`Storytell audio for ${title}`} /><a className="storytell-play-link" href={audioUrl} target="_blank" rel="noreferrer"><Play size={12} /> Open audio</a></div>}</div>}</div>;
}
