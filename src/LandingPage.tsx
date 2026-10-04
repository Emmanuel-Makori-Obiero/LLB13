import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  GraduationCap,
  Headphones,
  Library,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import InstallButton from "./InstallButton";
import "./landing.css";

type LandingPageProps = {
  configured: boolean;
  onSignIn: () => void;
  onSignUp: () => void;
  signedInPreview?: boolean;
  onEnterWorkspace?: () => void;
};

type HelpButtonProps = {
  onNavigate?: (page: string) => void;
  onSignUp?: () => void;
  floating?: boolean;
};

const chapters = [
  {
    number: "01",
    label: "Read with purpose",
    title: "A book becomes a path.",
    copy: "Build a source-grounded syllabus from your books and notes. Work through one clear lesson at a time, with the original material kept in view.",
    icon: BookOpen,
    tag: "Guided study",
  },
  {
    number: "02",
    label: "Practise what matters",
    title: "Recall it. Apply it. Own it.",
    copy: "Short quizzes, written checkpoints and exam-style questions turn passive reading into active legal reasoning—with space to repeat the hard parts.",
    icon: CheckCircle2,
    tag: "Quizzes and exams",
  },
  {
    number: "03",
    label: "Learn in your own voice",
    title: "Study that moves with you.",
    copy: "Ask the study assistant, shape a two-speaker podcast, listen to lessons, and return to your saved progress when you are ready.",
    icon: Headphones,
    tag: "Audio and AI tools",
  },
];

function Brand() {
  return (
    <a className="landing-brand" href="/" aria-label="Group 13 Hub home">
      <span className="landing-brand-mark">13</span>
      <span className="landing-brand-copy">
        <strong>GROUP 13</strong>
        <small>LAW SCHOOL HUB</small>
      </span>
    </a>
  );
}

