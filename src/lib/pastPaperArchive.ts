import { Archive } from "libarchive.js";

export type PastPaperEntry = {
  file: File;
  archivePath: string;
  title: string;
  courseCode: string;
  examYear?: number;
  examSession: string;
  semester: string;
  paperVariant: string;
  confidence: number;
};

const SUPPORTED = /\.(pdf|docx?|txt|md)$/i;
const COURSE_CODE = /\b([A-Z]{2,5}\s?-?\d{3,4})\b/i;
const YEAR = /\b(20\d{2})\b/;
const SESSION = /\b(JAN\s*(?:-|–|TO)\s*APRIL|MAY\s*(?:-|–|TO)\s*AUGUST|SEPT\s*(?:-|–|TO)\s*DEC(?:EMBER)?)\b/i;

function clean(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferMetadata(archivePath: string, filename: string) {
  const source = `${archivePath} ${filename}`;
  const courseCode = COURSE_CODE.exec(source)?.[1]?.replace(/\s+/g, " ").toUpperCase() ?? "Unclassified";
  const examYear = Number(YEAR.exec(source)?.[1]);
  const sessionMatch = SESSION.exec(source);
  const examSession = sessionMatch?.[1]
    ? clean(sessionMatch[1]).replace(/\s*(?:-|–|TO)\s*/i, " - ").toUpperCase()
    : "Unspecified session";
  const semester = clean(archivePath.split("/").find((part) => SESSION.test(part)) ?? "Past paper archive");
  const normalizedFilename = filename.replace(/\.[^.]+$/, "");
  const variant = /\b(emergency|evening|morning|supplementary|supp|special|resit|retake)\b/i.exec(normalizedFilename)?.[1];
  const paperVariant = variant ? variant[0].toUpperCase() + variant.slice(1).toLowerCase() : "Regular";
  const baseTitle = clean(normalizedFilename).replace(/\b(emergency|evening|morning|supplementary|supp|special|resit|retake)\b/i, "");
  const title = `${baseTitle || courseCode} · ${examSession}${Number.isFinite(examYear) ? ` ${examYear}` : ""}${paperVariant !== "Regular" ? ` · ${paperVariant}` : ""}`;
  const confidence = (courseCode !== "Unclassified" ? 0.45 : 0) + (Number.isFinite(examYear) ? 0.25 : 0) + (sessionMatch ? 0.2 : 0) + (variant ? 0.1 : 0);
  return { title, courseCode, examYear: Number.isFinite(examYear) ? examYear : undefined, examSession, semester, paperVariant, confidence: Math.min(1, confidence) };
}

function mimeFor(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "doc") return "application/msword";
  if (extension === "md") return "text/markdown";
  return "text/plain";
}

export async function extractPastPaperArchive(archiveFile: File): Promise<PastPaperEntry[]> {
  Archive.init();
  const archive = await Archive.open(archiveFile);
  try {
    const entries = await archive.getFilesArray();
    const extracted: PastPaperEntry[] = [];
    for (const entry of entries) {
      const compressed = entry?.file as { name?: string; extract?: () => Promise<File> } | undefined;
      const name = compressed?.name ?? "";
      const archivePath = `${entry?.path ?? ""}${name}`;
      if (!compressed?.extract || !SUPPORTED.test(archivePath)) continue;
      try {
        const original = await compressed.extract();
        const file = new File([original], name, { type: mimeFor(name), lastModified: original.lastModified });
        extracted.push({ file, archivePath, ...inferMetadata(archivePath, name) });
      } catch {
        // Keep importing the rest of the archive; the UI reports the number of readable entries.
      }
    }
    return extracted;
  } finally {
    await archive.close();
  }
}
