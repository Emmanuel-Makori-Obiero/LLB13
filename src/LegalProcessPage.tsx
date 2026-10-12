import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, Loader2, Scale, ShieldAlert } from "lucide-react";
import { askAI, type AIResult } from "./lib/ai";
import { Markdown } from "./Markdown";
import "./legal-process.css";

type ProcessStep = {
  number: number;
  title: string;
  action: string;
  why: string;
  requirements: string[];
  authority: string[];
  next: string;
  status?: "verified" | "check";
};
type ProcessData = { title: string; shortAnswer: string; assumptions: string[]; steps: ProcessStep[]; warnings: string[]; studyQuestions: string[] };
const examples = [
  "I want to open a small clothing business in Nairobi. What legal process should I follow?",
  "What if I want to terminate an employee fairly and lawfully?",
  "I want to buy land in Kenya. Show me the legal steps and documents.",
  "What if the police arrest me? Explain the lawful process and my rights.",
];
function readProcess(data: unknown): ProcessData | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Partial<ProcessData>;
  if (!Array.isArray(value.steps)) return null;
  return {
    title: String(value.title ?? "Legal process guide"),
    shortAnswer: String(value.shortAnswer ?? ""),
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.map(String) : [],
    steps: value.steps.filter(Boolean).map((step, index) => {
      const item = step as Partial<ProcessStep>;
      return { number: Number(item.number ?? index + 1), title: String(item.title ?? `Step ${index + 1}`), action: String(item.action ?? ""), why: String(item.why ?? ""), requirements: Array.isArray(item.requirements) ? item.requirements.map(String) : [], authority: Array.isArray(item.authority) ? item.authority.map(String) : [], next: String(item.next ?? ""), status: item.status === "verified" ? "verified" : "check" };
    }),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    studyQuestions: Array.isArray(value.studyQuestions) ? value.studyQuestions.map(String) : [],
  };
}
function ProcessCards({ process }: { process: ProcessData }) {
  return <div className="legal-process-result">
    <div className="legal-process-result-head"><div><span className="section-label"><ClipboardList size={15} /> Process map</span><h2>{process.title}</h2></div><span className="legal-process-badge"><Scale size={14} /> Study guide</span></div>
    {process.shortAnswer && <p className="legal-process-lead">{process.shortAnswer}</p>}
    {process.assumptions.length > 0 && <div className="legal-process-assumptions"><strong>Assumptions to confirm</strong><ul>{process.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    <div className="legal-process-flow">{process.steps.map((step, index) => <div className="legal-process-node" key={`${step.number}-${step.title}`}>
      <article className="legal-process-card">
        <div className="legal-process-card-top"><span className="legal-process-number">{String(step.number).padStart(2, "0")}</span><span className={`legal-process-status ${step.status === "verified" ? "verified" : "check"}`}>{step.status === "verified" ? <><CheckCircle2 size={12} /> Constitution/source</> : <><ShieldAlert size={12} /> Verify current law</>}</span></div>
        <h3>{step.title}</h3>
        <div className="legal-process-field"><strong>Do this</strong><p>{step.action}</p></div>
        <div className="legal-process-field"><strong>Why it matters</strong><p>{step.why}</p></div>
        {step.requirements.length > 0 && <div className="legal-process-field"><strong>Requirements</strong><ul>{step.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {step.authority.length > 0 && <div className="legal-process-authority"><strong>Legal foundation</strong>{step.authority.map((item) => <p key={item}>{item}</p>)}</div>}
        {step.next && <div className="legal-process-next"><span>Next</span>{step.next}</div>}
      </article>
      {index < process.steps.length - 1 && <div className="legal-process-arrow" aria-hidden="true"><ArrowRight size={18} /></div>}
    </div>)}</div>
    {process.warnings.length > 0 && <div className="legal-process-warnings"><strong>Before relying on this</strong><ul>{process.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    {process.studyQuestions.length > 0 && <div className="legal-process-study"><strong>Questions to investigate</strong><ul>{process.studyQuestions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
  </div>;
}
export default function LegalProcessPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setResult(null);
    try { setResult(await askAI({ feature: "legal_process", mode: "general", messages: [{ role: "user", content: text }] })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The legal process guide is unavailable."); }
    finally { setBusy(false); }
  };
  const process = result ? readProcess(result.data) : null;
  return <div className="legal-process-page">
    <div className="legal-process-intro card card-pad"><div className="legal-process-icon"><Scale size={25} /></div><div><span className="section-label">Practical Kenyan-law orientation</span><h2>Ask a legal what-if.</h2><p>Describe a real-life situation and get an ordered process: what to do, why it matters, what you may need, and what to verify. This is a study aid, not a substitute for an advocate or the current official law.</p></div></div>
    <div className="legal-process-layout"><form className="legal-process-form card card-pad" onSubmit={submit}><label>What are you trying to do?<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: I want to open a small clothing business in Nairobi. What legal process should I follow?" rows={6} /></label><div className="legal-process-examples"><span className="field-hint">Try an example</span>{examples.map((example) => <button type="button" key={example} onClick={() => setQuestion(example)}>{example}</button>)}</div><button className="primary-button" type="submit" disabled={busy || !question.trim()}>{busy ? <><Loader2 size={15} className="legal-process-spin" /> Building process…</> : <><ClipboardList size={15} /> Build legal process</>}</button><p className="field-hint">For current licences, fees, forms, deadlines, and sector rules, the guide will mark items for official verification instead of pretending the model knows a live register.</p></form><section className="card card-pad legal-process-output">{error && <div className="connection-error">{error}</div>}{!result && !error && <div className="legal-process-empty"><ArrowRight size={25} /><h2>Your process cards will appear here.</h2><p>Start with a “what if” and the guide will turn it into a sequence you can study and verify.</p></div>}{result && process && <ProcessCards process={process} />}{result && !process && <div><div className="legal-process-badge">{result.grounded ? "Source-grounded" : "General orientation"}</div><Markdown text={result.answer} /></div>}{result?.sources.length ? <div className="sa-sources legal-process-sources"><div className="section-label">Sources used</div>{result.sources.map((source) => <div className="sa-source" key={source.tag}><sup className="md-cite">{source.tag}</sup>{source.ref && /^https?:\/\//i.test(source.ref) ? <a href={source.ref} target="_blank" rel="noreferrer">{source.title} ↗</a> : <span>{source.title}{source.ref ? `, ${source.ref}` : ""}</span>}</div>)}</div> : null}</section></div>
  </div>;
}
