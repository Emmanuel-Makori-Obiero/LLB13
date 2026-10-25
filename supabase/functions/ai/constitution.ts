export interface ConstitutionChunkRef {
  document_id: string;
  idx: number;
  content: string;
}

export function isConstitutionQuestion(text: string): boolean {
  return /\bconstitution(?:al)?\b|\barticles?\s*\d{1,3}\b|\barts?\.?\s*\d{1,3}\b|bill of rights|fundamental rights|\bright\b|\brights\b|freedom|libert(?:y|ies)|devolution|sovereignty|national security|defen[cs]e forces|\bKDF\b|\bdeputy president\b|\bpresident\b|parliament|national assembly|\bsenate\b|county government|\bjudiciary\b|state organ|state officer|public finance|citizenship|election|\belectoral\b|\bequality\b|discrimination|fair administrative action|access to information|\bland\b|environment|education|healthcare|\bnational values\b|\b(?:family|children?|housing|water|food|social security|labou?r|privacy|dignity|fair hearing|fair trial|religion|culture|language|assembly|protest|petition|expression|association|media|disabilit\w*|marginalis\w*|youth|public service|integrity|commission|independent office|tax|revenue|budget|procurement|borrowing|debt|county boundary|intergovernmental|appointment|removal|impeachment|term of office|judicial service|remuneration|pension|constitutional amendment|constitutional transition)\b/i.test(text);
}

const ARTICLE_MARKER = /\b(?:articles?|arts?\.?)\s+/gi;
const MAX_ARTICLE_NUMBER = 300;

export function extractArticleNumbers(text: string): number[] {
  const found: number[] = [];
  for (const marker of text.matchAll(ARTICLE_MARKER)) {
    const tail = text.slice(marker.index! + marker[0].length);
    const first = tail.match(/^\s*(\d{1,3})(?:\s*\(\s*\d+\s*\))?/);
    if (!first) continue;

    let cursor = first[0].length;
    let previous = Number(first[1]);
    if (previous >= 1 && previous <= MAX_ARTICLE_NUMBER) found.push(previous);

    while (cursor < tail.length) {
      const separator = tail.slice(cursor).match(/^\s*(,|and\b|or\b|&|to\b|[-–—])\s*/i);
      if (!separator) break;
      cursor += separator[0].length;
      const repeatedMarker = tail.slice(cursor).match(/^articles?\s+/i);
      if (repeatedMarker) cursor += repeatedMarker[0].length;
      const next = tail.slice(cursor).match(/^(\d{1,3})(?:\s*\(\s*\d+\s*\))?/);
      if (!next) break;

      const current = Number(next[1]);
      const isRange = /^(?:to\b|[-–—])$/i.test(separator[1]);
      if (isRange && current >= previous && current <= MAX_ARTICLE_NUMBER) {
        for (let number = previous + 1; number <= current; number += 1) found.push(number);
      } else if (current >= 1 && current <= MAX_ARTICLE_NUMBER) {
        found.push(current);
      }
      previous = current;
      cursor += next[0].length;
    }
  }
  return [...new Set(found)];
}

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
