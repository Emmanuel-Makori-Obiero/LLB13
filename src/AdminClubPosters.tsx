import { useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { analyzeImage } from "./lib/cloudMedia";
import { repository } from "./data/repository";
import type { ClubPoster } from "./data/types";
import "./admin.css";

type Props = { setNotice: (notice: string) => void };

const toBase64 = async (file: File) => {
  const readBytes = async () => {
    try { return await file.arrayBuffer(); } catch { /* Try another browser reader. */ }
    try { return await new Response(file).arrayBuffer(); } catch { /* Try FileReader below. */ }
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("File reader failed"));
      reader.readAsArrayBuffer(file);
    });
  };
  try {
    const buffer = await readBytes();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      for (let index = 0; index < chunk.length; index += 1) binary += String.fromCharCode(chunk[index]);
    }
    const encoded = btoa(binary);
    if (!encoded) throw new Error("The selected image is empty.");
    return encoded;
  } catch {
    throw new Error("Could not read that image. Please choose a PNG, JPG, or WebP file and try again.");
  }
};

const readAnalysisField = (analysis: string, labels: string[]) => {
  const pattern = new RegExp(`(?:${labels.join("|")})\\s*:\\s*(.+)`, "i");
  return analysis.split(/\r?\n/).map((line) => line.trim()).map((line) => line.replace(/^[-*•]\s*/, "")).map((line) => line.match(pattern)?.[1]?.trim() ?? "").find(Boolean) ?? "";
};

const readAnalysisLink = (analysis: string) => {
  const match = analysis.match(/https?:\/\/[^\s)\]}>,]+/i);
  return match?.[0]?.replace(/[.,;:]+$/, "") ?? "";
};

