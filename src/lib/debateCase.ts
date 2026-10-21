const LEGAL_TOPIC_TERMS = /\b(law|legal|claim|liabilit\w*|right\w*|remed\w*|contract\w*|tort|neglig\w*|duty|breach|property|land|lease|tenant\w*|employ\w*|constitutional|criminal|offen[cs]e|fraud|defam\w*|evidence|judicial review|administrat\w*|family|marriage|succession|inherit\w*|company|corporat\w*|consumer|privacy|cyberlaw|cybercrime|intellectual property|copyright|patent|arbitrat\w*|mediation|environment\w*|tax|labou?r|civil procedure|human rights|public law|misrepresent\w*|court|litigat\w*|negligence|advocacy|statute|statutory|constitutionalism|competition|insolvency|banking|financial|insurance|refugee|immigration|electoral|conveyancing|trust|equity|maritime|medical negligence|criminal justice|data protection)\b/i;

const IRRELEVANT_TECH_TERMS = /\b(boolean operators?|truncation|indexing failure|search tools?|search functions?|search features?|query operators?|zero results|user interface|software feature|computer malfunction|platform malfunction)\b/i;

const REQUIRED_SECTIONS = [
  "Question before the court",
  "Agreed facts",
  "Claimant's case",
  "Defendant's case",
  "Evidence packet",
  "Authority boundaries",
];

export const DEFAULT_LEGAL_DEBATE_TOPIC = "Kenyan contract law and remedies";

export function resolveLegalDebateTopic(userTopic: string, libraryTopic: string): string | null {
  const explicit = userTopic.trim();
  if (explicit) return LEGAL_TOPIC_TERMS.test(explicit) ? explicit : null;
  const sourceTopic = libraryTopic.trim();
  return LEGAL_TOPIC_TERMS.test(sourceTopic) ? sourceTopic : DEFAULT_LEGAL_DEBATE_TOPIC;
}

export function validateGeneratedCasePacket(value: string): { valid: boolean; reason: string } {
  const text = value.trim();
  if (text.length < 350) return { valid: false, reason: "The generated case packet is too short to be a balanced legal dispute." };
  const headings = new Set(text.split("\n").map((line) => line.trim().toLowerCase()));
  const missing = REQUIRED_SECTIONS.filter((heading) => !headings.has(`## ${heading.toLowerCase()}`));
  if (missing.length) return { valid: false, reason: `The case packet is missing required legal sections: ${missing.join(", ")}.` };
  const issue = text.match(/^##\s+Question before the court\s*\n([\s\S]*?)(?=^##\s|$)/im)?.[1]?.trim() ?? "";
  if (issue.length < 25 || !/\b(whether|is|are|did|can|should|liable|entitled|lawful|valid|breach|owed|violated|remedy|responsible)\b/i.test(issue)) {
    return { valid: false, reason: "The case packet does not state a clear legal issue for the motion." };
  }
  if (IRRELEVANT_TECH_TERMS.test(text)) {
    return { valid: false, reason: "The case packet introduced unrelated technical/search jargon. It was rejected; generate a new law-focused case." };
  }
  return { valid: true, reason: "" };
}

export function extractDebateMotion(packet: string): string {
  const content = packet.match(/^##\s+Question before the court\s*\n([\s\S]*?)(?=^##\s|$)/im)?.[1] ?? "";
  return content
    .split(/\n\s*\n/)[0]
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
