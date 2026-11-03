import { useEffect, useMemo, useState } from "react";
import { BookOpen, Brain, CheckCircle2, Loader2, MessageCircle, Send, Sparkles } from "lucide-react";
import { askAI } from "./lib/ai";
import { Markdown } from "./Markdown";
import type { LearnerLevel } from "./lib/learnerAdaptation";
import { repository } from "./data/repository";
import type { DailyCase } from "./data/types";
import "./daily-case.css";

type ChatTurn = { role: "user" | "assistant"; content: string };
const thoughtKey = (userId: string, caseId: string) => `group13-daily-case-thoughts:${userId}:${caseId}`;
const chatKey = (userId: string, caseId: string) => `group13-daily-case-chat:${userId}:${caseId}`;

const iracGuide = [
  ["Issue", "What exact legal question must the court answer? State it as a question."],
  ["Rule", "What legal rule, statute, constitutional provision, or authority governs the issue?"],
  ["Application", "Link each important fact to the rule. Explain why the fact supports one side and answer the strongest counterargument."],
  ["Conclusion", "Give a short, reasoned answer. Do not introduce a new issue here."],
] as const;

export default function DailyCasePage({ learnerLevel = "", userId = "guest" }: { learnerLevel?: LearnerLevel; userId?: string | null }) {
  const [dailyCase, setDailyCase] = useState<DailyCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [thoughts, setThoughts] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState<"analysis" | "chat" | "">("");

  useEffect(() => { void repository.getDailyCase().then(setDailyCase).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load today's case.")).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!dailyCase) return;
    try {
      setThoughts(localStorage.getItem(thoughtKey(userId || "guest", dailyCase.id)) ?? "");
      setChat(JSON.parse(localStorage.getItem(chatKey(userId || "guest", dailyCase.id)) ?? "[]") as ChatTurn[]);
    } catch { setThoughts(""); setChat([]); }
  }, [dailyCase, userId]);

  useEffect(() => { if (dailyCase) localStorage.setItem(thoughtKey(userId || "guest", dailyCase.id), thoughts); }, [dailyCase, thoughts, userId]);
  useEffect(() => { if (dailyCase) localStorage.setItem(chatKey(userId || "guest", dailyCase.id), JSON.stringify(chat.slice(-20))); }, [dailyCase, chat, userId]);

  const caseText = useMemo(() => dailyCase?.content.trim() ?? "", [dailyCase]);
  const submitAnalysis = async () => {
    if (!dailyCase || busy) return;
    setBusy("analysis");
    setError("");
    try {
      const result = await askAI({
        feature: "irac",
        mode: "library",
        docIds: [dailyCase.id],
        learnerLevel,
        messages: [{ role: "user", content: `You are the Daily Case IRAC tutor. Analyse the selected case only. The learner is at ${learnerLevel || "an introductory law-student level"}. Explain every legal term in plain language before using it. Return exactly these headings: ## Issue, ## Rule, ## Application, ## Conclusion, ## What to improve. Under Application, connect the facts to the rule and address the strongest counterargument. Distinguish verified authority from the learner's reasoning. Do not invent a case, statute, citation, quotation, or fact. Here are the learner's own thoughts; use them as a draft to coach, not as authority:
${thoughts.trim() || "No draft was written yet."}` }],
      });
      setAnalysis(result.answer);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The IRAC tutor could not finish."); }
    finally { setBusy(""); }
  };

  const sendQuestion = async () => {
    const text = question.trim();
    if (!dailyCase || !text || busy) return;
    const next = [...chat, { role: "user" as const, content: text }].slice(-20);
    setChat(next); setQuestion(""); setBusy("chat"); setError("");
    try {
      const result = await askAI({
        feature: "chat",
        mode: "library",
        docIds: [dailyCase.id],
        learnerLevel,
        messages: [{ role: "user", content: `Act as a patient Kenyan-law tutor discussing today's case. Keep every answer grounded in the selected uploaded case. Use IRAC whenever the learner asks a legal question: identify the Issue, state the Rule, Apply it to the facts, then give a Conclusion. Explain difficult words simply. If the case text does not establish a point, say that it is not stated and do not guess. This is study help, not legal advice.\n\nCASE TITLE: ${dailyCase.title}\nLEARNER'S OWN THOUGHTS:\n${thoughts.trim() || "None"}\n\nCONVERSATION:\n${next.map((turn) => `${turn.role}: ${turn.content}`).join("\n\n")}\n\nAnswer the learner's latest question. Keep the response focused and invite them to test their own reasoning.` }],
      });
      setChat([...next, { role: "assistant", content: result.answer }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The case tutor could not answer."); }
    finally { setBusy(""); }
  };

  if (loading) return <div className="daily-case-loading"><Loader2 className="daily-case-spin" /> Loading today's case…</div>;
  if (error && !dailyCase) return <div className="connection-error">{error}</div>;
  return <div className="daily-case-page">
    <header className="daily-case-hero">
      <div><span className="daily-case-kicker"><Sparkles size={15} /> DAILY CASE · IRAC PRACTICE</span><h1>Read the case. Think it through. <em>Reason clearly.</em></h1><p>Write your own thoughts first, then ask the tutor to guide you through Issue, Rule, Application, and Conclusion.</p></div>
      <div className="daily-case-badge"><BookOpen size={25} /><strong>Case of the day</strong><span>Changes daily from the uploaded case library</span></div>
    </header>
    {error && <div className="connection-error">{error}</div>}
    {!dailyCase ? <section className="card card-pad daily-case-empty"><BookOpen size={28} /><h2>No uploaded case is ready yet.</h2><p>Ask an administrator to upload a case into the shared Library. Once it is available, everyone will see a daily case here.</p></section> : <>
      <section className="card card-pad daily-case-source"><div className="daily-case-source-head"><div><span className="section-label">TODAY'S UPLOADED CASE</span><h2>{dailyCase.title}</h2>{dailyCase.citation && <p className="field-hint">{dailyCase.citation}</p>}</div><span className="daily-case-source-count">{dailyCase.sourceCount} source sections</span></div><div className="daily-case-text"><Markdown text={caseText || "The uploaded case has no readable text yet. Open the source in Library or ask an administrator to re-upload it."} /></div></section>
      <section className="daily-case-layout">
        <div className="daily-case-workspace">
          <section className="card card-pad"><div className="daily-case-section-head"><div><span className="section-label">YOUR REASONING</span><h2>Write your own thoughts first</h2></div><Brain size={22} /></div><p className="field-hint">Do not worry about perfect writing. Identify what you think the issue, rule, application, and conclusion are.</p><textarea className="daily-case-thoughts" value={thoughts} onChange={(event) => setThoughts(event.target.value)} placeholder="My first thought is…" rows={10} /><button className="primary-button" type="button" onClick={() => void submitAnalysis()} disabled={busy !== ""}>{busy === "analysis" ? <><Loader2 className="daily-case-spin" size={15} /> Checking my IRAC…</> : <><CheckCircle2 size={15} /> Get IRAC feedback</>}</button></section>
          <section className="card card-pad daily-case-irac-guide"><div className="daily-case-section-head"><div><span className="section-label">THE METHOD</span><h2>IRAC, made clear</h2></div></div>{iracGuide.map(([label, copy]) => <div className="daily-case-irac-row" key={label}><strong>{label}</strong><p>{copy}</p></div>)}</section>
        </div>
        <aside className="daily-case-tutor card card-pad"><div className="daily-case-section-head"><div><span className="section-label">DISCUSS WITH AI</span><h2>Ask about this case</h2></div><MessageCircle size={22} /></div><p className="field-hint">The tutor will explain the case in plain language and keep bringing you back to IRAC.</p><div className="daily-case-chat" aria-live="polite">{chat.length ? chat.map((turn, index) => <article className={`daily-case-bubble ${turn.role}`} key={`${turn.role}-${index}`}><span>{turn.role === "user" ? "You" : "IRAC tutor"}</span>{turn.role === "assistant" ? <Markdown text={turn.content} /> : <p>{turn.content}</p>}</article>) : <div className="daily-case-chat-empty">Ask “What is the issue?” or “How do these facts apply to the rule?”</div>}</div><div className="daily-case-composer"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void sendQuestion(); }} placeholder="Ask a question about today's case…" rows={3} /><button className="primary-button" type="button" onClick={() => void sendQuestion()} disabled={busy !== "" || !question.trim()}>{busy === "chat" ? <Loader2 className="daily-case-spin" size={15} /> : <Send size={15} />} Ask tutor</button><small>Ctrl/Cmd + Enter to send</small></div></aside>
      </section>
      {analysis && <section className="card card-pad daily-case-analysis"><div className="daily-case-section-head"><div><span className="section-label">TUTOR FEEDBACK</span><h2>Your IRAC review</h2></div></div><Markdown text={analysis} /></section>}
    </>}
  </div>;
}
