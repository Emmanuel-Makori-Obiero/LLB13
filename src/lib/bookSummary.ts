import type { AIResult } from "./ai";

export const BOOK_SUMMARY_SECTIONS_PER_PART = 10;
export const MAX_BOOK_SUMMARY_SECTIONS = 500;

export type BookSummaryPartPlan = {
  part: number;
  totalParts: number;
  startSection: number;
  endSection: number;
  size: number;
};

export type CompletedBookSummaryPart = {
  plan: BookSummaryPartPlan;
  result: AIResult;
};

export function planBookSummary(totalSections: number): BookSummaryPartPlan[] {
  if (!Number.isInteger(totalSections) || totalSections < 1) {
    throw new Error("This book has no readable indexed sections. Check that its text was extracted, then try again.");
  }
  if (totalSections > MAX_BOOK_SUMMARY_SECTIONS) {
    throw new Error(`This book has ${totalSections.toLocaleString()} readable sections. Complete book notes currently support up to ${MAX_BOOK_SUMMARY_SECTIONS}; split a very large multi-volume source into separate books. Nothing was sampled.`);
  }
  const totalParts = Math.ceil(totalSections / BOOK_SUMMARY_SECTIONS_PER_PART);
  return Array.from({ length: totalParts }, (_, part) => {
    const startSection = part * BOOK_SUMMARY_SECTIONS_PER_PART + 1;
    const endSection = Math.min(totalSections, startSection + BOOK_SUMMARY_SECTIONS_PER_PART - 1);
    return {
      part,
      totalParts,
      startSection,
      endSection,
      size: endSection - startSection + 1,
    };
  });
}

export function bookSummaryPartPrompt(
  request: string,
  plan: BookSummaryPartPlan,
): string {
  const focus = request.trim() || "No additional focus was supplied.";
  const scope = plan.totalParts === 1
    ? "This range covers all indexed sections."
    : plan.part === 0
      ? "Later indexed sections are processed in separate ranges."
      : plan.part === plan.totalParts - 1
        ? "Earlier indexed sections are processed in separate ranges."
        : "Earlier and later indexed sections are processed in separate ranges.";
  return `Create organized, natural-sounding study notes from this source range only. This is part ${plan.part + 1} of ${plan.totalParts}, covering indexed sections ${plan.startSection}–${plan.endSection}. ${scope} Do not imply you read sections outside this range in this request.\n\nThe student's focus, if any: ${focus}\n\nWrite like a careful human editor preparing useful revision notes: use clear, varied headings and direct language; avoid generic introductions, repetitive filler, stock AI phrases, and claims that sound more certain than the source. Preserve the important events or arguments, people/characters, concepts, examples, definitions, turning points, relationships, qualifications, and conclusions actually present in these sections. For novels, keep events and character changes in their source order. For non-fiction, preserve the author's central claims, supporting reasoning, and meaningful limits. Do not invent missing chapters, facts, quotations, or context from memory. If the source is unclear, say so. Compress repetition, not main points. Use Markdown headings and bullets; use a compact Markdown table only when it genuinely clarifies a comparison.\n\nStart with exactly one short line in this format: > Part recap: [one sentence, at most 45 words, covering only this source range]. Then add a useful heading and the organized notes for this range. Do not claim that the whole book was covered.`;
}

export function extractBookPartRecap(text: string): string {
  const recap = /^>\s*Part recap:\s*(.+)$/im.exec(text)?.[1]?.trim();
  if (recap) return recap.slice(0, 300);
  return text.replace(/^>.*\n?/gm, "").trim().slice(0, 300);
}

