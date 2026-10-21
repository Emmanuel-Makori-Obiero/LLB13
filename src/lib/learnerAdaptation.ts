export type LearnerLevel = "llb-year-1" | "llb-year-2" | "llb-year-3" | "llb-year-4" | "masters" | "phd" | "prefer-not-to-say" | "";
export type LearningPreference = "guided" | "balanced" | "challenge" | "";
export type LearningProfile = { learnerLevel: LearnerLevel; learningPreference: LearningPreference };
export type AdaptationMessage = { role: "user" | "assistant"; content: string };
export type DebateDifficulty = "beginner" | "intermediate" | "master";

export function defaultLearningPreference(preference?: LearningPreference | null): Exclude<LearningPreference, ""> {
  return preference || "balanced";
}

const PERSONALIZED_STUDY_FEATURES = new Set([
  "chat", "explain", "summarize", "book_contents", "topic_summary", "book_recommendation", "case_brief",
  "irac", "essay_feedback", "arena_judgment", "study_plan", "kaizen_check", "moot", "moot_judge", "moot_guide",
  "arena_training", "choices_game", "kmun", "kmun_guide", "quiz", "flashcards", "notes", "rw_question",
  "rw_outline", "rw_draft", "rw_improve", "rw_critique", "rw_citations", "rw_validate", "rw_bookends",
  "quality_check", "podcast_script", "video_script", "legal_process", "legal_explain",
]);

export function isPersonalizedStudyFeature(feature: string): boolean {
  return PERSONALIZED_STUDY_FEATURES.has(feature);
}

const preferences: Record<Exclude<LearningPreference, "">, string> = {
  guided: "Support preference: guided. Break work into small sequenced steps, define unfamiliar terms, show one example, then ask one focused check-for-understanding question. Avoid overwhelming lists; provide hints before full answers.",
  balanced: "Support preference: balanced. Give a clear structured explanation, a worked example or application, and a short independent challenge; keep the response proportionate to the request.",
  challenge: "Support preference: challenge. Expect independent reasoning, use a more complex fact pattern where suitable, surface counterarguments and uncertainty, and offer graduated hints rather than revealing a full model answer immediately.",
};

function levelGuidance(level: LearnerLevel): string {
  switch (level) {
    case "llb-year-1": return "LLB year 1: scaffold legal vocabulary, source identification, issue spotting, and simple rule-to-fact reasoning. Explain why each step matters; do not presume earlier law training.";
    case "llb-year-2": return "LLB year 2: build from foundations toward fuller application, connect doctrine to evidence and context, and start comparing supported arguments. Check which course/topic the learner is working on rather than presuming a unit sequence.";
    case "llb-year-3": return "LLB year 3: use more demanding fact patterns, synthesis across supplied authorities, counterarguments, communication, and practical problem-solving; make research steps explicit when useful.";
    case "llb-year-4": return "LLB year 4: favour independent research, nuanced synthesis, contextual judgment, persuasive communication, and reflection on practical implications; still explain gaps if the learner asks for them.";
    case "masters": return "Masters/LL.M.: ask for the chosen specialization when relevant; emphasize focused legal scholarship, critical engagement with emerging areas, research design, and a defensible project argument rather than assuming one LLM pathway.";
    case "phd": return "PhD: emphasize a precise research question, critical/theoretical framing, contextual analysis, transparent method and evidence, original scholarly contribution, and communicating findings to academic and wider audiences. Do not invent a research proposal or presume subject area.";
    case "prefer-not-to-say": return "The learner chose not to state a programme/year. Do not infer level; ask what depth or course context they prefer when it matters, and provide a clear adjustable explanation.";
    default: return "No programme/year is available. Do not infer prior knowledge; briefly ask what depth or topic context the learner wants when it matters.";
  }
}

export function buildLearnerInstruction(profile: LearningProfile): string {
  const uon = profile.learnerLevel.startsWith("llb-year-")
    ? "UON LLB alignment: use the University of Nairobi's published programme outcomes as a broad compass: contextual application of legal theory/rules; socio-political and economic perspectives; regional/international legal orders; law and technology; transdisciplinary research competence; practical problem-solving and effective communication. When relevant, consider its published themes (financial/commercial; human rights, democracy, governance and law; environmental law; international law). The public UON LLB page confirms a four-year programme but does not give a complete authoritative year-by-year unit sequence; NEVER claim a particular subject belongs to a year unless the learner's selected course/material confirms it."
    : profile.learnerLevel === "masters"
      ? "UON LLM alignment: the official UON page describes specialization in emerging national/regional/international law, nine taught units (three core plus at least four in a specialization), research and a project report equivalent to four units; its six thematic areas include corporate/financial, public international, human rights, IP/technology, environment/natural resources, and democracy/governance. Ask which specialization/project the student is pursuing; do not prescribe unavailable course units."
      : profile.learnerLevel === "phd"
        ? "UON PhD alignment: the official UON Law programme emphasizes critical and theoretical approaches, law in social/economic/cultural/political context, and advanced scholarly research; help with original research framing, evidence/method, and communication. Do not assume the discipline/topic or present any output as supervisory approval."
        : "Use UON-published legal-learning outcomes when this is a law-learning request, but do not infer a UON course sequence or specialization from an unstated programme.";
  const preference = profile.learningPreference ? preferences[profile.learningPreference] : "No support-style preference was selected; use a clear balanced explanation and let the learner request more guidance or challenge.";
  return `LEARNER ADAPTATION (calibrate teaching, never change the legal task, factual standard, source limits, safety rules, or required output format):\n${levelGuidance(profile.learnerLevel)}\n${preference}\n${uon}\nUse reliable supplied/verified authorities; flag uncertainty and do not fabricate citations. Do not treat year as a measure of intelligence or mastery. If a request requires missing course context, ask a short clarifying question or state the assumption.`;
}

export function personalizeMessages<T extends AdaptationMessage>(messages: T[], profile: LearningProfile): T[] {
  const instruction = buildLearnerInstruction(profile);
  const copy = messages.map((message) => ({ ...message }));
  let index = -1;
  for (let i = copy.length - 1; i >= 0; i -= 1) if (copy[i].role === "user") { index = i; break; }
  if (index < 0) return [...copy, { role: "user", content: instruction } as T];
  copy[index] = { ...copy[index], content: `${copy[index].content}\n\n${instruction}` };
  return copy;
}

export function initialDebateDifficulty(level: LearnerLevel, preference: LearningPreference): DebateDifficulty {
  if (level === "llb-year-1") return "beginner";
  if (preference === "challenge" || level === "llb-year-3" || level === "llb-year-4" || level === "masters" || level === "phd") return "master";
  if (preference === "guided" && level === "llb-year-2") return "beginner";
  return "intermediate";
}

export function shouldShowAdaptationSurvey(signedIn: boolean, profile: LearningProfile): boolean {
  return signedIn && (!profile.learnerLevel || !profile.learningPreference);
}

export function materialVisibleToLevel(targetYears: readonly string[] | null | undefined, level: string): boolean {
  return !targetYears?.length || targetYears.includes(level);
}
