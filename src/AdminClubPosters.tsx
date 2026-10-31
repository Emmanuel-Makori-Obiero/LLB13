import { useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { analyzeImage } from "./lib/cloudMedia";
import { repository } from "./data/repository";
import type { ClubPoster } from "./data/types";
import "./admin.css";

type Props = { setNotice: (notice: string) => void };

const toBase64 = async (file: File) => {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    const encoded = btoa(binary);
    if (!encoded) throw new Error("The selected image is empty.");
    return encoded;
  } catch {
    throw new Error("Could not read that image. Please choose a PNG, JPG, or WebP file and try again.");
  }
};

export default function AdminClubPosters({ setNotice }: Props) {
  const [posters, setPosters] = useState<ClubPoster[]>([]);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [busy, setBusy] = useState<"analyze" | "save" | "" | string>("");
  const [error, setError] = useState("");

  const load = async () => {
    try { setPosters(await repository.getActiveClubPosters()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load posters."); }
  };
  useEffect(() => { void load(); }, []);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next); setAnalysis(""); setError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : "");
  };

  const runAnalysis = async () => {
    if (!file) return;
    setBusy("analyze"); setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file rather than a document.");
      const result = await analyzeImage({
        image_base64: await toBase64(file), image_mime_type: file.type,
        prompt: "Read this club or event poster carefully. Return a concise plain-text notice with these headings: What is happening; Date and time; Place or platform; Deadline; Link or contact; Key details. Preserve every visible name, date, time, location, URL, email and submission instruction. If a field is not visible, say Not stated. Do not guess.",
      });
      setAnalysis(result.analysis);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "AI analysis failed."); }
    finally { setBusy(""); }
  };

  const save = async () => {
    if (!file || !title.trim() || !analysis.trim()) return;
    setBusy("save"); setError("");
    try {
      const poster = await repository.adminCreateClubPoster({ title, file, linkUrl, aiAnalysis: analysis });
      setPosters((current) => [poster, ...current]); setTitle(""); setLinkUrl(""); setFile(null); setAnalysis("");
      if (preview) URL.revokeObjectURL(preview); setPreview("");
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
      <label className="groups-field">Poster image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} /></label>
      <label className="groups-field">Short title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Research paper submissions" /></label>
      <label className="groups-field">Optional click-through link<input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></label>
      {preview && <img className="admin-poster-preview" src={preview} alt="Selected poster preview" />}
      <div className="admin-poster-actions"><button className="secondary-button" type="button" disabled={!file || busy !== ""} onClick={() => void runAnalysis()}><Sparkles size={14} /> {busy === "analyze" ? "Analyzing…" : "Analyze poster"}</button><button className="primary-button" type="button" disabled={!file || !title.trim() || !analysis.trim() || busy !== ""} onClick={() => void save()}>{busy === "save" ? "Publishing…" : "Publish to home"}</button></div>
      {analysis && <div className="admin-poster-analysis"><strong>AI analysis</strong><p>{analysis}</p></div>}
    </div>
    {posters.length > 0 && <div className="row-list admin-poster-list">{posters.map((poster) => <div className="row" key={poster.id}><img src={poster.image_url} alt="" className="admin-poster-thumb" /><div className="row-main"><div className="row-title">{poster.title}</div><div className="row-meta">Published {new Date(poster.created_at).toLocaleDateString("en-GB")}</div></div><div className="row-end"><button className="small-danger" type="button" disabled={busy !== ""} onClick={() => void remove(poster)}><Trash2 size={12} /> Remove</button></div></div>)}</div>}
    {busy === "analyze" && <p className="field-hint"><LoaderCircle size={13} className="spin" /> Reading the poster…</p>}
  </section>;
}
