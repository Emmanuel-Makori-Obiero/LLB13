export type TranscriptCorrection = (currentText: string, pass: 1 | 2) => Promise<string>;

export const MAX_PROOFREAD_CHUNK_CHARS = 8_000;
export const MAX_PROOFREAD_TRANSCRIPT_CHARS = 60_000;

function words(value: string): string[] {
  return (value.normalize("NFKD").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((word) => word.replace(/\p{M}/gu, ""));
}

/** Split at sentence or whitespace boundaries while preserving every source character. */
export function splitTranscriptForProofreading(
  text: string,
  maxChars = MAX_PROOFREAD_CHUNK_CHARS,
): string[] {
  if (!text) return [];
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error("The transcript proofreading segment size must be a positive integer.");
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= maxChars) {
      chunks.push(text.slice(start));
      break;
    }
    const limit = start + maxChars;
    const minimumBoundary = start + Math.floor(maxChars * 0.6);
    const boundaries = [
      { index: text.lastIndexOf("\n", limit), width: 1 },
      { index: text.lastIndexOf(". ", limit), width: 1 },
      { index: text.lastIndexOf("? ", limit), width: 1 },
      { index: text.lastIndexOf("! ", limit), width: 1 },
      { index: text.lastIndexOf(" ", limit), width: 1 },
    ].filter((boundary) => boundary.index >= minimumBoundary);
    const boundary = boundaries.reduce(
      (best, candidate) => candidate.index > best.index ? candidate : best,
      { index: -1, width: 0 },
    );
    const end = boundary.index >= start
      ? boundary.index + boundary.width
      : limit;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Guard against a proofreading model omitting, summarizing, or rewriting the transcript. */
export function isConservativeTranscriptCorrection(original: string, candidate: string): boolean {
  if (!candidate.trim()) return false;
  const before = words(original);
  const after = words(candidate);
  if (!before.length) return candidate.trim() === original.trim();
  if (after.length < before.length * 0.8 || after.length > before.length * 1.2) return false;
  const remaining = new Map<string, number>();
  for (const word of after) remaining.set(word, (remaining.get(word) ?? 0) + 1);
  let retained = 0;
  for (const word of before) {
    const count = remaining.get(word) ?? 0;
    if (count > 0) {
      retained += 1;
      remaining.set(word, count - 1);
    }
  }
  return retained / before.length >= 0.8;
}

function preserveOuterWhitespace(original: string, candidate: string): string {
  const corrected = candidate.trim();
  if (!corrected) return original;
  const leading = /^\s*/u.exec(original)?.[0] ?? "";
  const trailing = /\s*$/u.exec(original)?.[0] ?? "";
  return `${leading}${corrected}${trailing}`;
}

/** Re-check corrected wording twice, retaining source text whenever a pass is unsafe or unavailable. */
export async function proofreadTranscript(
  original: string,
  correct: TranscriptCorrection,
): Promise<{ text: string; passes: number }> {
  if (!original.trim() || original.length > MAX_PROOFREAD_TRANSCRIPT_CHARS) {
    return { text: original, passes: 0 };
  }
  let chunks = splitTranscriptForProofreading(original);
  let passes = 0;
  for (const pass of [1, 2] as const) {
    let acceptedInPass = false;
    for (let index = 0; index < chunks.length; index += 1) {
      const current = chunks[index];
      if (!current.trim()) continue;
      try {
        const candidate = await correct(current, pass);
        if (!isConservativeTranscriptCorrection(current, candidate)) continue;
        chunks[index] = preserveOuterWhitespace(current, candidate);
        acceptedInPass = true;
      } catch {
        // Keep this best-available segment and continue reviewing other segments.
      }
    }
    if (!acceptedInPass) break;
    passes += 1;
  }
  return { text: chunks.join(""), passes };
}
