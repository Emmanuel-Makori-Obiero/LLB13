import { useEffect, useMemo, useState } from "react";
import { Clock3, Gavel, Library, Play, RotateCcw, Swords, Trophy } from "lucide-react";
import type { Material } from "./data/types";
import { askAI, type AIMode } from "./lib/ai";
import { Markdown } from "./Markdown";

type GameTab = "debate" | "choices" | "pvp";
type DebateTurn = { label: string; text: string; role: "user" | "ai" };
type ChoiceNode = { title: string; situation: string; choices: { label: string; consequence: string; next?: number }[] };

function formatTime(seconds: number) {
  return Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0");
}

export default function GamesHub({ materials }: { materials: Material[] }) {
  const [tab, setTab] = useState<GameTab>("debate");
  const [sourceId, setSourceId] = useState(materials[0]?.id ?? "");
  const source = materials.find((item) => item.id === sourceId) ?? materials[0];
  const [minutes, setMinutes] = useState<10 | 20>(10);
  const [topic, setTopic] = useState("");
  const [debateStarted, setDebateStarted] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [turn, setTurn] = useState(0);
  const [submission, setSubmission] = useState("");
  const [transcript, setTranscript] = useState<DebateTurn[]>([]);
  const [debateAnswer, setDebateAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [choiceNode, setChoiceNode] = useState<ChoiceNode | null>(null);
  const [choicePath, setChoicePath] = useState<string[]>([]);
  const [choiceDebrief, setChoiceDebrief] = useState("");

  const sourceLabel = source ? source.title + " · " + (source.topic || source.type) : "No source selected";
  const aiMode: AIMode = "library";
  useEffect(() => {
    if (!debateStarted || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [debateStarted, remaining]);
  useEffect(() => {
    if (debateStarted && remaining === 0) {
      setDebateStarted(false);
      setNotice("Time is up. Submit your final position or evaluate the debate.");
    }
  }, [debateStarted, remaining]);

  const startDebate = () => {
    if (!source) { setNotice("Choose a library source before starting."); return; }
    setDebateStarted(true); setRemaining(minutes * 60); setTurn(0); setTranscript([]); setDebateAnswer(""); setNotice("");
  };
  const submitDebateTurn = async () => {
    if (!source || !submission.trim() || busy) return;
    setBusy(true); setNotice("");
    const nextTurn = turn + 1;
    const history = [...transcript, { label: "Your " + (nextTurn === 1 ? "opening" : nextTurn === 2 ? "rebuttal" : "closing"), text: submission.trim(), role: "user" as const }];
    const historyText = history.map((item) => item.label + ": " + item.text).join("\n\n");
    const instruction = nextTurn >= 3 ? "Now give a concise rubric evaluation: legal accuracy, source use, reasoning, rebuttal, and clarity, each scored out of 5, with two concrete improvements." : "Reply as a demanding opposing counsel with one focused counterargument and one question for the next turn. Do not give a full model answer.";
    try {
      const result = await askAI({
        feature: nextTurn >= 3 ? "essay_feedback" : "moot_judge",
        mode: aiMode,
        messages: [{ role: "user", content: "You are the opposing counsel and later evaluator in a timed Kenyan law study debate. Use the selected source as the record, do not invent authorities, and clearly label any hypothetical. Source: " + sourceLabel + ". Motion: " + (topic.trim() || "Formulate a fair motion from the source") + ". Turn " + nextTurn + "/3. Debate transcript so far:\n" + historyText + "\n\n" + instruction }],
      });
      setTranscript([...history, { label: "AI opponent", text: result.answer, role: "ai" }]);
      setSubmission(""); setTurn(nextTurn); setDebateAnswer(nextTurn >= 3 ? result.answer : "");
      if (nextTurn >= 3) setDebateStarted(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The debate judge is unavailable."); }
    finally { setBusy(false); }
  };
  const generateChoices = async () => {
    if (!source || choiceBusy) return;
    setChoiceBusy(true); setNotice(""); setChoiceDebrief(""); setChoicePath([]);
    try {
      const result = await askAI({ feature: "quiz", mode: aiMode, messages: [{ role: "user", content: "Create one branching Kenyan-law decision game grounded in this source: " + sourceLabel + ". Return ONLY valid JSON with title, situation, and an array of at least three choices. Each choice needs label, consequence, and optional next number. Make the choices meaningfully different, label invented facts as hypothetical, and do not invent case citations." }] });
      const cleanAnswer = result.answer.trim();
      const raw = result.data && typeof result.data === "object" ? result.data : JSON.parse(cleanAnswer);
      const node = raw as ChoiceNode;
      if (!node.title || !node.situation || !Array.isArray(node.choices) || node.choices.length < 2) throw new Error("The generated game did not have enough choices. Try again.");
      setChoiceNode(node);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not generate the Choices game."); }
    finally { setChoiceBusy(false); }
  };
  const choose = (choice: ChoiceNode["choices"][number]) => {
    setChoicePath((path) => [...path, choice.label]);
    if (choice.next !== undefined && choice.next !== null) setNotice(choice.consequence);
    else { setChoiceDebrief(choice.consequence); setNotice("Decision path complete. Review the consequence, then generate another scenario."); }
  };
  const sourceOptions = useMemo(() => materials.length ? materials : [], [materials]);

  return <>
    <div className="page-heading"><div><div className="eyebrow">Practice with pressure</div><h1>Games Hub.</h1><p>Argue from the record, make a choice, and learn what your reasoning changes. Scores are study feedback, not legal advice.</p></div><Trophy size={32} /></div>
    <div className="games-directory" role="tablist" aria-label="Choose a legal game">
      <button className={"game-domain-card " + (tab === "debate" ? "active" : "")} onClick={() => setTab("debate")}><span className="game-domain-icon"><Swords size={20} /></span><span><strong>AI Case Debate</strong><small>Argue against a grounded AI opponent, round by round.</small></span><em>01</em></button>
      <button className={"game-domain-card " + (tab === "choices" ? "active" : "")} onClick={() => setTab("choices")}><span className="game-domain-icon"><Gavel size={20} /></span><span><strong>Choices</strong><small>Make consequential decisions in an AI-generated legal scenario.</small></span><em>02</em></button>
      <button className={"game-domain-card " + (tab === "pvp" ? "active" : "")} onClick={() => setTab("pvp")}><span className="game-domain-icon"><Play size={20} /></span><span><strong>PVP Debate</strong><small>Enter a timed one-on-one match with another member.</small></span><em>03</em></button>
    </div>
    <div className="card card-pad game-source-bar"><div><div className="section-label">Grounding record</div><strong>{source ? sourceLabel : "Add a book, case, statute, or note in Library first"}</strong></div><div className="game-source-controls"><Library size={15} /><select value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={!sourceOptions.length}><option value="">Choose source</option>{sourceOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div></div>

    {tab === "debate" && <section className="game-room">
      <div className="card card-pad game-card"><div className="game-kicker"><Clock3 size={14} /> {minutes} minute room · round {Math.min(turn + 1, 3)} of 3</div><h2>AI Case Debate</h2><p>Make an opening submission, answer the AI opponent, then close. The final evaluation uses the selected record and shows its source basis.</p><div className="game-controls"><label>Time<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value) as 10 | 20)}><option value={10}>10 minutes</option><option value={20}>20 minutes</option></select></label><label className="game-topic">Motion or issue<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Was the search lawful under the Constitution?" /></label><button className="primary-button" onClick={startDebate} disabled={!source || debateStarted}>{debateStarted ? formatTime(remaining) + " remaining" : "Start debate"}</button></div></div>
      {transcript.length > 0 && <div className="card card-pad debate-thread">{transcript.map((item, index) => <article className={"debate-turn " + item.role} key={item.label + "-" + index}><span>{item.label}</span><Markdown text={item.text} /></article>)}</div>}
      {debateStarted && <div className="card card-pad game-card"><div className="section-label">Your submission</div><textarea rows={6} value={submission} onChange={(event) => setSubmission(event.target.value)} placeholder={turn === 0 ? "State your position and anchor it to the selected source…" : "Answer the opponent's question and sharpen your reasoning…"} /><button className="primary-button" onClick={() => void submitDebateTurn()} disabled={busy || !submission.trim()}>{busy ? "Judge is reading…" : turn >= 2 ? "Submit closing and evaluate" : "Submit turn"}</button></div>}
      {debateAnswer && <div className="card card-pad game-evaluation"><div className="section-label">Evaluation</div><Markdown text={debateAnswer} /></div>}
    </section>}

    {tab === "choices" && <section className="game-room"><div className="card card-pad game-card"><div className="game-kicker"><Gavel size={14} /> Branching scenario · source grounded</div><h2>Choices</h2><p>AI generates a hypothetical legal decision from the selected material. Each choice changes the path; the debrief separates the source rule from the invented facts.</p><button className="primary-button" onClick={() => void generateChoices()} disabled={!source || choiceBusy}>{choiceBusy ? "Generating from the record…" : choiceNode ? "Generate another scenario" : "Start Choices"}</button></div>{choiceNode && <div className="card card-pad choice-card"><div className="section-label">{choiceNode.title}</div><h2>{choiceNode.situation}</h2><div className="choice-list">{choiceNode.choices.map((choice, index) => <button key={choice.label + "-" + index} className="choice-option" onClick={() => choose(choice)}><strong>{choice.label}</strong><span>{choice.consequence}</span></button>)}</div>{choicePath.length > 0 && <p className="field-hint">Path: {choicePath.join(" → ")}</p>}{choiceDebrief && <div className="game-evaluation"><strong>Debrief</strong><p>{choiceDebrief}</p></div>}</div>}</section>}

    {tab === "pvp" && <section className="game-room"><div className="card card-pad game-card"><div className="game-kicker"><Swords size={14} /> Two-person room · 10 or 20 minutes</div><h2>PVP Debate</h2><p>Invite another signed-in Group 13 member to argue from the same source. The realtime room and post-match evaluator are being wired into the next Games Hub release; this screen keeps the rules visible rather than pretending a local-only debate is multiplayer.</p><div className="callout"><p><strong>Match rules:</strong> one opening, one rebuttal, one closing each; timer chosen by the host; AI evaluation only after both players submit their recorded turns.</p></div><button className="secondary-button" onClick={() => setNotice("PVP rooms require the realtime debate migration. AI Case Debate and Choices are ready now.")}>Create PVP room</button></div></section>}
    {notice && <div className="connection-error game-notice">{notice}</div>}
  </>;
}
