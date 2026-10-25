export interface ConstitutionChunkRef {
  document_id: string;
  idx: number;
  content: string;
}

export function isConstitutionQuestion(text: string): boolean {
  return /\bconstitution(?:al)?\b|\barticles?\s*\d{1,3}\b|\barts?\.?\s*\d{1,3}\b|bill of rights|fundamental rights|\bright\b|\brights\b|freedom|libert(?:y|ies)|devolution|sovereignty|national security|defen[cs]e forces|\bKDF\b|\bdeputy president\b|\bpresident\b|parliament|national assembly|\bsenate\b|county government|\bjudiciary\b|state organ|state officer|public finance|citizenship|election|\belectoral\b|\bequality\b|discrimination|fair administrative action|access to information|\bland\b|environment|education|healthcare|\bnational values\b|\b(?:family|children?|housing|water|food|social security|labou?r|privacy|dignity|fair hearing|fair trial|religion|culture|language|assembly|protest|petition|expression|association|media|disabilit\w*|marginalis\w*|youth|public service|integrity|commission|independent office|tax|revenue|budget|procurement|borrowing|debt|county boundary|intergovernmental|appointment|removal|impeachment|term of office|judicial service|remuneration|pension|constitutional amendment|constitutional transition)\b/i.test(text);
}

import {
  extractArticleNumbers,
  MAX_CONSTITUTION_ARTICLE,
  MAX_CONSTITUTION_ARTICLES_PER_BATCH,
} from "../../../src/lib/constitutionArticles.ts";
export { extractArticleNumbers, MAX_CONSTITUTION_ARTICLE, MAX_CONSTITUTION_ARTICLES_PER_BATCH };

const MAX_ARTICLE_NUMBER = MAX_CONSTITUTION_ARTICLE;

function looksLikeContentsEntry(textAfterNumber: string): boolean {
  const preview = textAfterNumber.slice(0, 240);
  return /\.{4,}\s*\d{1,3}\b/.test(preview);
}

export function findArticleChunkIndexes(
  chunks: ConstitutionChunkRef[],
  articleNumbers: number[],
): Map<number, { document_id: string; idx: number }> {
  const ordered = [...chunks].sort((a, b) => a.document_id.localeCompare(b.document_id) || a.idx - b.idx);
  const found = new Map<number, { document_id: string; idx: number }>();

  for (const number of [...new Set(articleNumbers)]) {
    if (!Number.isInteger(number) || number < 1 || number > MAX_ARTICLE_NUMBER) continue;
    const heading = new RegExp(`(?:^|[^\\d])${number}\\.(?!\\d)\\s+`, "g");
    for (const chunk of ordered) {
      let match: RegExpExecArray | null;
      heading.lastIndex = 0;
      while ((match = heading.exec(chunk.content))) {
        const afterNumber = chunk.content.slice(match.index + match[0].length);
        if (!/[A-Za-z]/.test(afterNumber.slice(0, 240))) continue;
        if (looksLikeContentsEntry(afterNumber)) continue;
        found.set(number, { document_id: chunk.document_id, idx: chunk.idx });
        break;
      }
      if (found.has(number)) break;
    }
  }
  return found;
}

export function findArticleChunkRanges(
  chunks: ConstitutionChunkRef[],
  articleNumbers: number[],
): Map<number, { document_id: string; start_idx: number; end_idx: number }> {
  const ordered = [...chunks].sort((a, b) => a.document_id.localeCompare(b.document_id) || a.idx - b.idx);
  const allStarts = findArticleChunkIndexes(ordered, Array.from({ length: MAX_ARTICLE_NUMBER }, (_, index) => index + 1));
  const starts = [...allStarts.entries()]
    .map(([number, location]) => ({ number, ...location }))
    .sort((a, b) => a.document_id.localeCompare(b.document_id) || a.idx - b.idx || a.number - b.number);
  const lastIndexByDocument = new Map<string, number>();
  for (const chunk of ordered) {
    lastIndexByDocument.set(chunk.document_id, Math.max(lastIndexByDocument.get(chunk.document_id) ?? chunk.idx, chunk.idx));
  }

  const ranges = new Map<number, { document_id: string; start_idx: number; end_idx: number }>();
  for (const number of [...new Set(articleNumbers)]) {
    const location = allStarts.get(number);
    if (!location) continue;
    const next = starts.find((start) => start.document_id === location.document_id &&
      (start.idx > location.idx || (start.idx === location.idx && start.number > number)));
    const firstSchedule = number === MAX_ARTICLE_NUMBER
      ? ordered.find((chunk) => chunk.document_id === location.document_id && chunk.idx > location.idx &&
        /(?:^|\n)\s*(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth)\s+schedule|schedule\s+(?:[ivxlcdm]+|\d+))\b/i.test(chunk.content))
      : undefined;
    const scheduleEnd = firstSchedule ? Math.max(location.idx, firstSchedule.idx - 1) : undefined;
    ranges.set(number, {
      document_id: location.document_id,
      start_idx: location.idx,
      end_idx: next?.idx ?? scheduleEnd ?? lastIndexByDocument.get(location.document_id) ?? location.idx,
    });
  }
  return ranges;
}
