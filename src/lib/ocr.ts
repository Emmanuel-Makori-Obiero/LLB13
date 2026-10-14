import { createWorker } from "tesseract.js";
export type OcrQuality = { text: string; confidence: number; usable: boolean };

/** Remove OCR noise, but never replace uncertain text with guessed words. */
export function cleanOcrText(raw: string, confidence = 0): OcrQuality {
  const lines = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (!line || /^(.)\1{4,}$/.test(line)) return false;
      const compact = line.replace(/\s/g, "");
      if (compact.length < 2) return false;
      const useful = (compact.match(/[\p{L}\p{N}]/gu) ?? []).length;
      return useful / compact.length >= 0.45;
    });
  const text = lines.join("\n").trim();
  const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const usefulChars = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const usable = confidence >= 30 && usefulChars >= 18 && words.length >= 3;
  return { text: usable ? text : "", confidence: Math.round(confidence), usable };
}

export async function ocrImage(file: File): Promise<string> {
  const worker = await createWorker("eng", 1);
  try {
    const result = await worker.recognize(file);
    return cleanOcrText(result.data.text, Number(result.data.confidence ?? 0)).text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Render and recognize each PDF page before moving on. Keeping all rendered
 * pages in memory at once made long scanned books (often hundreds of pages)
 * exhaust browser memory before OCR could start.
 */
export async function ocrPdfPages(
  pdf: { numPages: number; getPage: (pageNumber: number) => Promise<any> },
  onProgress?: (completed: number, total: number) => void,
): Promise<string> {
  if (!pdf.numPages) return "";
  const worker = await createWorker("eng", 1);
  const output: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Your browser could not prepare a PDF page for OCR.");
      try {
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error(`Could not prepare scanned PDF page ${pageNumber} for OCR.`);
        const result = await worker.recognize(blob);
        const text = cleanOcrText(result.data.text, Number(result.data.confidence ?? 0)).text;
        if (text) output.push(`PAGE ${pageNumber}\n${text}`);
      } finally {
        // Explicitly release the potentially large backing store after each page.
        canvas.width = 0;
        canvas.height = 0;
      }
      onProgress?.(pageNumber, pdf.numPages);
    }
    return output.join("\n\n");
  } finally {
    await worker.terminate();
  }
}
