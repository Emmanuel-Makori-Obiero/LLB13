import { useEffect, useMemo, useState } from "react";
<<<<<<< HEAD
import { BookOpen, Download, Loader2, Mic, Play, Square, Video } from "lucide-react";
=======
import {
  BookOpen,
  Download,
  Loader2,
  Mic,
  Play,
  Square,
  Video,
} from "lucide-react";
>>>>>>> abb2d2f (Finished)
import { askAI, listMyMaterials } from "./lib/ai";
import { Markdown } from "./Markdown";
import "./learning-studio.css";

type Doc = { id: string; title: string; scope: string };
type Mode = "podcast" | "video";

const perspectives = [
  "Act as a careful Kenyan law lecturer. Identify the governing rule, authorities, reasoning, and any uncertainty in the selected source.",
  "Act as a plain-language tutor. Explain the selected topic with a concrete everyday example, likely confusion, and a quick recall question.",
  "Act as a demanding moot coach. Test the strongest argument, counterargument, application, exam traps, and what a student must verify before relying on it.",
];

function speakable(text: string) {
<<<<<<< HEAD
  return text.replace(/[#*_`>\[\]]/g, "").replace(/\(verify\)/gi, "verify").replace(/\s+/g, " ").trim();
=======
  return text
    .replace(/[#*_`>\[\]]/g, "")
    .replace(/\(verify\)/gi, "verify")
    .replace(/\s+/g, " ")
    .trim();
>>>>>>> abb2d2f (Finished)
}

export default function LearningStudio() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("podcast");
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [script, setScript] = useState("");
  const [playing, setPlaying] = useState(false);
  const [slide, setSlide] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

<<<<<<< HEAD
  useEffect(() => { void listMyMaterials().then((items) => setDocs(items as Doc[])).catch(() => setError("Could not load your AI-ready documents.")); }, []);
  const selectedDocs = useMemo(() => docs.filter((doc) => selected.includes(doc.id)), [docs, selected]);
  const pages = useMemo(() => script.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean), [script]);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-6));
  const download = () => {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${(topic || "law-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`; link.click(); URL.revokeObjectURL(url);
  };
  const play = () => {
    if (!script || !("speechSynthesis" in window)) return;
    if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(speakable(script));
    utterance.lang = "en-KE"; utterance.rate = 0.9; utterance.pitch = 0.98;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => /en[-_]KE/i.test(voice.lang)) ?? voices.find((voice) => /en[-_](GB|AU|US)/i.test(voice.lang)) ?? null;
    utterance.onend = () => setPlaying(false); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setPlaying(true);
=======
  useEffect(() => {
    void listMyMaterials()
      .then((items) => setDocs(items as Doc[]))
      .catch(() => setError("Could not load your AI-ready documents."));
  }, []);
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

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id].slice(-6),
    );
  const download = () => {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(topic || "law-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const play = () => {
    if (!script || !("speechSynthesis" in window)) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speakable(script));
    utterance.lang = "en-KE";
    utterance.rate = 0.9;
    utterance.pitch = 0.98;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => /en[-_]KE/i.test(voice.lang)) ??
      voices.find((voice) => /en[-_](GB|AU|US)/i.test(voice.lang)) ??
      null;
    utterance.onend = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
>>>>>>> abb2d2f (Finished)
  };

  const renderMp4 = async () => {
    if (!pages.length || rendering) return;
<<<<<<< HEAD
    setRendering(true); setRenderProgress(0); setError("");
    try {
      const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context || !canvas.captureStream || typeof MediaRecorder === "undefined") throw new Error("MP4 export needs a recent Chrome, Edge, or Firefox browser.");
      const stream = canvas.captureStream(30); const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); }); recorder.start();
      const draw = (raw: string, index: number) => {
        const text = raw.replace(/^SCENE[^\n]*\n?/i, "").replace(/VISUAL:.*\n?/i, "").replace(/NARRATION:/i, "").replace(/SOURCE NOTE:.*/i, "").trim();
        context.fillStyle = "#163a34"; context.fillRect(0, 0, 1280, 720); context.fillStyle = "#c96e52"; context.fillRect(76, 76, 108, 8);
        context.fillStyle = "#f7f5f0"; context.font = "700 22px Arial"; context.fillText(`GROUP 13 HUB · SCENE ${index + 1}`, 76, 132); context.font = "500 42px Georgia"; context.fillText(topic.trim().slice(0, 48), 76, 205);
        context.fillStyle = "#ffffff"; context.font = "28px Arial"; let line = ""; let y = 300;
        for (const word of text.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width > 1080) { context.fillText(line, 76, y); line = word; y += 46; } else line = next; if (y > 590) break; }
        if (line && y <= 590) context.fillText(line, 76, y); context.fillStyle = "#ffffffa8"; context.font = "18px Arial"; context.fillText("Source-grounded study lesson · Verify authorities before relying on them", 76, 665);
      };
      for (let index = 0; index < pages.length; index += 1) { draw(pages[index], index); await new Promise((resolve) => window.setTimeout(resolve, 5200)); setRenderProgress(Math.round(((index + 1) / pages.length) * 80)); }
      recorder.stop(); await stopped; stream.getTracks().forEach((track) => track.stop()); setRenderProgress(85);
      const webm = new Blob(chunks, { type: "video/webm" }); const { FFmpeg } = await import("@ffmpeg/ffmpeg"); const { fetchFile, toBlobURL } = await import("@ffmpeg/util"); const ffmpeg = new FFmpeg(); const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
      await ffmpeg.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm") }); await ffmpeg.writeFile("lesson.webm", await fetchFile(webm)); await ffmpeg.exec(["-i", "lesson.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "lesson.mp4"]);
      const data = await ffmpeg.readFile("lesson.mp4"); const bytes = new Uint8Array(data as Uint8Array); const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" })); const link = document.createElement("a"); link.href = url; link.download = `${(topic || "law-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 5000); await ffmpeg.terminate(); setRenderProgress(100);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not render the MP4 lesson."); }
    finally { setRendering(false); }
