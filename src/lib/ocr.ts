import { createWorker } from "tesseract.js";

const MAX_OCR_PAGES = 30;

async function recognizeImages(images: (Blob | File)[], label: string): Promise<string> {
  if (!images.length) return "";
  if (images.length > MAX_OCR_PAGES) {
    throw new Error(`${label} has more than ${MAX_OCR_PAGES} pages. Split it into smaller uploads for OCR.`);
  }
  const worker = await createWorker("eng", 1);
  try {
    const pages: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const result = await worker.recognize(images[index]);
      const text = result.data.text.trim();
      if (text) pages.push(`PAGE ${index + 1}\n${text}`);
    }
    return pages.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

export async function ocrImage(file: File): Promise<string> {
  return recognizeImages([file], "The image");
}

export async function ocrPdfPages(
  pdf: { numPages: number; getPage: (pageNumber: number) => Promise<any> },
): Promise<string> {
  const pages: Blob[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare a PDF page for OCR.");
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(`Could not prepare scanned PDF page ${pageNumber} for OCR.`);
    pages.push(blob);
  }
  return recognizeImages(pages, "The PDF");
}
