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
import { Markdown } from "./Markdown";
import "./learning-studio.css";

type Doc = { id: string; title: string; scope: "user" | "library"; citation?: string | null; kind?: "document" | "library"; url?: string | null };
type Mode = "podcast" | "video";
const isBookSource = (_doc: Doc) => true;

function audioProviderLabel(provider: string | null) {
  if (!provider) return "configured speech provider";
  if (provider.includes("elevenlabs")) return "ElevenLabs";
  if (provider.includes("gemini")) return "Google Gemini TTS";
  if (provider.includes("openai")) return "OpenAI TTS";
  if (provider.includes("huggingface")) return "Hugging Face TTS";
  return provider.replace(/[-_]/g, " ");
}

const perspectives = [
  "Act as a careful Kenyan law lecturer. Identify the governing rule, authorities, reasoning, and any uncertainty in the selected source.",
  "Act as a plain-language tutor. Explain the selected topic with a concrete everyday example, likely confusion, and a quick recall question.",
  "Act as a demanding moot coach. Test the strongest argument, counterargument, application, exam traps, and what a student must verify before relying on it.",
];

export default function LearningStudio() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("podcast");
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [script, setScript] = useState("");
  const [spokenLanguage, setSpokenLanguage] = useState<"en" | "sw">("en");
  const [scriptLanguage, setScriptLanguage] = useState<"en" | "sw">("en");
  const [slide, setSlide] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [importingSource, setImportingSource] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState("audio/mpeg");
  const [audioProvider, setAudioProvider] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState("");
  const audioRequestId = useRef(0);

  const loadSources = async () => {
    const [items, library] = await Promise.all([listMyMaterials(), import("./lib/guidedStudy").then(({ listGuideSources }) => listGuideSources())]);
    const documents = (items as Doc[]).filter(isBookSource).map((doc) => ({ ...doc, kind: "document" as const }));
    const libraryBooks = library.filter((source) => source.kind === "material" && source.url).map((source) => ({ id: `library:${source.id}`, title: source.title, scope: "library" as const, citation: source.citation, kind: "library" as const, url: source.url }));
    const books = [...documents, ...libraryBooks];
    setDocs(books);
    setSelected((current) => current.filter((id) => books.some((doc) => doc.id === id)));
  };
  useEffect(() => { void loadSources().catch(() => setError("Could not load your Library and AI-ready sources.")); }, []);
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
    setImportingSource(doc.id); setError("");
    try {
      const imported = await importLibraryMaterial({ title: doc.title, url: doc.url, citation: doc.citation });
      await loadSources();
      setSelected((current) => [...current.filter((id) => id !== doc.id), imported.id].slice(-6));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare that Library book for AI."); }
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
    setAudioUrl(null);
    setAudioProvider(null);
    setAudioNote("Creating fluent voice audio…");
    try {
      const result = await generateAudio({ text: scriptSnapshot, title: topic || "Podcast episode", language: languageSnapshot });
      if (requestId !== audioRequestId.current) return;
      setAudioUrl(result.signed_url);
      setAudioMimeType(result.mime_type || "audio/mpeg");
      setAudioProvider(result.asset?.provider || null);
      setAudioNote("Audio is ready and saved in Media archive. Listen below, download it, or open Media to play and share it with Group 13.");
    } catch (e) {
      if (requestId === audioRequestId.current) setAudioNote(e instanceof Error ? e.message : "Could not create audio.");
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
            content: `Topic: ${topic.trim()}\n${languageInstruction}\n\nIndependent research memos from the AI panel:\n${findings.map((item, i) => `MEMO ${i + 1}\n${item}`).join("\n\n")}\n\nCreate the final ${mode} now. Keep it faithful to the selected sources, cite source markers when available, and mark uncertain law for verification.`,
          },
        ],
      });
      let finalScript = editor.answer.trim();
      if (mode === "podcast") {
        finalScript = finalScript
          .replace(/^Speaker\s*1\s*:/gim, "HOST:")
          .replace(/^Speaker\s*2\s*:/gim, "TUTOR:")
          .replace(/^Host\s*:/gim, "HOST:")
          .replace(/^Tutor\s*:/gim, "TUTOR:");
        if (!/HOST\s*:/i.test(finalScript) || !/TUTOR\s*:/i.test(finalScript)) {
          throw new Error("The podcast editor returned an invalid two-speaker script. Please try again.");
        }
      } else if (!/SCENE\s*\d+/i.test(finalScript) || !/NARRATION\s*:/i.test(finalScript)) {
        throw new Error("The narration editor returned an incomplete scene script. Please try again.");
      }
      setScript(finalScript);
      setScriptLanguage(spokenLanguage);
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
            <select value={spokenLanguage} onChange={(event) => setSpokenLanguage(event.target.value as "en" | "sw")}>
              <option value="en">English · natural conversational voice</option>
              <option value="sw">Kiswahili · sauti ya kawaida</option>
            </select>
            <small>New scripts follow this language. Existing scripts keep their original language until rebuilt.</small>
          </label>
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
            disabled={working || audioBusy || rendering || !topic.trim() || !selected.length}
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
                <p className="field-hint">Build learning episode creates the script; generate audio to make a playable file. The server tries ElevenLabs, then Google Gemini TTS, then English-only OpenAI TTS when configured. An optional English-only Hugging Face fallback can also be enabled. Provider use may consume quota or incur charges, so avoid confidential material.</p>
                {audioNote && <p className="field-hint">{audioNote}</p>}
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
            <input type="file" accept=".pdf,.doc,.docx,.txt,.md" disabled={uploadingSource} onChange={(event) => void uploadSourceBook(event.target.files?.[0])} />
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
                    checked={doc.kind !== "library" && selected.includes(doc.id)}
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
