import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Mic, Search, Trash2, X } from "lucide-react";
import { supabase } from "./data/repository";
import type { Unit } from "./data/types";
import "./transcribe.css";
import { TranscriptAI } from "./TranscriptAI";
import { downloadPdf, downloadWord } from "./export";

type Props = {
  units: Unit[];
  userId: string | null;
  isAdmin: boolean;
  displayName: string;
  setNotice: (notice: string) => void;
  initialUnit?: string;
};

type TranscriptRow = {
  id: string;
  title: string;
  unit: string | null;
  language: string | null;
  uploader_name: string | null;
  created_by: string | null;
  duration_seconds: number | null;
  total_chunks: number | null;
  status: "processing" | "done" | "failed";
  lesson_number: number | null;
  lesson_title: string | null;
  created_at: string;
};
type Segment = { start: number; end: number; text: string };
type Chunk = {
  idx: number;
  start_seconds: number;
  text: string;
  segments: Segment[] | null;
};
type Progress = { phase: string; done: number; total: number };

const CHUNK_SECONDS = 600; // 10-minute pieces, about 2.4 MB each at 32 kbps
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const COLUMNS =
  "id,title,unit,lesson_number,lesson_title,language,uploader_name,created_by,duration_seconds,total_chunks,status,created_at";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
};
const niceWait = (seconds: number) =>
  seconds >= 90
    ? `${Math.ceil(seconds / 60)} min`
    : `${Math.max(1, Math.ceil(seconds))} s`;
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Turn the chunks of a transcript into readable paragraphs with a start time.
function toParagraphs(chunks: Chunk[]) {
  const paragraphs: { t: number; text: string }[] = [];
  for (const chunk of chunks) {
    const segments = chunk.segments ?? [];
    if (!segments.length) {
      if (chunk.text)
        paragraphs.push({ t: chunk.start_seconds, text: chunk.text });
      continue;
    }
    for (let i = 0; i < segments.length; i += 6) {
      const group = segments.slice(i, i + 6);
      paragraphs.push({
        t: group[0].start,
        text: group
          .map((segment) => segment.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
  }
  return paragraphs.filter((paragraph) => paragraph.text);
}

// ffmpeg.wasm runs in the browser: it shrinks the recording to 16 kHz mono MP3 and cuts it into 10-minute pieces.
async function splitAudio(file: File, onProgress: (ratio: number) => void) {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(
      `${CORE_BASE}/ffmpeg-core.wasm`,
      "application/wasm",
    ),
  });
  let total = 0;
  ffmpeg.on("log", ({ message }) => {
    const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
    if (match && !total)
      total =
        Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  });
  ffmpeg.on("progress", ({ progress }) =>
    onProgress(Math.min(1, Math.max(0, progress))),
  );
  await ffmpeg.writeFile("input", await fetchFile(file));
  const code = await ffmpeg.exec([
    "-i",
    "input",
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "32k",
    "-f",
    "segment",
    "-segment_time",
    String(CHUNK_SECONDS),
    "-reset_timestamps",
    "1",
    "chunk_%03d.mp3",
  ]);
  if (code !== 0)
    throw new Error(
      "Could not read that audio file. Try exporting it as MP3 or M4A.",
    );
  await ffmpeg.deleteFile("input");
  const names = (await ffmpeg.listDir("/"))
    .filter((entry) => !entry.isDir && /^chunk_\d+\.mp3$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!names.length) throw new Error("No audio was found in that file.");
  const duration = total || names.length * CHUNK_SECONDS;
  const read = async (index: number) => {
    const data = (await ffmpeg.readFile(names[index])) as Uint8Array;
    const blob = new Blob([data.slice().buffer as ArrayBuffer], {
      type: "audio/mpeg",
    });
    await ffmpeg.deleteFile(names[index]);
    return blob;
  };
  return {
    count: names.length,
    duration,
    read,
    terminate: () => ffmpeg.terminate(),
  };
}

export default function TranscribePage({
  units,
  userId,
  isAdmin,
  displayName,
  setNotice,
  initialUnit,
}: Props) {
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState(initialUnit ?? "");
  const [lessonNumber, setLessonNumber] = useState("");
  const [language, setLanguage] = useState("en");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [query, setQuery] = useState("");
  const [resumeFor, setResumeFor] = useState<TranscriptRow | null>(null);
  const cancelRef = useRef(false);
  const resumeInput = useRef<HTMLInputElement>(null);
  const endpoint = import.meta.env.VITE_TRANSCRIBE_URL as string | undefined;

  useEffect(() => {
    if (initialUnit) setUnit(initialUnit);
  }, [initialUnit]);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("transcripts")
      .select(COLUMNS)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as TranscriptRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const openTranscript = async (id: string) => {
    if (!supabase) return;
    setOpenId(id);
    setQuery("");
    setChunks([]);
    const { data, error } = await supabase
      .from("transcript_chunks")
      .select("idx,start_seconds,text,segments")
      .eq("transcript_id", id)
      .order("idx");
    if (error) {
      setNotice("Could not load that transcript.");
      return;
    }
    setChunks((data ?? []) as Chunk[]);
  };

  const wait = async (
    seconds: number,
    label: string,
    done: number,
    total: number,
  ) => {
    for (let left = seconds; left > 0; left -= 1) {
      if (cancelRef.current) throw new Error("cancelled");
      setProgress({
        phase: `${label} Continuing in ${niceWait(left)}…`,
        done,
        total,
      });
      await sleep(1000);
    }
  };

  const sendChunk = async (
    blob: Blob,
    index: number,
    duration: number,
    transcriptId: string,
    done: number,
    total: number,
    globalIndex: number,
    offsetSeconds: number,
    previousText: string,
  ): Promise<string> => {
    let attempts = 0;
    for (;;) {
      if (cancelRef.current) throw new Error("cancelled");
      const { data: session } = (await supabase?.auth.getSession()) ?? {
        data: { session: null },
      };
      const form = new FormData();
      form.append("audio", blob, `chunk_${index}.mp3`);
      form.append("language", language);
      form.append("transcript_id", transcriptId);
      form.append("idx", String(globalIndex));
      form.append("offset", String(offsetSeconds + index * CHUNK_SECONDS));
      form.append("duration", String(duration));
      if (previousText) form.append("continuation", previousText.slice(-1800));
      let response: Response;
      try {
        response = await fetch(endpoint!, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.session?.access_token ?? ""}`,
          },
          body: form,
        });
      } catch {
        attempts += 1;
        if (attempts >= 4)
          throw new Error(
            "Network problem. Check your internet and use Resume to continue.",
          );
        await sleep(3000 * attempts);
        continue;
      }
      if (response.status === 429) {
        const info = (await response.json().catch(() => ({}))) as {
          retry_after?: number;
          scope?: string;
        };
        const reason =
          info.scope === "day"
            ? "The group\u2019s free daily quota is used up."
            : "Free hourly quota reached.";
        await wait(Math.max(10, info.retry_after ?? 60), reason, done, total);
        continue;
      }
      if (!response.ok) {
        const info = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        attempts += 1;
        if (attempts >= 3)
          throw new Error(info.error ?? "The transcription service failed.");
        await sleep(3000 * attempts);
        continue;
      }
      const result = (await response.json().catch(() => ({}))) as { text?: string };
      return String(result.text ?? "");
    }
  };

  const run = async (audioFiles: File[], existing: TranscriptRow | null) => {
    if (!supabase || !endpoint) {
      setNotice(
        "Transcription is not configured yet. Add VITE_TRANSCRIBE_URL.",
      );
      return;
    }
    cancelRef.current = false;
    setBusy(true);
    setMessage("");
    setOpenId(null);
    let wakeLock: { release: () => Promise<void> } | null = null;
    try {
      wakeLock =
        (await (
          navigator as unknown as {
            wakeLock?: {
              request: (
                type: "screen",
              ) => Promise<{ release: () => Promise<void> }>;
            };
          }
        ).wakeLock?.request("screen")) ?? null;
    } catch {
      /* optional */
    }
    let splitter: Awaited<ReturnType<typeof splitAudio>> | null = null;
    try {
      setProgress({
        phase:
          "Preparing audio on your device… (this can take a few minutes for a long lesson)",
        done: 0,
        total: 1,
      });
      let record = existing;
      let finished = new Set<number>();
      let globalIndex = 0;
      let offsetSeconds = 0;
      let previousText = "";
      if (record) {
        const { data } = await supabase
          .from("transcript_chunks")
          .select("idx")
          .eq("transcript_id", record.id);
        finished = new Set(
          (data ?? []).map((row) => (row as { idx: number }).idx),
        );
      }
      for (let fileIndex = 0; fileIndex < audioFiles.length; fileIndex += 1) {
        const audio = audioFiles[fileIndex];
        setProgress({ phase: `Preparing part ${fileIndex + 1} of ${audioFiles.length}…`, done: finished.size, total: Math.max(finished.size + 1, globalIndex + 1) });
        splitter = await splitAudio(audio, (ratio) =>
          setProgress({ phase: `Preparing ${audio.name}… ${Math.round(ratio * 100)}%`, done: finished.size, total: Math.max(finished.size + 1, globalIndex + 1) }),
        );
        const partTotal = splitter.count;
        if (!record) {
          const { data, error } = await supabase
            .from("transcripts")
            .insert({ title: title.trim(), unit: unit || null, lesson_number: lessonNumber ? Number(lessonNumber) : null, lesson_title: title.trim() || null, language, uploader_name: displayName, duration_seconds: Math.round(splitter.duration), total_chunks: partTotal, status: "processing" })
            .select(COLUMNS).single();
          if (error || !data) throw new Error(error?.message ?? "Could not start the transcript.");
          record = data as TranscriptRow;
          setRows((current) => [record as TranscriptRow, ...current]);
        } else if (fileIndex > 0 || globalIndex > 0) {
          const durationTotal = (record.duration_seconds ?? 0) + Math.round(splitter.duration);
          const chunkTotal = (record.total_chunks ?? 0) + partTotal;
          await supabase.from("transcripts").update({ duration_seconds: durationTotal, total_chunks: chunkTotal }).eq("id", record.id);
          record = { ...record, duration_seconds: durationTotal, total_chunks: chunkTotal };
        }
        const total = Math.max(finished.size + partTotal, globalIndex + partTotal);
        for (let index = 0; index < partTotal; index += 1) {
          if (finished.has(globalIndex)) { globalIndex += 1; continue; }
          const done = finished.size;
          setProgress({ phase: `Transcribing ${fileIndex + 1}/${audioFiles.length}, part ${index + 1} of ${partTotal}…`, done, total });
          const blob = await splitter.read(index);
          const recognized = await sendChunk(blob, index, Math.max(10, Math.min(CHUNK_SECONDS, splitter.duration - index * CHUNK_SECONDS)), record.id, done, total, globalIndex, offsetSeconds, previousText);
          finished.add(globalIndex);
          globalIndex += 1;
          previousText = `${previousText} ${recognized}`.trim().slice(-1800);
        }
        offsetSeconds += splitter.duration;
        splitter.terminate();
        splitter = null;
      }
      if (!record) throw new Error("Could not create the stitched transcript.");
      await supabase
        .from("transcripts")
        .update({ status: "done" })
        .eq("id", record.id);
      setProgress(null);
      setFiles([]);
      setTitle("");
      setLessonNumber("");
      setNotice("Transcript ready for everyone in the group.");
      await load();
      void openTranscript(record.id);
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Something went wrong.";
      if (text === "cancelled")
        setMessage(
          "Paused. What is done so far is saved. Use Resume on the transcript and pick the same file to continue.",
        );
      else
        setMessage(
          `${text} Whatever finished is saved. Use Resume to continue.`,
        );
      setProgress(null);
      await load();
    } finally {
      splitter?.terminate();
      void wakeLock?.release().catch(() => undefined);
      setBusy(false);
      setResumeFor(null);
    }
  };

  const start = () => {
    if (!files.length) {
      setNotice("Choose one or more audio files first.");
      return;
    }
    if (!title.trim()) {
      setNotice("Give the recording a title, e.g. Constitutional Law, Week 3.");
      return;
    }
    if (files.some((item) => item.size > 700 * 1024 * 1024)) {
      setNotice("One of those files is very large. Export it as MP3 or M4A first.");
      return;
    }
    void run(files, null);
  };

  const remove = async (row: TranscriptRow) => {
    if (!supabase || !window.confirm(`Delete "${row.title}" for everyone?`))
      return;
    const { error } = await supabase
      .from("transcripts")
      .delete()
      .eq("id", row.id);
    if (error) {
      setNotice("Could not delete that transcript.");
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (openId === row.id) setOpenId(null);
    setNotice("Transcript deleted.");
  };

  const opened = rows.find((row) => row.id === openId);
  const paragraphs = useMemo(() => toParagraphs(chunks), [chunks]);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? paragraphs.filter((paragraph) =>
        paragraph.text.toLowerCase().includes(needle),
      )
    : paragraphs;
  const highlight = (text: string) => {
    if (!needle) return text;
    return text
      .split(new RegExp(`(${escapeRegExp(query.trim())})`, "ig"))
      .map((part, i) =>
        part.toLowerCase() === needle ? <mark key={i}>{part}</mark> : part,
      );
  };
  const fullText = () =>
    paragraphs
      .map((paragraph) => `[${clock(paragraph.t)}] ${paragraph.text}`)
      .join("\n\n");
  const download = () => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob(
        [
          `${opened?.title ?? "Transcript"}\n${opened?.unit ?? ""}\n\n${fullText()}`,
        ],
        { type: "text/plain" },
      ),
    );
    link.href = url;
    link.download = `${(opened?.title ?? "transcript").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadTranscriptPdf = () => {
    const title = opened?.title ?? "Transcript";
    downloadPdf(
      title,
      `${title}\n${opened?.unit ?? ""}\n\n${fullText()}`,
      `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "transcript"}.pdf`,
    );
  };
  const downloadTranscriptWord = () => {
    const title = opened?.title ?? "Transcript";
    downloadWord(
      title,
      `${title}\n${opened?.unit ?? ""}\n\n${fullText()}`,
      `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "transcript"}.doc`,
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="heading">Lecture transcripts.</h1>
          <p className="subheading">
            Upload one or more recordings and they are stitched into one searchable
            lesson transcript for the whole group. Put the recordings in order.
          </p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-label">Transcribe a recording</div>
        <div className="tr-form data-form">
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Separation of powers"
              disabled={busy}
            />
          </label>
          <label>
            Lesson number <span className="field-hint">(optional)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={lessonNumber}
              onChange={(event) => setLessonNumber(event.target.value)}
              placeholder="e.g. 1"
              disabled={busy}
            />
          </label>
          <div className="tr-two">
            <label>
              Unit
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                disabled={busy}
              >
                <option value="">Not set</option>
                {units.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Spoken language
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={busy}
              >
                <option value="en">English</option>
                <option value="sw">Kiswahili · Kenyan accent</option>
                <option value="en-sw">English + Kiswahili · code-switching</option>
                <option value="sw-sheng">English + Kiswahili / Sheng · code-switching</option>
                <option value="auto">Detect automatically · English, Kiswahili or Sheng</option>
              </select>
            </label>
          </div>
          <label>
            Audio files (select one or more)
            <input
              type="file"
              accept="audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.ogg,.opus,.amr,.mp4"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              disabled={busy}
              multiple
            />
          </label>
          {files.length > 0 && (
            <div className="tr-file-list" aria-label="Ordered audio parts">
              <div className="field-hint">These recordings will be stitched in this order:</div>
              {files.map((item, index) => (
                <div className="tr-file" key={`${item.name}-${item.size}-${index}`}>
                  <span><strong>{index + 1}.</strong> {item.name}</span>
                  <button type="button" className="icon-button" disabled={busy || index === 0} onClick={() => setFiles((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} aria-label="Move audio part up">↑</button>
                  <button type="button" className="icon-button" disabled={busy || index === files.length - 1} onClick={() => setFiles((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} aria-label="Move audio part down">↓</button>
                  <button type="button" className="icon-button" disabled={busy} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item.name}`}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="tr-actions">
            <button
              className="primary-button"
              onClick={start}
              disabled={busy || !files.length}
            >
              <Mic size={14} style={{ verticalAlign: "middle" }} /> Start
              transcription
            </button>
            {busy && (
              <button
                className="secondary-button"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                Pause
              </button>
            )}
          </div>
        </div>
        {progress && (
          <div className="tr-status">
            <div className="row-meta">{progress.phase}</div>
            <div className="progress">
              <span
                style={{
                  width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="field-hint">
              {progress.done} of {progress.total} parts done. Keep this tab open
              and the screen on. Your phone or laptop does the preparing, so use
              Wi-Fi.
            </div>
          </div>
        )}
        {message && <p className="tr-note">{message}</p>}
        <p className="tr-note">
          Add as many recordings as you need for one class. The parts are joined in the order shown above, with continuous timestamps and context carried from one recording into the next. The free service allows about 2 hours of audio per hour and 8 hours
          per day for the whole group together. A 3-hour lesson can need a short
          wait partway through, and it carries on by itself. Recordings are sent
          to Groq for transcription.
        </p>
      </div>

      <input
        ref={resumeInput}
        type="file"
        accept="audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.ogg,.opus,.amr,.mp4"
        hidden
        multiple
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (picked.length && resumeFor) void run(picked, resumeFor);
        }}
      />

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-label">All transcripts · {rows.length}</div>
        {loading && <p className="field-hint">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="field-hint">
            No transcripts yet. Upload the first recording above.
          </p>
        )}
        <div className="row-list">
          {rows.map((row) => {
            const mine = !!userId && row.created_by === userId;
            return (
              <div className="row" key={row.id}>
                <div
                  className="row-main"
                  style={{ cursor: "pointer" }}
                  onClick={() => void openTranscript(row.id)}
                >
                  <div className="row-title">
                    {row.lesson_number ? `Lesson ${row.lesson_number}: ` : ""}
                    {row.lesson_title || row.title}
                  </div>
                  <div className="row-meta">
                    {[
                      row.unit,
                      row.uploader_name && `by ${row.uploader_name}`,
                      row.duration_seconds ? clock(row.duration_seconds) : null,
                      new Date(row.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="row-end">
                  {row.status !== "done" && (
                    <span className="chip">
                      {mine ? "Unfinished" : "In progress"}
                    </span>
                  )}
                  {row.status !== "done" && mine && !busy && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setResumeFor(row);
                        resumeInput.current?.click();
                      }}
                    >
                      Resume
                    </button>
                  )}
                  {(mine || isAdmin) && (
                    <button
                      className="icon-button"
                      aria-label={`Delete ${row.title}`}
                      onClick={() => void remove(row)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {opened && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="section-label">{opened.title}</span>
            <button
              className="icon-button"
              aria-label="Close transcript"
              onClick={() => setOpenId(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="search" style={{ marginTop: 8 }}>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this transcript…"
            />
          </div>
          <div className="tr-actions">
            <button className="secondary-button" onClick={download}>
              <Download size={13} style={{ verticalAlign: "middle" }} />{" "}
              Download .txt
            </button>
            <button
              className="secondary-button"
              onClick={downloadTranscriptPdf}
            >
              <Download size={13} style={{ verticalAlign: "middle" }} />{" "}
              Download PDF
            </button>
            <button
              className="secondary-button"
              onClick={downloadTranscriptWord}
            >
              <Download size={13} style={{ verticalAlign: "middle" }} />{" "}
              Download Word
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                void navigator.clipboard?.writeText(fullText());
                setNotice("Transcript copied.");
              }}
            >
              <Copy size={13} style={{ verticalAlign: "middle" }} /> Copy
            </button>
          </div>
          <TranscriptAI
            key={opened.id + chunks.length}
            transcriptId={opened.id}
            userId={userId}
            title={opened.title}
            ready={chunks.length > 0}
            getText={() =>
              paragraphs.map((paragraph) => paragraph.text).join("\n\n")
            }
          />
          {opened.status !== "done" && (
            <p className="tr-note">
              This transcript is still being processed, so it may be incomplete.
            </p>
          )}
          <div className="tr-reader">
            {shown.length === 0 && (
              <p className="field-hint">
                {chunks.length
                  ? "Nothing matches that search."
                  : "No text yet."}
              </p>
            )}
            {shown.map((paragraph, i) => (
              <div className="tr-para" key={i}>
                <div className="tr-time">{clock(paragraph.t)}</div>
                <div>{highlight(paragraph.text)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