export function HelpButton({
  onNavigate,
  onSignUp,
  floating = false,
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const navigate = (page: string) => {
    setOpen(false);
    onNavigate?.(page);
  };

  return (
    <div className={`g13-help ${floating ? "g13-help-floating" : ""}`}>
      <button
        type="button"
        className="g13-help-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={16} /> <span>Help</span>
      </button>
      {open && (
        <div className="g13-help-scrim" onMouseDown={() => setOpen(false)}>
          <section
            className="g13-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="g13-help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="g13-help-head">
              <div>
                <span className="g13-help-kicker">GROUP 13 · QUICK GUIDE</span>
                <h2 id="g13-help-title">Find your way around.</h2>
              </div>
              <button
                type="button"
                className="g13-help-close"
                aria-label="Close help"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="g13-help-intro">
              One private place for your law-school materials, study practice and
              class workspace.
            </p>
            <div className="g13-help-links">
          <button type="button" onClick={() => navigate("guide")}>
                <GraduationCap size={17} />
                <span><strong>Guided study</strong><small>Turn source books into lessons, quizzes and checkpoints.</small></span>
                <ArrowRight size={15} />
              </button>
              <button type="button" onClick={() => navigate("library")}>
                <Library size={17} />
                <span><strong>Library</strong><small>Find shared materials, readings and saved documents.</small></span>
                <ArrowRight size={15} />
              </button>
              <button type="button" onClick={() => navigate("assistant")}>
                <Headphones size={17} />
                <span><strong>Study assistant</strong><small>Ask questions or create a podcast from selected sources.</small></span>
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="g13-help-note">
              <strong>Can’t sign up?</strong>
              <span>Accounts are limited to approved Group 13 emails. Ask a class administrator to add your address.</span>
            </div>
            <div className="g13-help-install">
              <div><strong>Install on your phone</strong><small>Use your browser menu to choose “Install app” or “Add to Home Screen”. On iPhone, open the site in Safari and use Share → Add to Home Screen.</small></div>
              <InstallButton className="g13-help-install-button" label="Install app" />
            </div>
            {onSignUp && (
              <button
                type="button"
                className="g13-help-cta"
                onClick={() => { setOpen(false); onSignUp(); }}
              >
                Create an account <ArrowRight size={15} />
              </button>
            )}
            <p className="g13-help-foot">
              AI study tools support learning; verify legal authorities in the
              original source.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

export default function LandingPage({
  configured,
  onSignIn,
  onSignUp,
  signedInPreview = false,
  onEnterWorkspace,
}: LandingPageProps) {
  const [activeChapter, setActiveChapter] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [gavelImpact, setGavelImpact] = useState(false);
  const judgeSceneRef = useRef<HTMLElement>(null);
  const judgeVideoRef = useRef<HTMLVideoElement>(null);
  const wasJudgeSceneVisible = useRef(false);
  const current = chapters[activeChapter];
  const ActiveIcon = current.icon;
  const openWorkspace = onEnterWorkspace ?? onSignIn;

  useEffect(() => {
    const section = judgeSceneRef.current;
    const video = judgeVideoRef.current;
    if (!section || !video) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hasLanded = false;
    const observer = new IntersectionObserver(([entry]) => {
      const inView = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.35);
      if (inView && !wasJudgeSceneVisible.current) {
        wasJudgeSceneVisible.current = true;
        if (!reduceMotion) {
          video.currentTime = 0;
          hasLanded = false;
          setGavelImpact(false);
          void video.play().catch(() => {});
        }
      } else if (!inView && wasJudgeSceneVisible.current) {
        wasJudgeSceneVisible.current = false;
        video.pause();
      }
    }, { threshold: [0, 0.35] });
    const updateImpact = () => {
      const landed = video.currentTime >= 3.8;
      if (landed !== hasLanded) {
        hasLanded = landed;
        setGavelImpact(landed);
      }
    };
    video.addEventListener("timeupdate", updateImpact);
    observer.observe(section);
    return () => {
      observer.disconnect();
      wasJudgeSceneVisible.current = false;
      video.removeEventListener("timeupdate", updateImpact);
      video.pause();
    };
  }, []);

  const replayJudgeScene = () => {
    const video = judgeVideoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setGavelImpact(false);
    void video.play().catch(() => {});
  };

  const exploreSection = (page: string) => {
    const target = page === "guide" ? "inside" : page === "library" || page === "assistant" ? "features" : "the-method";
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={`g13-landing${signedInPreview ? " g13-landing-preview" : ""}`}>
      <header className="g13-site-header">
        <Brand />
        <nav className="g13-site-nav" aria-label="Main navigation">
          <a href="#the-method">The method</a>
          <a href="#inside">Inside the hub</a>
          <HelpButton onSignUp={signedInPreview ? undefined : onSignUp} onNavigate={exploreSection} />
        </nav>
        <div className="g13-header-actions">
          {signedInPreview ? (
            <button className="g13-signup-button" type="button" onClick={openWorkspace}>Open workspace <ArrowRight size={15} /></button>
          ) : (
            <>
              <button className="g13-login-button" type="button" onClick={onSignIn}>Sign in</button>
              <button className="g13-signup-button" type="button" onClick={onSignUp}>Create account <ArrowRight size={15} /></button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="g13-hero">
          <div className="g13-hero-image" aria-hidden="true" />
          <div className="g13-hero-vignette" aria-hidden="true" />
          <div className="g13-hero-copy">
            <div className="g13-hero-eyebrow"><span /> A PRIVATE LEARNING SPACE FOR GROUP 13</div>
            <h1>Study the law.<br /><strong>Find your argument.</strong></h1>
            <p className="g13-hero-lede">
              Keep casebooks, lecture notes, lessons and exam practice together,
              so more of your study time goes into understanding the law.
            </p>
            <div className="g13-hero-actions">
              {signedInPreview ? (
                <button className="g13-hero-primary" type="button" onClick={openWorkspace}>
                  Enter the study hub <ArrowRight size={17} />
                </button>
              ) : (
                <>
                  <button className="g13-hero-primary" type="button" onClick={onSignUp}>
                    Create your account <ArrowRight size={17} />
                  </button>
                  <button className="g13-hero-secondary" type="button" onClick={onSignIn}>
                    Sign in <span aria-hidden="true">↗</span>
                  </button>
                </>
              )}
            </div>
            <p className="g13-access-note" role={signedInPreview ? "status" : undefined} aria-live={signedInPreview ? "polite" : undefined}>
              {signedInPreview ? <><span className="g13-opening-dot" /> Opening your workspace…</> : <><LockKeyhole size={13} /> For approved Group 13 accounts.</>}
            </p>
          </div>
          <div className="g13-hero-index"><span>FIELD NOTES</span><strong>13</strong><small>LEARN · REASON · REPEAT</small></div>
          <a className="g13-scroll-cue" href="#the-method"><span>Scroll to explore</span><ArrowDown size={14} /></a>
          <div className="g13-hero-caption">A QUIETER WAY TO THINK CLEARLY</div>
        </section>

        <section className="g13-manifesto" id="the-method">
          <div className="g13-manifesto-stamp">THE GROUP 13 METHOD<br />READ · RECALL · REASON</div>
          <p className="g13-manifesto-copy">
            The work is demanding.<br />Your study space should <strong>make it clearer.</strong>
          </p>
          <p className="g13-manifesto-side">
            A focused home for the reading, questions and small daily steps that
            make legal thinking yours.
          </p>
        </section>

        <section className="g13-judge-scene" ref={judgeSceneRef} aria-labelledby="g13-judge-title">
          <div className="g13-judge-copy">
            <div className="g13-scene-index"><span>IN THE COURTROOM</span><span>01 / 03</span></div>
            <span className="g13-kicker">THE MOMENT A REASON BECOMES A RULING</span>
            <h2 id="g13-judge-title">Every argument<br /><strong>must land.</strong></h2>
            <p>Read closely. Test the rule against the facts. Then make the case for what should happen next.</p>
            <p className="g13-judge-instruction">Scroll into the scene. The gavel falls; the question becomes yours.</p>
            <button type="button" className="g13-judge-replay" onClick={replayJudgeScene}>
              <RotateCcw size={15} /> Replay the moment
            </button>
          </div>
          <figure className="g13-judge-frame" data-impact={gavelImpact ? "true" : "false"}>
            <video
              ref={judgeVideoRef}
              className="g13-judge-video"
              src="/landing-judge-gavel.mp4"
              poster="/landing-judge-gavel-poster.webp"
              muted
              playsInline
              preload="metadata"
              aria-label="Muted footage of a judge bringing a wooden gavel down onto its block"
            />
            <span className="g13-impact-ring" aria-hidden="true" />
            <figcaption><span>THE DECISION IS IN THE DETAILS</span><span>Video: Katrin Bolovtsova / Pexels</span></figcaption>
          </figure>
          <span className="g13-judge-side-note" aria-hidden="true">READ · REASON · RESPOND</span>
        </section>

        <section className="g13-experience" id="inside">
          <div className="g13-section-heading">
            <div><span className="g13-kicker">A WORKING STUDY SYSTEM</span><h2>Make each session count.</h2></div>
            <span className="g13-section-index">01 — 03</span>
          </div>
          <div className="g13-experience-grid">
            <div className="g13-chapter-list" role="tablist" aria-label="Explore the learning method">
              {chapters.map((chapter, index) => (
                <button
                  key={chapter.number}
                  type="button"
                  role="tab"
                  aria-selected={activeChapter === index}
                  className={activeChapter === index ? "active" : ""}
                  onClick={() => setActiveChapter(index)}
                >
                  <span>{chapter.number}</span><strong>{chapter.label}</strong><ArrowRight size={15} />
                </button>
              ))}
            </div>
            <article className="g13-chapter-detail" role="tabpanel" aria-live="polite" key={activeChapter}>
              <div className="g13-chapter-icon"><ActiveIcon size={20} /></div>
              <span className="g13-kicker">{current.tag.toUpperCase()}</span>
              <h3>{current.title}</h3>
              <p>{current.copy}</p>
              <button type="button" className="g13-text-link" onClick={signedInPreview ? openWorkspace : onSignUp}>{signedInPreview ? "Open the hub" : "Explore the hub"} <ArrowRight size={14} /></button>
              <span className="g13-detail-index">{current.number} / 03</span>
            </article>
          </div>
        </section>

        <section className="g13-reading-room" aria-labelledby="g13-reading-title">
          <div className="g13-reading-copy">
            <span className="g13-kicker">A SOURCE IS WHERE THINKING STARTS</span>
            <h2 id="g13-reading-title">Open the book.<br /><strong>Find your way in.</strong></h2>
            <p>Tap the cover to open a sample casebook. In the hub, your own long readings become an ordered path of lessons, recall and exam practice.</p>
            <button
              type="button"
              className="g13-book-toggle"
              aria-expanded={bookOpen}
              onClick={() => setBookOpen((open) => !open)}
            >
              {bookOpen ? "Close the sample book" : "Open the sample book"}
              <ArrowRight size={15} />
            </button>
          </div>
          <button
            type="button"
            className={`g13-book-control${bookOpen ? " is-open" : ""}`}
            aria-label={bookOpen ? "Close the sample legal-method book" : "Open the sample legal-method book"}
            aria-expanded={bookOpen}
            onClick={() => setBookOpen((open) => !open)}
          >
            <span className="g13-book-object" aria-hidden="true">
              <span className="g13-book-pages">
                <span className="g13-book-page g13-book-page-left">
                  <small>FIELD NOTE 01</small>
                  <strong>Begin with<br />a question.</strong>
                  <span className="g13-book-lines" />
                  <span className="g13-book-lines short" />
                </span>
                <span className="g13-book-page g13-book-page-right">
                  <small>READING METHOD</small>
                  <strong>What is the point?</strong>
                  <span className="g13-book-lines" />
                  <span className="g13-book-lines" />
                  <span className="g13-book-lines short" />
                  <span className="g13-book-page-number">13</span>
                </span>
              </span>
              <span className="g13-book-cover">
                <span className="g13-book-front">
                  <small>GROUP 13 · STUDY EDITION</small>
                  <strong>LEGAL<br />METHOD</strong>
                  <span className="g13-book-emblem">13</span>
                  <span className="g13-book-front-foot">READ / REASON / RECALL</span>
                </span>
                <span className="g13-book-inside">
                  <small>THE READING ROOM</small>
                  <strong>Start with<br />the source.</strong>
                  <span className="g13-book-lines" />
                </span>
              </span>
              <span className="g13-book-spine" />
            </span>
            <span className="g13-book-control-label">{bookOpen ? "Click to close" : "Click to open"}</span>
          </button>
        </section>

        <section className="g13-tools" id="features" aria-label="What is inside Group 13 Hub">
          <div className="g13-tools-intro">
            <span className="g13-kicker">ONE HUB. MORE ROOM TO THINK.</span>
            <h2>Built around your<br /><strong>real study day.</strong></h2>
            <p>Move from the source to understanding, then test what you know—without losing your place.</p>
            <button type="button" className="g13-text-link" onClick={signedInPreview ? openWorkspace : onSignUp}>{signedInPreview ? "Open the hub" : "See what you can do"} <ArrowRight size={14} /></button>
          </div>
          <div className="g13-tool-card g13-tool-card-large">
            <span className="g13-tool-number">A / 01</span><GraduationCap size={22} />
            <h3>Guided study</h3><p>Turn long texts into ordered lessons, active-recall quizzes, and exam checkpoints.</p>
          </div>
          <div className="g13-tool-card">
            <span className="g13-tool-number">B / 02</span><Library size={20} />
            <h3>Library & notes</h3><p>Keep course materials and source-based work close to your studies.</p>
          </div>
          <div className="g13-tool-card g13-tool-audio">
            <span className="g13-tool-number">C / 03</span><Headphones size={20} />
            <h3>Audio learning</h3><p>Listen to fluent study narration and conversational learning episodes.</p>
          </div>
        </section>

        <section className="g13-install-band">
          <div><span className="g13-kicker">TAKE YOUR STUDY SPACE WITH YOU</span><h2>One tap away from your next session.</h2><p>Use Group 13 in your browser, or add it to your home screen for an app-like shortcut.</p></div>
          <InstallButton className="g13-install-button" label="Install Group 13" />
        </section>

        <section className="g13-final-cta">
          <div className="g13-final-mark">13</div>
          <span className="g13-kicker">{signedInPreview ? "YOUR GROUP 13 WORKSPACE" : "YOUR NEXT GOOD STUDY SESSION STARTS HERE"}</span>
          <h2>{signedInPreview ? <>Welcome back.<br /><strong>Pick up your work.</strong></> : <>Read closely.<br /><strong>Think boldly.</strong></>}</h2>
          <div className="g13-final-actions">
            <button type="button" className="g13-hero-primary" onClick={signedInPreview ? openWorkspace : onSignUp}>{signedInPreview ? "Open your workspace" : "Create your account"} <ArrowRight size={17} /></button>
            {!signedInPreview && <button type="button" className="g13-final-login" onClick={onSignIn}>Already have an account? Sign in</button>}
          </div>
          {!signedInPreview && <p>Account creation is available to approved Group 13 emails.</p>}
        </section>
      </main>

      <footer className="g13-footer"><Brand /><span>Private academic workspace · Group 13</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Back to top ↑</a></footer>
      <HelpButton floating onSignUp={signedInPreview ? undefined : onSignUp} />
      {!configured && <div className="g13-config-note" role="status">The public overview is available. Sign-in will open as soon as the workspace configuration is complete.</div>}
    </div>
  );
}
