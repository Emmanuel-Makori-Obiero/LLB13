const ARTICLE_MARKER = /\b(?:articles?|arts?\.?)\s+/gi;
export const MAX_CONSTITUTION_ARTICLE = 264;
export const MAX_CONSTITUTION_ARTICLES_PER_BATCH = 12;

export function extractArticleNumbers(text: string): number[] {
  const found: number[] = [];
  for (const marker of text.matchAll(ARTICLE_MARKER)) {
    const tail = text.slice(marker.index! + marker[0].length);
    const first = tail.match(/^\s*(\d{1,3})(?:\s*\(\s*\d+\s*\))?/);
    if (!first) continue;

    let cursor = first[0].length;
    let previous = Number(first[1]);
    if (previous >= 1 && previous <= MAX_CONSTITUTION_ARTICLE) found.push(previous);

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
      if (isRange && current >= previous && current <= MAX_CONSTITUTION_ARTICLE) {
        for (let number = previous + 1; number <= current; number += 1) found.push(number);
      } else if (current >= 1 && current <= MAX_CONSTITUTION_ARTICLE) {
        found.push(current);
      }
      previous = current;
      cursor += next[0].length;
    }
  }
  return [...new Set(found)];
}

export function splitArticleNumbers(
  articleNumbers: number[],
  batchSize = MAX_CONSTITUTION_ARTICLES_PER_BATCH,
): number[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Article batch size must be a positive integer.");
  }
  const normalized = [...new Set(articleNumbers.filter((number) =>
    Number.isInteger(number) && number >= 1 && number <= MAX_CONSTITUTION_ARTICLE
  ))];
  const batches: number[][] = [];
  for (let start = 0; start < normalized.length; start += batchSize) {
    batches.push(normalized.slice(start, start + batchSize));
  }
  return batches;
}
