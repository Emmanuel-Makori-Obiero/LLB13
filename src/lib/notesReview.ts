export type AuthorityQuery = { mention: string; query: string };

export type NotesResearchPlan = {
  legalIssues: string[];
  authorities: AuthorityQuery[];
  searchQueries: string[];
};

export type NotesCorrection = {
  original: string;
  corrected: string;
  category: string;
  reason: string;
  sourceIds: string[];
  verification: "supported" | "unverified" | "not_applicable";
};

export type NotesAuthorityCheck = {
  authority: string;
  status: "verified" | "not_found" | "not_checked";
  reason: string;
  sourceIds: string[];
};

export type NotesReviewResult = {
  status: "reviewed_with_sources" | "partly_checked" | "needs_review";
  summary: string;
  correctedNotes: string;
  corrections: NotesCorrection[];
  authorityChecks: NotesAuthorityCheck[];
  unresolved: string[];
};

export type OfficialResearchSource = {
  id: string;
  title: string;
  url: string;
  citation: string | null;
  text: string;
};

const cleanString = (value: unknown, max = 600): string =>
  typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";

function stringArray(value: unknown, maxItems = 16): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item, 500)).filter(Boolean).slice(0, maxItems)
    : [];
}

export function normalizeResearchPlan(value: unknown): NotesResearchPlan {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const authorities = Array.isArray(data.authorities)
    ? data.authorities.map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return { mention: cleanString(row.mention, 240), query: cleanString(row.query, 180) };
      }).filter((row) => row.mention && row.query).slice(0, 8)
    : [];
  const queries = stringArray(data.searchQueries ?? data.search_queries, 180)
    .filter((query) => query.length >= 3 && query.length <= 180);
  const legalIssues = stringArray(data.legalIssues ?? data.legal_issues, 12);
  const allQueries = [...authorities.map((item) => item.query), ...queries, ...legalIssues];
  return {
    legalIssues,
    authorities,
    searchQueries: [...new Set(allQueries)].slice(0, 8),
  };
}

export function safeKenyaLawUrl(value: unknown): string | null {
  const input = cleanString(value, 1000);
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !["kenyalaw.org", "www.kenyalaw.org", "new.kenyalaw.org"].includes(host)) return null;
    if (!url.pathname.startsWith("/akn/ke/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const validVerification = (value: unknown): NotesCorrection["verification"] =>
  value === "supported" || value === "unverified" ? value : "not_applicable";

export function normalizeNotesReview(
  value: unknown,
  availableSourceIds: ReadonlySet<string>,
): NotesReviewResult | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const safeIds = (input: unknown) => stringArray(input, 8).filter((id) => availableSourceIds.has(id));
  const correctedNotes = cleanString(data.corrected_notes ?? data.correctedNotes, 100_000)
    .replace(/\[(K\d+)\]/g, (tag, id: string) => availableSourceIds.has(id) ? tag : "[unverified source reference]");
  if (correctedNotes.length < 20) return null;
  const corrections: NotesCorrection[] = Array.isArray(data.corrections)
    ? data.corrections.map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const sourceIds = safeIds(row.source_ids ?? row.sourceIds);
        const requestedVerification = validVerification(row.verification);
        return {
          original: cleanString(row.original, 800),
          corrected: cleanString(row.corrected, 800),
          category: cleanString(row.category, 80) || "other",
          reason: cleanString(row.reason, 900),
          sourceIds,
          verification: requestedVerification === "supported" && sourceIds.length === 0 ? "unverified" : requestedVerification,
        };
      }).filter((item) => item.original || item.corrected).slice(0, 80)
    : [];
  const rawAuthorityChecks = data.authority_checks ?? data.authorityChecks;
  const authorityChecks: NotesAuthorityCheck[] = Array.isArray(rawAuthorityChecks)
    ? rawAuthorityChecks.map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const sourceIds = safeIds(row.source_ids ?? row.sourceIds);
        const status: NotesAuthorityCheck["status"] = row.status === "verified" && sourceIds.length
          ? "verified"
          : row.status === "not_found" ? "not_found" : "not_checked";
        return {
          authority: cleanString(row.authority, 400),
          status,
          reason: cleanString(row.reason, 900),
          sourceIds,
        };
      }).filter((item) => item.authority).slice(0, 40)
    : [];
  const unresolved = stringArray(data.unresolved_questions ?? data.unresolved, 40);
  const hasIncompleteChecks = authorityChecks.some((item) => item.status !== "verified") ||
    corrections.some((item) => item.verification === "unverified") || unresolved.length > 0;
  const status: NotesReviewResult["status"] = availableSourceIds.size === 0
    ? "needs_review"
    : hasIncompleteChecks ? "partly_checked" : "reviewed_with_sources";
  return {
    status,
    summary: cleanString(data.summary, 1200) || "Review completed. Read the unresolved items and official sources before relying on these notes.",
    correctedNotes,
    corrections,
    authorityChecks,
    unresolved,
  };
}

