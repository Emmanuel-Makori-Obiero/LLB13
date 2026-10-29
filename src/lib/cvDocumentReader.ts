import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as mammoth from "mammoth";

const MAX_CV_BYTES = 10 * 1024 * 1024;
const MAX_CV_TEXT_CHARS = 60_000;
const MAX_PDF_PAGES = 40;

export async function readCvText(file: File): Promise<string> {
  if (!file.size) throw new Error("The selected CV is empty.");
  if (file.size > MAX_CV_BYTES) throw new Error("Please choose a CV smaller than 10 MB.");

  const name = file.name.toLowerCase();
  let text = "";

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    text = pages.join("\n\n");
    if (pdf.numPages > MAX_PDF_PAGES) text += "\n\n[Only the first 40 pages were read.]";
    if (text.trim().length < 40) {
      throw new Error("This PDF has little or no selectable text. Save a searchable PDF or upload a DOCX or TXT CV; this matcher does not run OCR or send the file to a server.");
    }
  } else if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    try {
      text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    } catch {
      throw new Error("This Word file could not be read. Save it as a current .docx file and try again.");
    }
  } else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    text = await file.text();
  } else {
    throw new Error("Upload a searchable PDF, DOCX, or TXT CV.");
  }

  const cleaned = text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").trim();
  if (cleaned.length < 30) throw new Error("The CV did not contain enough readable text to match. Add text or upload a searchable copy.");
  return cleaned.slice(0, MAX_CV_TEXT_CHARS);
}
