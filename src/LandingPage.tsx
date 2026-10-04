import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";
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
  X,
} from "lucide-react";
import InstallButton from "./InstallButton";
import "./landing.css";

type LandingPageProps = {
  configured: boolean;
  onSignIn: () => void;
  onSignUp: () => void;
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
}: LandingPageProps) {
  const [activeChapter, setActiveChapter] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [heroPoint, setHeroPoint] = useState({ x: 72, y: 52 });
  const current = chapters[activeChapter];
  const ActiveIcon = current.icon;

  useEffect(() => {
    const update = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(distance > 0 ? Math.min(100, (window.scrollY / distance) * 100) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const moveSpotlight = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHeroPoint({
      x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
    });
  };

  const heroStyle = {
    "--hero-x": `${heroPoint.x}%`,
    "--hero-y": `${heroPoint.y}%`,
  } as CSSProperties;
  const exploreSection = (page: string) => {
    const target = page === "guide" ? "inside" : page === "library" || page === "assistant" ? "features" : "the-method";
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="g13-landing" style={{ "--page-progress": `${scrollProgress}%` } as CSSProperties}>
      <div className="g13-scroll-progress" aria-hidden="true" />
      <header className="g13-site-header">
        <Brand />
        <nav className="g13-site-nav" aria-label="Main navigation">
          <a href="#the-method">The method</a>
          <a href="#inside">Inside the hub</a>
          <HelpButton onSignUp={onSignUp} onNavigate={exploreSection} />
        </nav>
        <div className="g13-header-actions">
          <button className="g13-login-button" type="button" onClick={onSignIn}>Sign in</button>
          <button className="g13-signup-button" type="button" onClick={onSignUp}>Create account <ArrowRight size={15} /></button>
        </div>
      </header>

      <main>
        <section className="g13-hero" style={heroStyle} onPointerMove={moveSpotlight}>
          <div className="g13-hero-image" aria-hidden="true" />
          <div className="g13-hero-grain" aria-hidden="true" />
          <div className="g13-hero-vignette" aria-hidden="true" />
          <div className="g13-hero-copy">
            <div className="g13-hero-eyebrow"><span /> A PRIVATE LEARNING SPACE FOR GROUP 13</div>
            <h1>Study the law.<br /><em>Find your argument.</em></h1>
            <p className="g13-hero-lede">
              Your books, guided lessons, practice and class life—brought into
              one thoughtful workspace built for the way law students learn.
            </p>
            <div className="g13-hero-actions">
              <button className="g13-hero-primary" type="button" onClick={onSignUp}>
                Create your account <ArrowRight size={17} />
              </button>
              <button className="g13-hero-secondary" type="button" onClick={onSignIn}>
                Sign in <span aria-hidden="true">↗</span>
              </button>
            </div>
            <p className="g13-access-note">
              <LockKeyhole size={13} /> For approved Group 13 accounts.
            </p>
          </div>
          <div className="g13-hero-index"><span>FIELD NOTES</span><strong>13</strong><small>LEARN · REASON · REPEAT</small></div>
          <a className="g13-scroll-cue" href="#the-method"><span>Scroll to explore</span><ArrowDown size={14} /></a>
          <div className="g13-hero-caption">A QUIETER WAY TO THINK CLEARLY</div>
        </section>

        <section className="g13-manifesto" id="the-method">
          <div className="g13-manifesto-stamp">THE GROUP 13 METHOD<br />READ · RECALL · REASON</div>
          <p className="g13-manifesto-copy">
            The work is demanding.<br />Your study space should <em>make it clearer.</em>
          </p>
          <p className="g13-manifesto-side">
            A focused home for the reading, questions and small daily steps that
            make legal thinking yours.
          </p>
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
              <button type="button" className="g13-text-link" onClick={onSignUp}>Explore the hub <ArrowRight size={14} /></button>
              <span className="g13-detail-index">{current.number} / 03</span>
            </article>
          </div>
        </section>

        <section className="g13-tools" id="features" aria-label="What is inside Group 13 Hub">
          <div className="g13-tools-intro">
            <span className="g13-kicker">ONE HUB. MORE ROOM TO THINK.</span>
            <h2>Built around your<br /><em>real study day.</em></h2>
            <p>Move from the source to understanding, then test what you know—without losing your place.</p>
            <button type="button" className="g13-text-link" onClick={onSignUp}>See what you can do <ArrowRight size={14} /></button>
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
          <span className="g13-kicker">YOUR NEXT GOOD STUDY SESSION STARTS HERE</span>
          <h2>Read closely.<br /><em>Think boldly.</em></h2>
          <div className="g13-final-actions">
            <button type="button" className="g13-hero-primary" onClick={onSignUp}>Create your account <ArrowRight size={17} /></button>
            <button type="button" className="g13-final-login" onClick={onSignIn}>Already have an account? Sign in</button>
          </div>
          <p>Account creation is available to approved Group 13 emails.</p>
        </section>
      </main>

      <footer className="g13-footer"><Brand /><span>Private academic workspace · Group 13</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Back to top ↑</a></footer>
      <HelpButton floating onSignUp={onSignUp} />
      {!configured && <div className="g13-config-note" role="status">The public overview is available. Sign-in will open as soon as the workspace configuration is complete.</div>}
    </div>
  );
}
