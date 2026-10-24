import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Headphones,
  Loader2,
  Mic,
  Upload,
  Video,
} from "lucide-react";
import { askAI, importLibraryMaterial, listMyMaterials, uploadMaterial } from "./lib/ai";
import { generateAudio } from "./lib/cloudMedia";
import { supabase } from "./data/repository";
import { Markdown } from "./Markdown";
import { materialVisibleToLevel } from "./lib/learnerAdaptation";
import "./learning-studio.css";

type Doc = { id: string; title: string; scope: "user" | "library"; citation?: string | null; kind?: "document" | "library"; url?: string | null; target_years?: string[] | null };
type Mode = "podcast" | "video";
const STUDIO_STORAGE_KEY = "group13-learning-studio-draft-v2";
type StudioDraft = { topic: string; selected: string[]; mode: Mode; spokenLanguage: "en" | "sw" | "mix" | "sheng"; scriptLanguage: "en" | "sw" | "mix" | "sheng"; presenterStyle: string; presenterName: string; guideName: string; presenterGender: "male" | "female"; guideGender: "male" | "female"; script: string; slide: number; audioUrl: string | null; audioMimeType: string; audioProvider: string | null };
function savedStudioDraft(): Partial<StudioDraft> {
  try { return JSON.parse(window.localStorage.getItem(STUDIO_STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
const isBookSource = (_doc: Doc) => true;

function audioProviderLabel(provider: string | null) {
  if (!provider) return "configured speech provider";
  if (provider.includes("elevenlabs")) return "ElevenLabs";
  if (provider.includes("gemini")) return "Google Gemini TTS";
  if (provider.includes("openai")) return "OpenAI TTS";
  if (provider.includes("huggingface")) return "Hugging Face TTS";
  return provider.replace(/[-_]/g, " ");
}

function logPodcastAudioActivity(eventType: "podcast_audio_generated" | "podcast_audio_failed") {
  if (!supabase) return;
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await supabase.from("platform_activity_events").insert({ user_id: session.user.id, event_type: eventType, page: "assistant", details: {} });
    } catch { /* Activity reporting must never interrupt audio generation. */ }
  })();
}

const perspectives = [
  "Act as a careful Kenyan law lecturer. Identify the governing rule, authorities, reasoning, and any uncertainty in the selected source.",
  "Act as a plain-language tutor. Explain the selected topic with a concrete everyday example, likely confusion, and a quick recall question.",
  "Act as a Kenyan legal case researcher and demanding moot coach. Identify the most relevant real reported case supported by the selected sources; give the correct case name, court, year/citation only if source-supported, material facts, issue, each side's strongest argument, holding and reasoning. Explain exactly how it illuminates the requested topic. Do not invent a case or citation; if the source set does not verify one, clearly flag that a citation must be checked. Also test application, counterargument and exam traps.",
];

export default function LearningStudio({ learnerLevel = "" }: { learnerLevel?: string }) {
  const saved = useMemo(savedStudioDraft, []);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>(saved.selected ?? []);
  const [libraryImports, setLibraryImports] = useState<Record<string, string>>({});
  const [topic, setTopic] = useState(saved.topic ?? "");
  const [mode, setMode] = useState<Mode>(saved.mode ?? "podcast");
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [script, setScript] = useState(saved.script ?? "");
  const [spokenLanguage, setSpokenLanguage] = useState<"en" | "sw" | "mix" | "sheng">(saved.spokenLanguage ?? "en");
  const [scriptLanguage, setScriptLanguage] = useState<"en" | "sw" | "mix" | "sheng">(saved.scriptLanguage ?? "en");
  const [presenterStyle, setPresenterStyle] = useState(saved.presenterStyle ?? "Kenyan legal newsroom: warm, confident and clear");
  const [presenterName, setPresenterName] = useState(saved.presenterName ?? "John");
  const [guideName, setGuideName] = useState(saved.guideName ?? "Amina");
  const [presenterGender, setPresenterGender] = useState<"male" | "female">(saved.presenterGender ?? "male");
  const [guideGender, setGuideGender] = useState<"male" | "female">(saved.guideGender ?? "female");
  const [slide, setSlide] = useState(saved.slide ?? 0);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [importingSource, setImportingSource] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(saved.audioUrl ?? null);
  const [audioMimeType, setAudioMimeType] = useState(saved.audioMimeType ?? "audio/mpeg");
  const [audioProvider, setAudioProvider] = useState<string | null>(saved.audioProvider ?? null);
  const [audioNote, setAudioNote] = useState("");
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioElapsedSeconds, setAudioElapsedSeconds] = useState(0);
  const [audioStage, setAudioStage] = useState("");
  const audioRequestId = useRef(0);
  useEffect(() => {
    if (!audioBusy) return;
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setAudioElapsedSeconds(elapsed);
      // This is honest indeterminate progress: it advances while providers
      // work but never claims completion before the playable file exists.
      setAudioProgress(Math.min(92, 8 + Math.round(Math.log1p(elapsed) * 18)));
      setAudioStage(elapsed < 8 ? "Preparing speech chunks…" : elapsed < 30 ? "Trying the configured voice providers…" : elapsed < 90 ? "Rendering and combining the audio…" : "Still rendering a long episode — you can keep this page open…");
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [audioBusy]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({ topic, selected, mode, spokenLanguage, scriptLanguage, presenterStyle, presenterName, guideName, presenterGender, guideGender, script, slide, audioUrl, audioMimeType, audioProvider } satisfies StudioDraft));
    } catch { /* browser storage is optional */ }
  }, [topic, selected, mode, spokenLanguage, scriptLanguage, presenterStyle, presenterName, guideName, presenterGender, guideGender, script, slide, audioUrl, audioMimeType, audioProvider]);

  const loadSources = async () => {
    const [items, library] = await Promise.all([listMyMaterials(), import("./lib/guidedStudy").then(({ listGuideSources }) => listGuideSources())]);
    const documents = (items as Doc[]).filter(isBookSource).map((doc) => ({ ...doc, kind: "document" as const }));
    const libraryBooks = library.filter((source) => source.kind === "material" && source.url && materialVisibleToLevel(source.target_years, learnerLevel)).map((source) => ({ id: `library:${source.id}`, title: source.title, scope: "library" as const, citation: source.citation, kind: "library" as const, url: source.url, target_years: source.target_years ?? [] }));
    const books = [...documents.filter((doc) => doc.scope !== "library" || materialVisibleToLevel(doc.target_years, learnerLevel)), ...libraryBooks];
    setDocs(books);
    setSelected((current) => current.filter((id) => books.some((doc) => doc.id === id)));
  };
  useEffect(() => { void loadSources().catch(() => setError("Could not load your Library and AI-ready sources.")); }, [learnerLevel]);
  const selectedDocs = useMemo(
    () => docs.filter((doc) => selected.includes(doc.id)),
    [docs, selected],
  );
  const pages = useMemo(
    () =>
      script
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean),
    [script],
  );

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-6));
  const toggleSource = async (doc: Doc) => {
    if (doc.kind !== "library") { toggle(doc.id); return; }
    if (!doc.url || importingSource) return;
    const importedId = libraryImports[doc.id];
    if (importedId) { toggle(importedId); return; }
    setSelected((current) => current.includes(doc.id) ? current.filter((id) => id !== doc.id) : [...current, doc.id].slice(-6));
    setImportingSource(doc.id); setError("");
    try {
      const imported = await importLibraryMaterial({ title: doc.title, url: doc.url, citation: doc.citation, target_years: doc.target_years ?? [] });
      setLibraryImports((current) => ({ ...current, [doc.id]: imported.id }));
      await loadSources();
      setSelected((current) => [...current.filter((id) => id !== doc.id), imported.id].slice(-6));
    } catch (e) { setSelected((current) => current.filter((id) => id !== doc.id)); setError(e instanceof Error ? e.message : "Could not prepare that Library book for AI."); }
    finally { setImportingSource(null); }
  };
  const download = () => {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(topic || "law-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const uploadSourceBook = async (file?: File) => {
    if (!file || uploadingSource) return;
    setUploadingSource(true);
    setError("");
    try {
      const uploaded = await uploadMaterial(file);
      await loadSources();
      setSelected((current) => [...current, uploaded.id].slice(-6));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that book.");
    } finally {
      setUploadingSource(false);
    }
  };
  const generatePodcastAudio = async () => {
    if (!script || audioBusy || rendering) return;
    const requestId = ++audioRequestId.current;
    const scriptSnapshot = script;
    const languageSnapshot = scriptLanguage || spokenLanguage;
    setAudioBusy(true);
    setAudioProgress(4);
    setAudioElapsedSeconds(0);
    setAudioStage("Preparing speech chunks…");
    setAudioUrl(null);
    setAudioProvider(null);
    setAudioNote("Creating fluent voice audio…");
    try {
      const result = await generateAudio({ text: scriptSnapshot, title: topic || "Podcast episode", language: languageSnapshot, presenter_gender: presenterGender, guide_gender: guideGender });
      if (requestId !== audioRequestId.current) return;
      setAudioUrl(result.signed_url);
      setAudioMimeType(result.mime_type || "audio/mpeg");
      setAudioProvider(result.asset?.provider || null);
      setAudioProgress(100);
      setAudioStage("Playable audio is ready.");
      setAudioNote("Audio is ready and saved in Media archive. Listen below, download it, or open Media to play and share it with Group 13.");
      logPodcastAudioActivity("podcast_audio_generated");
    } catch (e) {
      logPodcastAudioActivity("podcast_audio_failed");
      if (requestId === audioRequestId.current) setAudioNote(e instanceof Error ? e.message : "Could not create audio.");
      if (requestId === audioRequestId.current) { setAudioProgress(0); setAudioStage("Audio generation stopped."); }
    } finally {
      if (requestId === audioRequestId.current) setAudioBusy(false);
    }
  };
  const downloadGeneratedAudio = async () => {
    if (!audioUrl) return;
    const extension = audioMimeType === "audio/mpeg" ? "mp3" : audioMimeType === "audio/ogg" ? "ogg" : "wav";
    const filename = `${(topic || "podcast").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extension}`;
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("The audio file was empty.");
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (e) {
      const detail = e instanceof Error ? ` (${e.message})` : "";
      setAudioNote(`Direct download did not work${detail}. Use the audio player's menu to save the file.`);
    }
  };
  const renderMp4 = async () => {
    if (!pages.length || rendering || audioBusy) return;
    setRendering(true);
    setRenderProgress(0);
    setError("");
    try {
      setStage("Creating the narration audio…");
      const narration = audioUrl
        ? { signed_url: audioUrl, mime_type: audioMimeType }
        : await generateAudio({
            text: script,
            title: topic || "Narrated law lesson",
            language: scriptLanguage || spokenLanguage,
            presenter_gender: presenterGender,
            guide_gender: guideGender,
          });
      setAudioUrl(narration.signed_url);
      setAudioMimeType(narration.mime_type || "audio/mpeg");
      if ("asset" in narration) setAudioProvider(narration.asset?.provider || null);
      setAudioNote("The MP4 export is using the same natural voice narration shown in the audio player.");
      const narrationDuration = await new Promise<number>((resolve) => {
        const probe = document.createElement("audio");
        probe.preload = "metadata";
        let timeout = 0;
        const finish = (duration: number) => {
          window.clearTimeout(timeout);
          probe.removeAttribute("src");
          probe.load();
          resolve(Number.isFinite(duration) ? duration : 0);
        };
        probe.onloadedmetadata = () => finish(probe.duration);
        probe.onerror = () => finish(0);
        timeout = window.setTimeout(() => finish(0), 10_000);
        probe.src = narration.signed_url;
      });
      const sceneDurationMs = Math.max(5200, (narrationDuration * 1000) / pages.length);
      setRenderProgress(10);
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (
        !context ||
        !canvas.captureStream ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "MP4 export needs a recent Chrome, Edge, or Firefox browser.",
        );
      const stream = canvas.captureStream(30);
      const chunks: Blob[] = [];
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      const draw = (raw: string, index: number) => {
        const text = raw
          .replace(/^SCENE[^\n]*\n?/i, "")
          .replace(/VISUAL:.*\n?/i, "")
          .replace(/NARRATION:/i, "")
          .replace(/SOURCE NOTE:.*/i, "")
          .trim();
        context.fillStyle = "#163a34";
        context.fillRect(0, 0, 1280, 720);
        context.fillStyle = "#c96e52";
        context.fillRect(76, 76, 108, 8);
        context.fillStyle = "#f7f5f0";
        context.font = "700 22px Arial";
        context.fillText(`GROUP 13 HUB · SCENE ${index + 1}`, 76, 132);
        context.font = "500 42px Georgia";
        context.fillText(topic.trim().slice(0, 48), 76, 205);
        context.fillStyle = "#ffffff";
        context.font = "28px Arial";
        let line = "";
        let y = 300;
        for (const word of text.split(/\s+/)) {
          const next = line ? `${line} ${word}` : word;
          if (context.measureText(next).width > 1080) {
            context.fillText(line, 76, y);
            line = word;
            y += 46;
          } else line = next;
          if (y > 590) break;
        }
        if (line && y <= 590) context.fillText(line, 76, y);
        context.fillStyle = "#ffffffa8";
        context.font = "18px Arial";
        context.fillText(
          "Source-grounded study lesson · Verify authorities before relying on them",
          76,
          665,
        );
      };
      for (let index = 0; index < pages.length; index += 1) {
        draw(pages[index], index);
        await new Promise((resolve) => window.setTimeout(resolve, sceneDurationMs));
        setRenderProgress(10 + Math.round(((index + 1) / pages.length) * 70));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      setRenderProgress(85);
      const webm = new Blob(chunks, { type: "video/webm" });
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(
          `${base}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });
      await ffmpeg.writeFile("lesson.webm", await fetchFile(webm));
      const narrationFile = narration.mime_type === "audio/mpeg" ? "narration.mp3" : narration.mime_type === "audio/ogg" ? "narration.ogg" : "narration.wav";
      await ffmpeg.writeFile(narrationFile, await fetchFile(narration.signed_url));
      setStage("Combining slides and narration…");
      await ffmpeg.exec([
        "-i",
        "lesson.webm",
        "-i",
        narrationFile,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-pix_fmt",
        "yuv420p",
        "-shortest",
        "-movflags",
        "+faststart",
        "lesson.mp4",
      ]);
      const data = await ffmpeg.readFile("lesson.mp4");
      const bytes = new Uint8Array(data as Uint8Array);
      const url = URL.createObjectURL(
        new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(topic || "law-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      await ffmpeg.terminate();
      setRenderProgress(100);
      setStage("Narrated MP4 ready.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not render the MP4 lesson.",
      );
    } finally {
      setRendering(false);
    }
  };

  const generate = async () => {
    if (!topic.trim() || !selected.length || working || audioBusy || rendering) return;
    audioRequestId.current += 1;
    setWorking(true);
    setGenerationProgress(5);
    setError("");
    setPanel([]);
    setScript("");
    setSlide(0);
    try {
      const findings: string[] = [];
      setAudioUrl(null);
      setAudioProvider(null);
      setAudioNote("");
      const languageInstruction = spokenLanguage === "sw"
        ? "Write in fluent, natural Kiswahili used in Kenya. Preserve case names, statute titles, citations and official legal terms in their original form."
        : spokenLanguage === "mix"
          ? "Code-switch naturally between Kenyan English and Kiswahili (roughly 60/40). Explain difficult legal terms in both languages, keep authorities and citations exact, and never translate proper names."
          : spokenLanguage === "sheng"
            ? "Use respectful Kenyan English mixed naturally with accessible Sheng where it improves connection. Keep legal definitions, authorities and citations precise; do not force slang into every sentence and explain any uncommon Sheng phrase from context."
            : "Write in clear Kenyan English, with natural spoken phrasing. Preserve case names, statute titles and citations exactly.";
      for (let index = 0; index < perspectives.length; index += 1) {
        setStage(`AI perspective ${index + 1} of ${perspectives.length}…`);
        setGenerationProgress(10 + index * 20);
        const result = await askAI({
          feature: "topic_summary",
          mode: "auto",
          docIds: selected,
          messages: [
            {
              role: "user",
              content: `${perspectives[index]}\n${languageInstruction}\n\nTopic: ${topic.trim()}\nReturn a focused memo for a later script editor. Do not invent authorities.`,
            },
          ],
        });
        findings.push(result.answer);
      }
      setPanel(findings);
      setGenerationProgress(75);
      setStage(
        mode === "podcast"
          ? "Editing the two-speaker episode…"
          : "Editing the narrated video lesson…",
      );
      const editor = await askAI({
        feature: mode === "podcast" ? "podcast_script" : "video_script",
        mode: "auto",
        docIds: selected,
        messages: [
          {
            role: "user",
            content: mode === "podcast"
              ? `Create a complete, natural classroom-style Kenyan law lesson as a two-person audio dialogue.\nTOPIC: ${topic.trim()}\nLANGUAGE: ${languageInstruction}\nPRESENTER DELIVERY: ${presenterStyle}.\nSPEAKER 1: ${presenterName.trim() || "John"}, a ${presenterGender} voice, is the class presenter.\nSPEAKER 2: ${guideName.trim() || "Amina"}, a ${guideGender} voice, is the law tutor. Keep each voice and name consistent: never give a feminine voice a clearly masculine name or vice versa. Speak as teacher and engaged student/class presenter in a real class, not as a podcast announcer, news broadcast, or promo. Start with a short classroom welcome and introductions, then teach progressively: learning objectives, key doctrine, plain-language explanation, statutory/legal framework, application, misconceptions, short questions and answers, recap, and a clear closing. Make the treatment rigorous and vivid, with serious stakes and an intense but accurate case discussion.\n\nCASE REQUIREMENT (essential): Find and teach ONE real, named case directly related to the topic. Prefer a case identified in the selected source material or the research memos below. Explain the facts, legal issue, each side's strongest argument, the court's reasoning/holding, why it matters to this lesson, and a short hypothetical application for the class. Give the court and citation/year only when supported. Do not invent case names, citations, facts, holdings, quotations, statutes or authorities. If a case cannot be verified from the available material, say in the dialogue that its citation needs verification rather than fabricating details, and use only facts supported by the source. The case must be integrated into the teaching, not bolted on.\n\nLENGTH: Aim for about 1,300–1,450 spoken words (roughly ten minutes at a clear classroom pace). Do not give me a short summary. Use complete spoken sentences, substantive explanation, examples, and meaningful teacher/student exchange.\n\nOUTPUT FORMAT: Use only these exact structural speaker tags on their own lines: PRESENTER: and LEGAL GUIDE:. They are internal routing labels and must NOT be spoken aloud. Do not write or say S1, S2, SS, Speaker 1, Speaker 2, scene numbers, production notes, sound cues, or stage directions. Mention the two people's names naturally in the introduction; after that use their names sparingly and let the lesson flow like a class. Keep the dialogue polished and fully speakable.\n\nDo not imitate or claim to be any real lawyer, politician, journalist or public figure. Keep the script faithful to selected sources and these research memos; distinguish established law from uncertainty.\n\nResearch memos and selected-source findings:\n${findings.map((item, i) => `MEMO ${i + 1}\n${item}`).join("\n\n")}`
              : `Topic: ${topic.trim()}\n${languageInstruction}\nPresenter style: ${presenterStyle}. Create the final narrated video lesson, keeping it faithful to selected sources, citing source markers when available, and marking uncertain law for verification.\n\nIndependent research memos from the AI panel:\n${findings.map((item, i) => `MEMO ${i + 1}\n${item}`).join("\n\n")}`,
          },
        ],
      });
      let finalScript = editor.answer.trim();
      if (mode === "podcast") {
        const escapeLabel = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const presenterLabel = presenterName.trim() || "John";
        const guideLabel = guideName.trim() || "Amina";
        finalScript = finalScript
          .replace(/[*_`]/g, "")
          .replace(new RegExp(`^\\s*${escapeLabel(presenterLabel)}\\s*[:：-]`, "gim"), "PRESENTER:")
          .replace(new RegExp(`^\\s*${escapeLabel(guideLabel)}\\s*[:：-]`, "gim"), "LEGAL GUIDE:")
          .replace(/^\\s*(?:S\\s*1|SS\\s*1|Speaker\\s*1|Host|Presenter)\\s*[:：-]/gim, "PRESENTER:")
          .replace(/^\\s*(?:S\\s*2|SS\\s*2|Speaker\\s*2|Tutor|Legal Guide)\\s*[:：-]/gim, "LEGAL GUIDE:");
        if (!/PRESENTER\s*:/i.test(finalScript) || !/LEGAL GUIDE\s*:/i.test(finalScript)) {
          const lines = finalScript.split(/\r?\n+/).map((line) => line.replace(/^#+\s*/, "").replace(/^[-–—]\s*/, "").trim()).filter(Boolean);
          if (!lines.length) throw new Error("The podcast editor returned no speakable dialogue. Please try again.");
          finalScript = `PRESENTER: Hi, my name is ${presenterLabel}, and I will be your host.\nLEGAL GUIDE: My name is ${guideLabel}, and I will be your legal guide today.\n${lines.map((line, index) => `${index % 2 === 0 ? "PRESENTER" : "LEGAL GUIDE"}: ${line}`).join("\n")}`;
        }
      } else if (!/SCENE\s*\d+/i.test(finalScript) || !/NARRATION\s*:/i.test(finalScript)) {
        throw new Error("The narration editor returned an incomplete scene script. Please try again.");
      }
      setScript(finalScript);
      setScriptLanguage(spokenLanguage);
      if (mode === "podcast" && supabase) {
        const { data: session } = await supabase.auth.getSession();
        if (session.session?.user) void supabase.from("platform_activity_events").insert({ user_id: session.session.user.id, event_type: "podcast_script_generated", page: "assistant", details: {} });
      }
      setGenerationProgress(100);
      setStage("Complete — your episode is ready.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The learning studio is unavailable.",
      );
    } finally {
      window.setTimeout(() => {
        setWorking(false);
        setStage("");
        setGenerationProgress(0);
      }, 700);
    }
  };

  return (
    <section className="learning-studio card card-pad">
      <div className="card-header">
        <div>
          <div className="section-label">Notebook-style learning studio</div>
          <h2>Turn a topic into a conversation.</h2>
          <p className="subheading">
            Three independent perspectives, one source-grounded editor, then a
            listenable podcast or narrated lesson.
          </p>
        </div>
        <BookOpen size={20} />
      </div>
      <div className="studio-grid">
        <div>
          <label className="data-form">
            <span>Topic or question</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why was criminal defamation unconstitutional in Okuta?"
            />
          </label>
          <div className="studio-mode">
            <button
              className={mode === "podcast" ? "active" : ""}
              onClick={() => setMode("podcast")}
            >
              <Mic size={15} /> Two-speaker podcast
            </button>
            <button
              className={mode === "video" ? "active" : ""}
              onClick={() => setMode("video")}
            >
              <Video size={15} /> Narrated video lesson
            </button>
          </div>
          <label className="studio-language-select">
            <span>Script &amp; narration language</span>
            <select value={spokenLanguage} onChange={(event) => setSpokenLanguage(event.target.value as "en" | "sw" | "mix" | "sheng")}>
              <option value="en">English · natural Kenyan conversational voice</option>
              <option value="sw">Kiswahili · sauti ya kawaida</option>
              <option value="mix">Kiswahili + English · code-switching</option>
              <option value="sheng">English + Sheng · respectful Kenyan tone</option>
            </select>
          </label>
          <label className="studio-language-select"><span>Presenter tone</span><select value={presenterStyle} onChange={(event) => setPresenterStyle(event.target.value)}><option>Kenyan legal newsroom: warm, confident and clear</option><option>Formal constitutional advocate: measured, authoritative and structured</option><option>Parliamentary debate coach: energetic, analytical and concise</option><option>Senior courtroom educator: calm, deliberate and persuasive</option><option>Accessible campus law mentor: friendly, vivid and practical</option></select><small>These are fictional delivery profiles, not imitations of named lawyers.</small></label>
          {mode === "podcast" && <label className="studio-language-select"><span>Class speakers · names and voice gender</span><div className="studio-speaker-name-grid"><input value={presenterName} maxLength={40} onChange={(event) => setPresenterName(event.target.value.replace(/[^a-zA-ZÀ-ÿ' -]/g, ""))} placeholder="John" aria-label="Class presenter name" /><select value={presenterGender} onChange={(event) => setPresenterGender(event.target.value as "male" | "female")} aria-label="Class presenter voice gender"><option value="male">Masculine voice</option><option value="female">Feminine voice</option></select><input value={guideName} maxLength={40} onChange={(event) => setGuideName(event.target.value.replace(/[^a-zA-ZÀ-ÿ' -]/g, ""))} placeholder="Amina" aria-label="Law tutor name" /><select value={guideGender} onChange={(event) => setGuideGender(event.target.value as "male" | "female")} aria-label="Law tutor voice gender"><option value="male">Masculine voice</option><option value="female">Feminine voice</option></select></div><small>Pick the gender presentation that matches each chosen name. The generated lesson keeps names and synthesized voices aligned.</small></label>}
          {(working || stage) && (
            <div className="studio-progress" aria-live="polite">
              <div className="studio-progress-top">
                <span>{stage || "Preparing…"}</span>
                <strong>{generationProgress}%</strong>
              </div>
              <div className="studio-progress-track" role="progressbar" aria-valuenow={generationProgress} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${generationProgress}%` }} />
              </div>
              <p>Keep this page open while the source perspectives and final script are being prepared.</p>
            </div>
          )}
          <button
            className="primary-button studio-generate"
            onClick={() => void generate()}
            disabled={working || audioBusy || rendering || Boolean(importingSource) || !topic.trim() || !selected.length}
          >
            {working ? (
              <>
                <Loader2 size={14} className="studio-spin" /> {stage}
              </>
            ) : (
              "Build learning episode"
            )}
          </button>
          {error && (
            <div className="connection-error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
          {script && (
            <div className="studio-output">
              <div className="studio-output-head">
                <div>
                  <span className="section-label">
                    Final{" "}
                    {mode === "podcast" ? "podcast script" : "video lesson"}
                  </span>
                  <p className="field-hint">
                    Generated from{" "}
                    {selectedDocs.map((doc) => doc.title).join(", ")}
                  </p>
                </div>
                <div className="studio-output-actions">
                  <button className="secondary-button" onClick={download}>
                    Download script
                  </button>
                  <button className="secondary-button" onClick={() => void generatePodcastAudio()} disabled={audioBusy || rendering}>
                    {audioBusy ? <Loader2 size={13} className="studio-spin" /> : <Headphones size={13} />}
                    {audioBusy ? "Creating audio…" : audioUrl ? "Regenerate audio" : mode === "podcast" ? "Generate podcast audio" : "Generate narration audio"}
                  </button>
                  {mode === "video" && (
                    <button
                      className="primary-button"
                      onClick={() => void renderMp4()}
                      disabled={rendering || audioBusy}
                    >
                      <Download size={13} />{" "}
                      {rendering
                        ? `Rendering ${renderProgress}%`
                        : "Export MP4"}
                    </button>
                  )}
                </div>
              </div>
                <p className="field-hint">Build learning episode creates the script; generate audio to make a playable file. Members use Google Gemini TTS and, if configured, Hugging Face; only the administrator can use ElevenLabs or OpenAI TTS. Provider quotas and pricing depend on the configured account, so audio may still use paid quota.</p>
                {audioNote && <p className="field-hint">{audioNote}</p>}
                {audioBusy && <div className="studio-audio-progress" role="status" aria-live="polite"><div className="studio-audio-progress-top"><strong>{audioStage}</strong><span>{audioElapsedSeconds}s</span></div><div className="studio-audio-progress-track"><span style={{ width: `${audioProgress}%` }} /></div><small>Long scripts are processed in chunks. If a paid provider is out of quota, the next configured provider is tried automatically.</small></div>}
                {audioUrl && <div className="studio-audio-download"><audio controls preload="metadata" src={audioUrl} aria-label="Generated podcast audio player" onError={() => setAudioNote("The player could not load this audio. Regenerate it to create a fresh playback link.")} /><button className="secondary-button" onClick={() => void downloadGeneratedAudio()}><Download size={13} /> Download audio</button><span className="field-hint">Voice: {audioProviderLabel(audioProvider)}</span></div>}
              {mode === "video" && (
                <>
                  <p className="field-hint studio-export-note">
                    The MP4 contains the lesson scenes, captions, and source
                    reminder. Export MP4 uses the selected language and the same
                    natural AI narration provider as the audio player.
                  </p>
                  <div className="studio-slide">
                    <span>
                      Scene {Math.min(slide + 1, Math.max(1, pages.length))}
                    </span>
                    <p>{pages[slide] || script}</p>
                    <div>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setSlide((value) => Math.max(0, value - 1))
                        }
                      >
                        Previous
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setSlide((value) =>
                            Math.min(Math.max(0, pages.length - 1), value + 1),
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="studio-markdown">
                <Markdown text={script} />
              </div>
            </div>
          )}
        </div>
        <aside className="studio-sources">
          <div className="section-label">Choose source books or transcripts</div>
          <p className="field-hint">
            Select any AI-ready Library book, uploaded book, document, or saved transcript. Scroll inside the list when you have many sources.
          </p>
          <label className="secondary-button studio-upload-source">
            <Upload size={14} /> {uploadingSource ? "Uploading…" : "Upload book"}
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.rtf,.csv,.json,.html,application/*,text/*" disabled={uploadingSource} onChange={(event) => void uploadSourceBook(event.target.files?.[0])} />
          </label>
          {docs.length === 0 ? (
            <div className="empty">No AI-ready sources yet. Upload a book or finish a transcript above.</div>
          ) : (
            <div className="studio-source-scroll" aria-label="Podcast source books and transcripts">
              {docs.map((doc) => (
                <label
                  className={`studio-doc ${selected.includes(doc.id) ? "on" : ""}`}
                  key={doc.id}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id) || (doc.kind === "library" && Boolean(libraryImports[doc.id] && selected.includes(libraryImports[doc.id])))}
                    disabled={doc.kind === "library" && importingSource === doc.id}
                    onChange={() => void toggleSource(doc)}
                  />
                  <span>{doc.title}<small>{doc.kind === "library" ? (importingSource === doc.id ? "Preparing Library book for AI…" : "Library book · click to add readable text") : /transcript|recording/i.test(doc.title) ? "Saved transcript" : "My uploaded book or document"}</small></span>
                </label>
              ))}
            </div>
          )}
        </aside>
      </div>
      {panel.length > 0 && (
        <details className="studio-panel">
          <summary>Show the {panel.length} independent research memos</summary>
          {panel.map((memo, index) => (
            <div key={index}>
              <strong>Perspective {index + 1}</strong>
              <Markdown text={memo} />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