=======
    setRendering(true);
    setRenderProgress(0);
    setError("");
    try {
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
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });
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
        await new Promise((resolve) => window.setTimeout(resolve, 5200));
        setRenderProgress(Math.round(((index + 1) / pages.length) * 80));
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
      await ffmpeg.exec([
        "-i",
        "lesson.webm",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not render the MP4 lesson.",
      );
    } finally {
      setRendering(false);
    }
>>>>>>> abb2d2f (Finished)
  };

  const generate = async () => {
    if (!topic.trim() || !selected.length || working) return;
<<<<<<< HEAD
    setWorking(true); setError(""); setPanel([]); setScript(""); setSlide(0);
=======
    setWorking(true);
    setError("");
    setPanel([]);
    setScript("");
    setSlide(0);
>>>>>>> abb2d2f (Finished)
    try {
      const findings: string[] = [];
      for (let index = 0; index < perspectives.length; index += 1) {
        setStage(`AI perspective ${index + 1} of ${perspectives.length}…`);
<<<<<<< HEAD
        const result = await askAI({ feature: "topic_summary", mode: "auto", docIds: selected, messages: [{ role: "user", content: `${perspectives[index]}\n\nTopic: ${topic.trim()}\nReturn a focused memo for a later script editor. Do not invent authorities.` }] });
        findings.push(result.answer);
      }
      setPanel(findings);
      setStage(mode === "podcast" ? "Editing the two-speaker episode…" : "Editing the narrated video lesson…");
      const editor = await askAI({ feature: mode === "podcast" ? "podcast_script" : "video_script", mode: "auto", docIds: selected, messages: [{ role: "user", content: `Topic: ${topic.trim()}\n\nIndependent research memos from the AI panel:\n${findings.map((item, i) => `MEMO ${i + 1}\n${item}`).join("\n\n")}\n\nCreate the final ${mode} now. Keep it faithful to the selected sources, cite source markers when available, and mark uncertain law for verification.` }] });
      setScript(editor.answer);
    } catch (e) { setError(e instanceof Error ? e.message : "The learning studio is unavailable."); }
    finally { setWorking(false); setStage(""); }
  };

  return <section className="learning-studio card card-pad">
    <div className="card-header"><div><div className="section-label">Notebook-style learning studio</div><h2>Turn a topic into a conversation.</h2><p className="subheading">Three independent perspectives, one source-grounded editor, then a listenable podcast or narrated lesson.</p></div><BookOpen size={20} /></div>
    <div className="studio-grid">
      <div>
        <label className="data-form"><span>Topic or question</span><input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Why was criminal defamation unconstitutional in Okuta?" /></label>
        <div className="studio-mode"><button className={mode === "podcast" ? "active" : ""} onClick={() => setMode("podcast")}><Mic size={15} /> Two-speaker podcast</button><button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}><Video size={15} /> Narrated video lesson</button></div>
        <button className="primary-button studio-generate" onClick={() => void generate()} disabled={working || !topic.trim() || !selected.length}>{working ? <><Loader2 size={14} className="studio-spin" /> {stage}</> : "Build learning episode"}</button>
        {error && <div className="connection-error" style={{ marginTop: 12 }}>{error}</div>}
        {script && <div className="studio-output"><div className="studio-output-head"><div><span className="section-label">Final {mode === "podcast" ? "podcast script" : "video lesson"}</span><p className="field-hint">Generated from {selectedDocs.map((doc) => doc.title).join(", ")}</p></div><div className="studio-output-actions"><button className="secondary-button" onClick={play}>{playing ? <><Square size={13} /> Stop</> : <><Play size={13} /> Listen</>}</button><button className="secondary-button" onClick={download}>Download script</button>{mode === "video" && <button className="primary-button" onClick={() => void renderMp4()} disabled={rendering}><Download size={13} /> {rendering ? `Rendering ${renderProgress}%` : "Export MP4"}</button>}</div></div>{mode === "video" && <><p className="field-hint studio-export-note">The MP4 contains the lesson scenes, captions, and source reminder. Use Listen for browser narration while reviewing the script.</p><div className="studio-slide"><span>Scene {Math.min(slide + 1, Math.max(1, pages.length))}</span><p>{pages[slide] || script}</p><div><button className="secondary-button" onClick={() => setSlide((value) => Math.max(0, value - 1))}>Previous</button><button className="secondary-button" onClick={() => setSlide((value) => Math.min(Math.max(0, pages.length - 1), value + 1))}>Next</button></div></div></>}<div className="studio-markdown"><Markdown text={script} /></div></div>}
      </div>
      <aside className="studio-sources"><div className="section-label">Choose source books</div><p className="field-hint">The panel will only use selected AI-ready documents.</p>{docs.length === 0 ? <div className="empty">Upload a PDF, Word file, or text document in Study assistant first.</div> : docs.map((doc) => <label className={`studio-doc ${selected.includes(doc.id) ? "on" : ""}`} key={doc.id}><input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)} /><span>{doc.title}</span></label>)}</aside>
    </div>
    {panel.length > 0 && <details className="studio-panel"><summary>Show the {panel.length} independent research memos</summary>{panel.map((memo, index) => <div key={index}><strong>Perspective {index + 1}</strong><Markdown text={memo} /></div>)}</details>}
  </section>;