export function bookSummarySynthesisPrompt(
  title: string,
  request: string,
  recaps: { plan: BookSummaryPartPlan; recap: string }[],
): string {
  const entries = recaps.map(({ plan, recap }) =>
    `[Part ${plan.part + 1}, indexed sections ${plan.startSection}–${plan.endSection}] ${recap}`,
  ).join("\n");
  return `Prepare a concise whole-book overview for “${title}” using only the ordered part recaps below. These recaps collectively cover all ${recaps.length ? recaps[recaps.length - 1].plan.endSection : 0} indexed sections. The full, more detailed notes for every part will follow this overview in the downloadable study document. Do not add outside knowledge or present details absent from these recaps.\n\nStudent focus: ${request.trim() || "Give a balanced overview."}\n\nWrite in natural, specific, well-edited prose without generic AI preambles or repetitive template language. For a novel, explain the premise, central conflict, major character arcs, turning points, themes, and resolution only where supported. For a textbook or other non-fiction, explain its thesis, structure, key ideas, reasoning, and conclusions. Use short headings and a few purposeful bullets or a small comparison table only if useful. Do not claim that a recap contains detail that it does not.\n\nORDERED PART RECAPS\n${entries}`;
}

export function mergeBookSummaryParts(
  title: string,
  totalSections: number,
  completed: CompletedBookSummaryPart[],
  overview: AIResult | null,
  failure?: string,
  overviewFailure?: string,
): AIResult {
  let nextSourceNumber = 1;
  const sharedTags = new Map<string, string>();
  const sources: AIResult["sources"] = [];
  const sections = completed.map(({ plan, result }) => {
    const localToGlobal = new Map<string, string>();
    for (const source of result.sources ?? []) {
      const key = `${source.title}\u0000${source.author ?? ""}\u0000${source.ref ?? ""}`;
      let globalTag = sharedTags.get(key);
      if (!globalTag) {
        globalTag = `S${nextSourceNumber++}`;
        sharedTags.set(key, globalTag);
        sources.push({ ...source, tag: globalTag });
      }
      localToGlobal.set(source.tag, globalTag);
    }
    const answer = result.answer.replace(/\[(S\d+)\]/g, (match, tag: string) => {
      const globalTag = localToGlobal.get(tag);
      return globalTag ? `[${globalTag}]` : match;
    });
    return `## Part ${plan.part + 1} · indexed sections ${plan.startSection}–${plan.endSection}\n\n${answer}`;
  });

  const finishedSections = completed.length
    ? completed[completed.length - 1].plan.endSection
    : 0;
  const coverage = failure
    ? `> **Incomplete coverage:** processed indexed sections 1–${finishedSections} of ${totalSections}. Processing stopped: ${failure}. The notes below are partial; do not treat them as a complete book summary.\n\n`
    : `> **Coverage:** processed all ${totalSections} readable indexed sections in order. The detailed notes below retain a separate section for each source batch. This confirms coverage of extracted text, not that every printed page was readable or OCR-perfect.\n\n`;
  const resultList = completed.map((part) => part.result);
  const first = resultList[0];
  const last = overview ?? resultList[resultList.length - 1];
  const warnings = [...new Set([
    ...resultList.flatMap((result) => result.warnings ?? []),
    ...(overview?.warnings ?? []),
  ])];
  if (failure) warnings.unshift(`Book summary incomplete: ${finishedSections} of ${totalSections} indexed sections were processed.`);
  else warnings.unshift(`All ${totalSections} readable indexed sections were processed in ${completed.length} sequential source-grounded requests. The overview is synthesized from the section recaps; detailed notes follow.`);
  if (overviewFailure) warnings.push(`All detailed section notes are complete, but the optional whole-book overview could not be generated: ${overviewFailure}`);

  return {
    answer: `${coverage}${overview ? `# ${title}: whole-book overview\n\n${overview.answer.trim()}\n\n---\n\n` : ""}${sections.join("\n\n---\n\n")}`,
    data: null,
    basis: first?.basis ?? "none",
    grounded: !failure && resultList.length > 0 && resultList.every((result) => result.grounded),
    warnings,
    sources,
    provider: last?.provider ?? null,
    model: last?.model ?? null,
  };
}
