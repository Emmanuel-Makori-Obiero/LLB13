import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock3, MapPin, Sparkles } from "lucide-react";
import { repository } from "./data/repository";
import type { ClubPoster } from "./data/types";

export default function ClubPosterCarousel() {
  const [posters, setPosters] = useState<ClubPoster[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => { void repository.getActiveClubPosters().then(setPosters).catch(() => setPosters([])); }, []);
  useEffect(() => { if (posters.length < 2) return; const timer = window.setInterval(() => setActive((current) => (current + 1) % posters.length), 4000); return () => window.clearInterval(timer); }, [posters.length]);
  if (!posters.length) return null;
  const poster = posters[active % posters.length];
  const move = (direction: number) => { setActive((current) => (current + direction + posters.length) % posters.length); setOpen(false); };
  return <section className="home-poster-carousel" aria-label="Club notices">
    <div className="home-poster-image-wrap"><img src={poster.image_url} alt={poster.title} className="home-poster-image" /><div className="home-poster-badge"><Sparkles size={13} /> CLUB NOTICE</div></div>
    <div className="home-poster-content"><div className="home-poster-kicker">{active + 1} / {posters.length} · rotates every 4 seconds</div><h2>{poster.title}</h2>{open ? <div className="home-poster-analysis"><p>{poster.ai_analysis}</p>{poster.link_url && <a href={poster.link_url} target="_blank" rel="noreferrer">Open notice link <ArrowUpRight size={14} /></a>}</div> : <><p className="home-poster-teaser"><Clock3 size={14} /> AI-read details available</p><button className="home-poster-details" onClick={() => setOpen(true)}>View time, place & details <ArrowUpRight size={14} /></button></>}{!open && poster.link_url && <a className="home-poster-link" href={poster.link_url} target="_blank" rel="noreferrer"><MapPin size={13} /> Open related link</a>}<div className="home-poster-controls"><button aria-label="Previous notice" onClick={() => move(-1)}><ChevronLeft size={16} /></button><button aria-label="Next notice" onClick={() => move(1)}><ChevronRight size={16} /></button></div></div>
  </section>;
}
