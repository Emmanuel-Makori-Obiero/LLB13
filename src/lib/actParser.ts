export type ActSection = { number: number; title: string; text: string };
export type ActSchedule = { number: string; title: string; text: string };

type PositionedTextItem = { str?: unknown; transform?: readonly number[] };

/** Reconstruct PDF line breaks from PDF.js text-item baselines instead of flattening the page. */
export function pdfItemsToPageText(items: readonly unknown[]): string {
  const output: string[] = [];
  let previousY: number | undefined;

  for (const value of items) {
    if (!value || typeof value !== "object") continue;
    const item = value as PositionedTextItem;
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    const y = item.transform?.[5];
    if (output.length) {
      output.push(typeof y === "number" && typeof previousY === "number" && Math.abs(y - previousY) > 2 ? "\n" : " ");
    }
    output.push(item.str.trim());
    previousY = y;
  }

  return output.join("").replace(/[ \t]+\n/g, "\n").trim();
}

function isContentsEntry(line: string): boolean {
  return /\.(?:\s*\.){2,}\s*\d+\s*$/.test(line);
}

function sectionHeading(line: string): { number: number; title: string } | null {
  const match = line.match(/^\s*(\d{1,3})\.\s+(.+?)\s*$/);
  return match ? { number: Number(match[1]), title: match[2].trim() } : null;
}

export function parseUploadedAct(raw: string, filename: string) {
  const text = raw.replace(/\r/g, "").replace(/\f/g, "\n").replace(/\n{3,}/g, "\n\n");
  const title = (text.match(/\bTHE\s+([A-Z][A-Z\s]+ACT)\b/i)?.[1] || filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")).trim();
  const lines = text.split("\n").map((line) => line.replace(/[\t ]+/g, " ").trim());
  const firstSectionIndex = lines.findIndex((line) => sectionHeading(line)?.number === 1 && !isContentsEntry(line));
  const scheduleIndex = firstSectionIndex < 0 ? -1 : lines.findIndex((line, index) => index > firstSectionIndex && /^SCHEDULES?\b/i.test(line) && !isContentsEntry(line));
  const operativeEnd = scheduleIndex >= 0 ? scheduleIndex : lines.length;
  const markers = lines
    .map((line, index) => ({ line, index, heading: sectionHeading(line) }))
    .filter(({ index, heading, line }) => firstSectionIndex >= 0 && index >= firstSectionIndex && index < operativeEnd && heading && !isContentsEntry(line));
  const sections = markers.map(({ heading, index }, markerIndex) => ({
    number: heading!.number,
    title: heading!.title,
    text: lines.slice(index + 1, markers[markerIndex + 1]?.index ?? operativeEnd).join("\n").trim(),
  }));
  const scheduleText = scheduleIndex >= 0 ? lines.slice(scheduleIndex + 1).join("\n").trim() : "";
  const assentDate = text.match(/Date of assent:\s*([^\]\n]+)/i)?.[1]?.trim() || "";
  const commencementDate = text.match(/Date of commencement:\s*([^\]\n]+)/i)?.[1]?.trim() || "";
  const chapterNumber = text.match(/CHAPTER\s+([\w-]+)/i)?.[1];

  return {
    title: title || "Uploaded Act",
    shortTitle: title || "Uploaded Act",
    chapter: chapterNumber ? `Chapter ${chapterNumber}` : "",
    edition: text.match(/Revised Edition[^\n]*/i)?.[0]?.trim() || "Uploaded edition",
    source: `Uploaded by administrator · ${filename}`,
    sourceUrl: "",
    assentDate,
    commencementDate,
    preamble: text.match(/An Act of Parliament to[\s\S]{0,800}?\.(?=\n\s*\[Act|\n\s*\d+\.)/i)?.[0]?.trim() || "",
    sections,
    schedules: scheduleText ? [{ number: "Schedule", title: "Schedule", text: scheduleText } as ActSchedule] : [],
  };
}