export default function AdminClubPosters({ setNotice }: Props) {
  const [posters, setPosters] = useState<ClubPoster[]>([]);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [busy, setBusy] = useState<"analyze" | "save" | "" | string>("");
  const [error, setError] = useState("");

  const load = async () => {
    try { setPosters(await repository.getActiveClubPosters()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load posters."); }
  };
  useEffect(() => { void load(); }, []);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const next = selected[0] ?? null;
    setQueuedFiles(selected); setFile(next); setAnalysis(""); setError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : "");
  };

  const runAnalysis = async () => {
    if (!file) return;
    setBusy("analyze"); setError("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const mimeByExtension: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", avif: "image/avif", tif: "image/tiff", tiff: "image/tiff" };
      const imageMimeType = file.type || (extension ? mimeByExtension[extension] : "");
      if (!imageMimeType.startsWith("image/")) throw new Error("Please choose a PNG, JPG, or WebP image rather than a document.");
      const result = await analyzeImage({
        image_base64: await toBase64(file), image_mime_type: imageMimeType,
        prompt: "Read this club or event poster carefully and act as an event-notice editor. Return a concise plain-text notice with exactly these headings: Suggested title; What is happening; Date and time; Place or platform; Deadline; Link or contact; Key details. Suggested title should be the best clear title for publishing this notice, not a generic phrase. Preserve every visible name, date, time, location, URL, email and submission instruction. Copy visible URLs exactly. If a field is not visible, say Not stated. Do not guess.",
      });
      setAnalysis(result.analysis);
      const suggestedTitle = readAnalysisField(result.analysis, ["Suggested title", "Best title", "Title"]);
      const detectedLink = readAnalysisLink(result.analysis);
      if (suggestedTitle && !title.trim()) setTitle(suggestedTitle.replace(/^['"“”]|['"“”]$/g, "").slice(0, 160));
      if (detectedLink && !linkUrl.trim()) setLinkUrl(detectedLink);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "AI analysis failed."); }
    finally { setBusy(""); }
  };

  const save = async () => {
    if (!file || !analysis.trim()) {
      setError("Analyze the selected poster before publishing.");
      return;
    }
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Club notice";
    setBusy("checking"); setError("");
    try {
      const poster = await repository.adminCreateClubPoster({
        title: title.trim() || fallbackTitle, file, linkUrl, aiAnalysis: analysis,
        onProgress: (stage) => setBusy(stage),
      });
      const remaining = queuedFiles.slice(1);
      setPosters((current) => [poster, ...current]); setQueuedFiles(remaining); setTitle(""); setLinkUrl(""); setFile(remaining[0] ?? null); setAnalysis("");
      if (preview) URL.revokeObjectURL(preview); setPreview(remaining[0] ? URL.createObjectURL(remaining[0]) : "");
      setNotice("Poster published to the home-page carousel.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not publish poster."); }
    finally { setBusy(""); }
  };

  const remove = async (poster: ClubPoster) => {
    if (!window.confirm(`Remove “${poster.title}” from the home page?`)) return;
    setBusy(`delete-${poster.id}`); setError("");
    try { await repository.adminDeleteClubPoster(poster); setPosters((current) => current.filter((item) => item.id !== poster.id)); setNotice("Poster removed."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove poster."); }
    finally { setBusy(""); }
  };

  return <section className="card card-pad admin-posters-panel">
    <div className="card-header"><span className="section-label"><ImagePlus size={14} /> Club posters & notices</span><span className="quiet">Super admin only</span></div>
    <p className="field-hint">Upload a club notice, event poster, or research-submission announcement. The server-side vision model extracts the date, time, place, deadline and link before it goes live.</p>
    {error && <div className="connection-error" role="alert">{error}</div>}
    <div className="admin-poster-form">
      <label className="groups-field">Poster image(s)<input type="file" multiple accept="image/*,.avif,.bmp,.gif,.heic,.heif,.tif,.tiff" onChange={chooseFile} /><span className="field-hint">You can select multiple poster versions. Analyze and publish them one at a time; {queuedFiles.length > 1 ? `${queuedFiles.length} files are queued.` : "PNG, JPG, JPEG, WebP, GIF, BMP, AVIF and TIFF are accepted when your browser can read them."}</span></label>
      <label className="groups-field">Short title (optional)<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Research paper submissions" /></label>
      <label className="groups-field">Optional click-through link<input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></label>
      {preview && <img className="admin-poster-preview" src={preview} alt="Selected poster preview" />}
      <div className="admin-poster-actions"><button className="secondary-button" type="button" disabled={!file || busy !== ""} onClick={() => void runAnalysis()}><Sparkles size={14} /> {busy === "analyze" ? "Analyzing…" : "Analyze poster"}</button><button className="primary-button" type="button" disabled={!file || !analysis.trim() || busy !== ""} onClick={() => void save()}>{busy && busy !== "analyze" && <LoaderCircle size={14} className="spin" />} {busy === "checking" ? "Checking access…" : busy === "uploading" ? "Uploading poster…" : busy === "saving" ? "Saving notice…" : "Publish to home"}</button></div>
      {!analysis && <p className="field-hint">Analyze the selected poster first. You may add a short title, or the image filename will be used automatically.</p>}
      {analysis && <div className="admin-poster-analysis"><strong>AI analysis</strong><p>{analysis}</p></div>}
    </div>
    {posters.length > 0 && <div className="row-list admin-poster-list">{posters.map((poster) => <div className="row" key={poster.id}><img src={poster.image_url} alt="" className="admin-poster-thumb" /><div className="row-main"><div className="row-title">{poster.title}</div><div className="row-meta">Published {new Date(poster.created_at).toLocaleDateString("en-GB")}</div></div><div className="row-end"><button className="small-danger" type="button" disabled={busy !== ""} onClick={() => void remove(poster)}><Trash2 size={12} /> Remove</button></div></div>)}</div>}
    {busy === "analyze" && <p className="field-hint"><LoaderCircle size={13} className="spin" /> Reading the poster…</p>}
    {busy === "checking" && <p className="field-hint"><LoaderCircle size={13} className="spin" /> Checking your super-admin access…</p>}
    {busy === "uploading" && <p className="field-hint"><LoaderCircle size={13} className="spin" /> Uploading the poster image… Keep this page open.</p>}
    {busy === "saving" && <p className="field-hint"><LoaderCircle size={13} className="spin" /> Saving the notice and adding it to the Home carousel…</p>}
  </section>;
}