export function uniqueOfficialSources(sources: OfficialResearchSource[]): OfficialResearchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const safeUrl = safeKenyaLawUrl(source.url);
    if (!safeUrl || !source.text.trim() || seen.has(safeUrl)) return false;
    seen.add(safeUrl);
    return true;
  }).map((source, index) => ({ ...source, id: `K${index + 1}`, url: safeKenyaLawUrl(source.url)! }));
}

export function notesReviewPrompt(
  sources: OfficialResearchSource[],
  segment: { part: number; total: number; precedingTail?: string } = { part: 0, total: 1 },
): string {
  const officialSources = sources.length
    ? sources.map((source) => `<${source.id} title="${source.title.replace(/[<>\n]/g, " ")}" citation="${(source.citation ?? "").replace(/[<>\n]/g, " ")}" url="${source.url}">\n${source.text.slice(0, 4500)}\n</${source.id}>`).join("\n\n")
    : "No official judgment or statute text could be opened. Do not mark any legal authority as verified.";
  const preceding = segment.precedingTail?.trim()
    ? `\nThe previously reviewed segment ends with this corrected text: <continuity_anchor>${segment.precedingTail.slice(-700)}</continuity_anchor>. Indexed chunks may repeat a short boundary passage. Do not repeat material already present in that anchor unless it needs an explicit correction; continue with the new source content.`
    : "";
  return `Review segment ${segment.part + 1} of ${segment.total} from the selected student's notes, supplied under <sources>. Correct every point in THIS segment and return the complete revised text of this segment, not the entire upload, an outline, or a sample. The backend walks all indexed sections in order; do not assume anything not present in this segment or official records. Independently compare legal claims and every named case/citation visible in this segment against the opened official records below. Return ONLY valid JSON with exactly these keys: {"summary":"","corrected_notes":"","corrections":[{"original":"","corrected":"","category":"spelling|case_name|citation|legal_rule|meaning|date|other","reason":"","source_ids":["K1"],"verification":"supported|unverified|not_applicable"}],"authority_checks":[{"authority":"","status":"verified|not_found|not_checked","reason":"","source_ids":["K1"]}],"unresolved_questions":[""]}. Preserve the student's substantive meaning and structure where correct; fix grammar/spelling, but never change a legal proposition or case identity based on model memory. Use only the official judgment/statute passages below to confirm a holding or legal rule. The presence of a search result or matching title alone is not verification. If the official text is missing, inaccessible, ambiguous, or does not support the claim, leave it explicit as unverified/not_checked and add an unresolved question; do not invent a replacement case, citation, section, holding, quotation, or law. Include all substantive points in this segment and do not silently omit or truncate them. If a sentence is too unclear to repair safely, preserve it with [unclear—check source] and explain why. Cite no source ID except those listed below. A completed review is not a guarantee of correctness or legal advice.${preceding}\n\nOPENED OFFICIAL KENYA LAW SOURCES\n${officialSources}`;
}

function normalizedWithOffsets(value: string): { text: string; ends: number[] } {
  let text = "";
  const ends: number[] = [];
  let index = 0;
  while (index < value.length) {
    if (/\s/.test(value[index])) {
      let end = index + 1;
      while (end < value.length && /\s/.test(value[end])) end++;
      if (text && !text.endsWith(" ")) {
        text += " ";
        ends.push(end);
      }
      index = end;
    } else {
      text += value[index].toLowerCase();
      ends.push(index + 1);
      index++;
    }
  }
  return { text, ends };
}

export function joinReviewedNoteParts(parts: string[]): string {
  let result = "";
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    if (!result) {
      result = part;
      continue;
    }
    const left = normalizedWithOffsets(result).text;
    const right = normalizedWithOffsets(part);
    let overlap = 0;
    const max = Math.min(1200, left.length, right.text.length);
    for (let length = max; length >= 80; length--) {
      const boundary = right.text[length] ?? " ";
      if (left.endsWith(right.text.slice(0, length)) && (boundary === " " || /[.,;:!?]/.test(boundary))) {
        overlap = length;
        break;
      }
    }
    const rawCut = overlap ? right.ends[overlap - 1] ?? 0 : 0;
    const remainder = part.slice(rawCut).replace(/^[\s—–-]+/, "");
    if (remainder) result = `${result.trimEnd()}\n\n${remainder}`;
  }
  return result;
}