=======
        const result = await askAI({
          feature: "topic_summary",
          mode: "auto",
          docIds: selected,
          messages: [
            {
              role: "user",
              content: `${perspectives[index]}\n\nTopic: ${topic.trim()}\nReturn a focused memo for a later script editor. Do not invent authorities.`,
            },
          ],
        });
        findings.push(result.answer);
      }
      setPanel(findings);
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
            content: `Topic: ${topic.trim()}\n\nIndependent research memos from the AI panel:\n${findings.map((item, i) => `MEMO ${i + 1}\n${item}`).join("\n\n")}\n\nCreate the final ${mode} now. Keep it faithful to the selected sources, cite source markers when available, and mark uncertain law for verification.`,
          },
        ],
      });
      setScript(editor.answer);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The learning studio is unavailable.",
      );
    } finally {
      setWorking(false);
      setStage("");
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
          <button
            className="primary-button studio-generate"
            onClick={() => void generate()}
            disabled={working || !topic.trim() || !selected.length}
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
                  <button className="secondary-button" onClick={play}>
                    {playing ? (
                      <>
                        <Square size={13} /> Stop
                      </>
                    ) : (
                      <>
                        <Play size={13} /> Listen
                      </>
                    )}
                  </button>
                  <button className="secondary-button" onClick={download}>
                    Download script
                  </button>
                  {mode === "video" && (
                    <button
                      className="primary-button"
                      onClick={() => void renderMp4()}
                      disabled={rendering}
                    >
                      <Download size={13} />{" "}
                      {rendering
                        ? `Rendering ${renderProgress}%`
                        : "Export MP4"}
                    </button>
                  )}
                </div>
              </div>
              {mode === "video" && (
                <>
                  <p className="field-hint studio-export-note">
                    The MP4 contains the lesson scenes, captions, and source
                    reminder. Use Listen for browser narration while reviewing
                    the script.
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
          <div className="section-label">Choose source books</div>
          <p className="field-hint">
            The panel will only use selected AI-ready documents.
          </p>
          {docs.length === 0 ? (
            <div className="empty">
              Upload a PDF, Word file, or text document in Study assistant
              first.
            </div>
          ) : (
            docs.map((doc) => (
              <label
                className={`studio-doc ${selected.includes(doc.id) ? "on" : ""}`}
                key={doc.id}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(doc.id)}
                  onChange={() => toggle(doc.id)}
                />
                <span>{doc.title}</span>
              </label>
            ))
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
>>>>>>> abb2d2f (Finished)
}
