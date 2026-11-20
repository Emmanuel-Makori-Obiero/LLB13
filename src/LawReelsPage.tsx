import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Check, CheckCircle2, ChevronDown, ChevronUp, Heart, MessageCircle, Pause, Play, Plus, Send, Share2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { LawReel } from "./data/types";
import "./law-reels.css";

type Props = { onBack?: () => void };

export default function LawReelsPage({ onBack }: Props) {
  const [reels, setReels] = useState<LawReel[]>([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<Record<string, { likes: number; comments: number; liked: boolean; saved: boolean }>>({});
  const [comments, setComments] = useState<Array<{ id: string; username: string; body: string }>>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadTopic, setUploadTopic] = useState("");
  const [uploadVideo, setUploadVideo] = useState<File | null>(null);
  const [shareReel, setShareReel] = useState<LawReel | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const sharedReelId = new URLSearchParams(window.location.search).get("reel");

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    void Promise.all([repository.getLawReels(sharedReelId ?? undefined), supabase?.auth.getUser()]).then(async ([loaded, auth]) => {
      setReels(loaded); const id = auth?.data.user?.id ?? null; setUserId(id);
      if (sharedReelId) window.setTimeout(() => document.getElementById(`law-reel-${sharedReelId}`)?.scrollIntoView({ block: "start" }), 250);
      if (!supabase || !id || !loaded.length) return;
      const ids = loaded.map((reel) => reel.id);
      const [likes, saves] = await Promise.all([
        supabase.from("law_reel_likes").select("reel_id,user_id").in("reel_id", ids).limit(5000),
        supabase.from("law_reel_saves").select("reel_id,user_id").eq("user_id", id).in("reel_id", ids).limit(500),
      ]);
      const mine = new Set((likes.data ?? []).filter((row) => row.user_id === id).map((row) => row.reel_id));
      const saved = new Set((saves.data ?? []).map((row) => row.reel_id));
      setEngagement(Object.fromEntries(loaded.map((reel) => [reel.id, { likes: (likes.data ?? []).filter((row) => row.reel_id === reel.id).length, comments: 0, liked: mine.has(reel.id), saved: saved.has(reel.id) }])));
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the video feed."));
  }, [sharedReelId]);

  const toggleEngagement = async (kind: "like" | "save") => {
    const reel = reels[active]; if (!supabase || !userId || !reel) return;
    const current = engagement[reel.id] ?? { likes: 0, comments: 0, liked: false, saved: false };
    const field = kind === "like" ? "liked" : "saved"; const next = !current[field];
    const table = kind === "like" ? "law_reel_likes" : "law_reel_saves";
    const result = next ? await supabase.from(table).insert({ reel_id: reel.id, user_id: userId }) : await supabase.from(table).delete().eq("reel_id", reel.id).eq("user_id", userId);
    if (result.error) return;
    setEngagement((state) => ({ ...state, [reel.id]: { ...current, [field]: next, likes: kind === "like" ? current.likes + (next ? 1 : -1) : current.likes } }));
  };
  const loadComments = async (reelId: string) => {
    if (!supabase) return;
    const { data } = await supabase.rpc("get_law_reel_comments", { p_reel_id: reelId });
    const rows = (data ?? []) as Array<{ id: string; username: string; body: string }>;
    setComments(rows); setEngagement((state) => ({ ...state, [reelId]: { ...(state[reelId] ?? { likes: 0, liked: false, saved: false }), comments: rows.length } }));
  };
  const submitComment = async () => {
    const reel = reels[active]; const body = commentText.trim();
    if (!supabase || !userId || !reel || !body) return;
    const { error: saveError } = await supabase.from("law_reel_comments").insert({ reel_id: reel.id, user_id: userId, body });
    if (!saveError) { setCommentText(""); await loadComments(reel.id); }
  };
  const submitUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadVideo) return;
    setUploadBusy(true);
    setUploadProgress(0);
    try {
      const uploaded = await repository.adminCreateLawReel({ title: uploadTitle, caption: uploadCaption, topic: uploadTopic, sortOrder: 0, isPublished: true, video: uploadVideo, onProgress: setUploadProgress });
      setReels((current) => {
        const nextIndex = current.length;
        window.setTimeout(() => {
          setActive(nextIndex);
          document.getElementById(`law-reel-${uploaded.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
        return [...current, uploaded];
      });
      setUploadOpen(false); setUploadTitle(""); setUploadCaption(""); setUploadTopic(""); setUploadVideo(null);
      setError(""); setNotice("Your law reel is live — ready to watch and share.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload this reel."); setNotice(""); }
    finally { setUploadBusy(false); setUploadProgress(0); }
  };
  const reelLink = (reel: LawReel) => `${window.location.origin}/reels?reel=${encodeURIComponent(reel.id)}`;
  const copyReelLink = async (reel: LawReel) => {
    await navigator.clipboard.writeText(reelLink(reel));
    setError(""); setNotice("Reel link copied to your clipboard.");
    setShareReel(null);
  };
  const shareNative = async (reel: LawReel) => {
    if (navigator.share) await navigator.share({ title: reel.title, text: reel.caption || "A law reel from Law Hub", url: reelLink(reel) });
    else await copyReelLink(reel);
  };

  useEffect(() => {
    if (!reels.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const index = Number((entry.target as HTMLElement).dataset.index);
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          setActive(index);
          video.muted = muted;
          void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
          video.pause();
          video.currentTime = 0;
        }
      });
    }, { threshold: [0.65] });
    reels.forEach((reel, index) => {
      const video = videoRefs.current[reel.id];
      if (video) { video.dataset.index = String(index); observer.observe(video); }
    });
    return () => observer.disconnect();
  }, [muted, reels]);

  const go = (next: number) => {
    const index = Math.max(0, Math.min(reels.length - 1, next));
    document.getElementById(`law-reel-${reels[index]?.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const togglePlay = () => {
    const video = videoRefs.current[reels[active]?.id];
    if (!video) return;
    if (video.paused) void video.play().then(() => setPlaying(true));
    else { video.pause(); setPlaying(false); }
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const video = videoRefs.current[reels[active]?.id];
    if (video) video.muted = next;
  };

  return <main className="law-reels-page">
    <header className="law-reels-header">
      <button type="button" className="law-reels-back" onClick={onBack}><ArrowLeft size={17} /> Back</button>
      <div><span className="section-label">FEATURES · LAW REELS</span></div>
      {userId && <button className="law-reels-add" type="button" aria-label="Upload a law reel" onClick={() => setUploadOpen(true)}><Plus size={20} /></button>}
    </header>
    {error && <div className="law-reels-toast law-reels-toast-error" role="alert"><X size={18} /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    {notice && <div className="law-reels-toast law-reels-toast-success" role="status"><CheckCircle2 size={19} /><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {!reels.length && <div className="law-reels-empty"><strong>No lessons have been published yet.</strong><span>Check back when the administrator adds the first law reel.</span></div>}
    <section className="law-reels-feed" aria-label="Law video feed">
      {reels.map((reel, index) => <article className="law-reel" id={`law-reel-${reel.id}`} key={reel.id} onDoubleClick={() => { setActive(index); if (userId) void toggleEngagement("like"); }}>
        <video ref={(node) => { videoRefs.current[reel.id] = node; }} className="law-reel-video" src={reel.video_url} poster={reel.cover_url ?? undefined} playsInline loop muted={muted} preload={index < 2 ? "auto" : "metadata"} />
        <div className="law-reel-shade" />
        <div className="law-reel-copy">{reel.topic !== "General" && <span className="law-reel-topic">{reel.topic}</span>}{reel.title !== "Untitled law reel" && <h2>{reel.title}</h2>}{reel.caption && <p>{reel.caption}</p>}</div>
        <div className="law-reel-actions"><button type="button" aria-label={playing && active === index ? "Pause video" : "Play video"} onClick={togglePlay}>{playing && active === index ? <Pause /> : <Play />}</button><button type="button" aria-label={muted ? "Unmute video" : "Mute video"} onClick={toggleMute}>{muted ? <VolumeX /> : <Volume2 />}</button>{userId && <><button type="button" className={engagement[reel.id]?.liked ? "engaged" : ""} aria-label="Like video" onClick={() => void toggleEngagement("like")}><Heart fill={engagement[reel.id]?.liked ? "currentColor" : "none"} /><small>{engagement[reel.id]?.likes ?? 0}</small></button><button type="button" className={engagement[reel.id]?.saved ? "engaged" : ""} aria-label="Save video" onClick={() => void toggleEngagement("save")}><Bookmark fill={engagement[reel.id]?.saved ? "currentColor" : "none"} /></button><button type="button" aria-label="Comments" onClick={() => { setCommentsOpen(true); void loadComments(reel.id); }}><MessageCircle /><small>{engagement[reel.id]?.comments ?? 0}</small></button></>}<button type="button" aria-label="Share video" onClick={() => setShareReel(reel)}><Share2 /></button><button type="button" aria-label="Previous video" onClick={() => go(index - 1)} disabled={index === 0}><ChevronUp /></button><button type="button" aria-label="Next video" onClick={() => go(index + 1)} disabled={index === reels.length - 1}><ChevronDown /></button></div>
        <div className="law-reel-progress"><span style={{ width: active === index ? "100%" : "0%" }} /></div>
      </article>)}
    </section>
    {commentsOpen && <div className="law-comments-backdrop" onClick={() => setCommentsOpen(false)}><aside className="law-comments" onClick={(event) => event.stopPropagation()}><div className="law-comments-head"><strong>Comments</strong><button type="button" onClick={() => setCommentsOpen(false)}><Check size={16} /></button></div><div className="law-comments-list">{comments.length ? comments.map((comment) => <div className="law-comment" key={comment.id}><strong>@{comment.username}</strong><span>{comment.body}</span></div>) : <p>No comments yet. Start the discussion.</p>}</div><form onSubmit={(event) => { event.preventDefault(); void submitComment(); }}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={500} placeholder="Add a useful legal note…" aria-label="Add a comment" /><button type="submit" aria-label="Post comment"><Send size={17} /></button></form></aside></div>}
    {uploadOpen && <div className="law-comments-backdrop" onClick={() => !uploadBusy && setUploadOpen(false)}><form className="law-upload-sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submitUpload(event)}><div className="law-comments-head"><strong>Share a law reel</strong><button type="button" disabled={uploadBusy} onClick={() => setUploadOpen(false)}><X size={17} /></button></div><p>Choose a video and share it instantly. Title, caption, and topic are optional.</p><label>Video<input type="file" accept="video/*" required onChange={(event) => setUploadVideo(event.target.files?.[0] ?? null)} /></label><label>Title <span>(optional)</span><input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Add a title (optional)" maxLength={160} /></label><label>Caption <span>(optional)</span><textarea value={uploadCaption} onChange={(event) => setUploadCaption(event.target.value)} placeholder="What should students remember?" maxLength={1200} rows={3} /></label><label>Topic <span>(optional)</span><input value={uploadTopic} onChange={(event) => setUploadTopic(event.target.value)} placeholder="Add a topic (optional)" maxLength={80} /></label><button className="primary-button" type="submit" disabled={uploadBusy}><Upload size={16} />{uploadBusy ? "Uploading…" : "Upload now"}</button></form></div>}
    {uploadBusy && <div className="law-upload-loader" role="status" aria-live="polite"><span className="law-spinner" /><strong>Uploading your law reel… {uploadProgress}%</strong><small>{uploadProgress < 100 ? "Your video is transferring. Please keep this screen open." : "Saving the reel details…"}</small></div>}
    {shareReel && <div className="law-comments-backdrop" onClick={() => setShareReel(null)}><aside className="law-share-sheet" onClick={(event) => event.stopPropagation()}><div className="law-comments-head"><strong>Share this law reel</strong><button type="button" onClick={() => setShareReel(null)}><X size={17} /></button></div><button type="button" onClick={() => void shareNative(shareReel)}><Share2 size={18} /> Share with another app</button><a href={`https://wa.me/?text=${encodeURIComponent(`${shareReel.title} — ${reelLink(shareReel)}`)}`} target="_blank" rel="noreferrer"><strong className="law-share-whatsapp">WhatsApp</strong> Send on WhatsApp</a><button type="button" onClick={() => { void copyReelLink(shareReel); window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer"); }}><strong className="law-share-instagram">Instagram</strong> Copy link and open Instagram</button><button type="button" onClick={() => void copyReelLink(shareReel)}>Copy link</button></aside></div>}
  </main>;
}
