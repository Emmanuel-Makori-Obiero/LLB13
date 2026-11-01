import { useMemo, useState } from "react";
import { Check, CheckCircle2, ClipboardList, FileUp, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { askAI, extractText, saveTextMaterial, deleteMaterial } from "./lib/ai";
import type { Todo } from "./data/types";

type ChecklistItem = { id: string; title: string; category: string; description: string; week: string; priority: string; completed: boolean };
type OutlinePlan = { courseTitle: string; courseCode: string; summary: string; items: ChecklistItem[] };

function parsePlan(value: unknown, answer: string): Omit<OutlinePlan, "items"> & { items: Array<Omit<ChecklistItem, "id" | "completed">> } {
  const source = value && typeof value === "object" ? value : JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  const row = source as Record<string, unknown>;
  const rawItems = Array.isArray(row.items) ? row.items : [];
  return {
    courseTitle: String(row.courseTitle ?? "Course outline").trim(),
    courseCode: String(row.courseCode ?? "").trim(),
    summary: String(row.summary ?? "").trim(),
    items: rawItems.map((item, index) => {
      const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        id: `outline-${index}`,
        title: String(entry.title ?? `Course requirement ${index + 1}`).trim(),
        category: String(entry.category ?? "topic").trim().toLowerCase(),
        description: String(entry.description ?? "").trim(),
        week: String(entry.week ?? "").trim(),
        priority: String(entry.priority ?? "medium").trim().toLowerCase(),
        completed: false,
      };
    }).filter((item) => item.title),
  };
}

const categoryLabel = (value: string) => value.replace(/^./, (letter) => letter.toUpperCase());

export default function CourseOutlinePage({ onCreateTodos }: { onCreateTodos: (todos: Omit<Todo, "id">[]) => Promise<void> }) {
  const [fileName, setFileName] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [plan, setPlan] = useState<OutlinePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const completed = useMemo(() => plan?.items.filter((item) => item.completed).length ?? 0, [plan]);
  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(""); setNotice(""); setFileName(file.name);
    try { setOutlineText((await extractText(file)).trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That outline could not be read."); }
  };
  const generate = async () => {
    if (!outlineText.trim()) { setError("Upload an outline or paste its text first."); return; }
    setBusy(true); setError(""); setNotice("");
    let documentId: string | null = null;
    try {
      const indexed = await saveTextMaterial(`Course outline · ${fileName || new Date().toLocaleDateString("en-GB")}`, outlineText.trim());
      documentId = indexed.id;
      const result = await askAI({
        feature: "course_outline",
        mode: "materials",
        docIds: [indexed.id],
        messages: [{ role: "user", content: "Read the complete uploaded course outline and create the checklist. Include all topics, readings, assessments, deadlines and administrative requirements that are actually stated." }],
      });
      const parsed = parsePlan(result.data, result.answer);
      if (!parsed.items.length) throw new Error("No checklist items were found. Upload a clearer outline or paste the outline text directly.");
      setPlan(parsed as OutlinePlan);
      setNotice(`${parsed.items.length} checklist items created.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The course outline could not be organized."); }
    finally { setBusy(false); if (documentId) await deleteMaterial(documentId).catch(() => undefined); }
  };
  const toggle = (id: string) => setPlan((current) => current && { ...current, items: current.items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item) });
  const addToTodos = async () => {
    if (!plan) return;
    setExporting(true); setError("");
    try {
      await onCreateTodos(plan.items.filter((item) => !item.completed).map((item) => ({ title: `${plan.courseCode ? `${plan.courseCode}: ` : ""}${item.title}`, completed: false, source: "manual" })));
      setNotice("Open checklist items were added to My to-do.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add checklist items to My to-do."); }
    finally { setExporting(false); }
  };
  return <div className="course-outline-page">
    <div className="course-outline-hero"><div><span className="section-label">COURSE ORGANIZER</span><h1>Turn an outline into a plan.</h1><p>Upload a course outline, syllabus, or handbook. Group 13 will read it and turn the requirements into a checklist you can work through.</p></div><ClipboardList size={42} /></div>
    <section className="course-outline-upload card card-pad">
      <div className="course-outline-upload-head"><div><h2>Upload your course outline</h2><p className="field-hint">PDF, Word, text, Markdown, or a clear image. You can also paste the outline below.</p></div><label className="primary-button course-outline-file"><FileUp size={15} /> {fileName ? "Replace file" : "Choose file"}<input type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => void handleFile(event.target.files?.[0])} /></label></div>
      <textarea value={outlineText} onChange={(event) => { setOutlineText(event.target.value); setFileName(""); }} rows={9} placeholder="Or paste the course outline here…" />
      <div className="course-outline-actions"><span className="field-hint">{outlineText ? `${outlineText.length.toLocaleString()} characters ready` : "Nothing uploaded yet"}</span><button className="primary-button" type="button" onClick={() => void generate()} disabled={busy || !outlineText.trim()}>{busy ? <><Loader2 size={15} className="course-outline-spin" /> Reading outline…</> : <><CheckCircle2 size={15} /> Create checklist</>}</button></div>
      {error && <div className="connection-error">{error}</div>}{notice && <div className="success-notice">{notice}</div>}
    </section>
    {plan && <section className="course-outline-results"><div className="course-outline-results-head"><div><span className="section-label">YOUR CHECKLIST</span><h2>{plan.courseTitle}{plan.courseCode && <small>{plan.courseCode}</small>}</h2><p>{plan.summary}</p></div><div className="course-outline-progress"><strong>{completed}/{plan.items.length}</strong><span>complete</span></div></div><div className="course-outline-progress-bar"><span style={{ width: `${(completed / plan.items.length) * 100}%` }} /></div><div className="course-outline-result-actions"><button className="secondary-button" type="button" onClick={() => setPlan(null)}><RotateCcw size={14} /> Start another outline</button><button className="primary-button" type="button" onClick={() => void addToTodos()} disabled={exporting || !plan.items.some((item) => !item.completed)}>{exporting ? <Loader2 size={14} className="course-outline-spin" /> : <Plus size={14} />} Add open items to My to-do</button></div><div className="course-outline-list">{plan.items.map((item) => <article className={`course-outline-item${item.completed ? " is-complete" : ""}`} key={item.id}><button type="button" className="course-outline-check" aria-label={item.completed ? "Mark incomplete" : "Mark complete"} onClick={() => toggle(item.id)}>{item.completed ? <Check size={15} /> : null}</button><div className="course-outline-item-main"><div className="course-outline-meta"><span>{categoryLabel(item.category)}</span>{item.week && <span>{item.week}</span>}<span className={`priority-${item.priority}`}>{item.priority} priority</span></div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div><Trash2 size={15} className="course-outline-item-icon" /></article>)}</div></section>}
  </div>;
}
