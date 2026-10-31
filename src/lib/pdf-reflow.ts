type PdfTextItem = {
  str?: unknown;
  transform?: number[];
  height?: number;
};

type ReadableLine = { y: number; size: number; text: string };

function appendText(current: string, next: string) {
  if (!current) return next;
  if (current.endsWith("-")) return `${current.slice(0, -1)}${next}`;
  return `${current}${current.endsWith(" ") || next.startsWith(" ") ? "" : " "}${next}`;
}

/** Turn PDF.js text runs into readable, reflowable paragraph strings. */
export function extractReadableParagraphs(items: PdfTextItem[]): string[] {
  const lines: ReadableLine[] = [];
  for (const item of items) {
    const text = String(item.str ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const y = Number(item.transform?.[5] ?? 0);
    const size = Math.max(1, Number(item.height ?? Math.hypot(item.transform?.[2] ?? 0, item.transform?.[3] ?? 0) ?? 12));
    const previous = lines[lines.length - 1];
    if (previous && Math.abs(previous.y - y) <= Math.max(2, size * .3)) {
      previous.text = appendText(previous.text, text);
      previous.size = Math.max(previous.size, size);
    } else {
      lines.push({ y, size, text });
    }
  }

  const paragraphs: string[] = [];
  let paragraph = "";
  let previousLine: ReadableLine | null = null;
  for (const line of lines) {
    if (paragraph && previousLine && Math.abs(previousLine.y - line.y) > Math.max(10, previousLine.size * 2.2)) {
      paragraphs.push(paragraph.trim());
      paragraph = "";
    }
    paragraph = appendText(paragraph, line.text);
    previousLine = line;
  }
  if (paragraph.trim()) paragraphs.push(paragraph.trim());
  return paragraphs;
}
