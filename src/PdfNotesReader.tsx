import { useEffect, useRef, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type OcrWord = { text: string; left: number; top: number; width: number; height: number };
type PdfPage = { number: number; imageUrl: string; width: number; height: number; words: OcrWord[]; status: "waiting" | "reading" | "ready" | "failed" };
type Props = { sourceUrl: string; title: string; height: number; onMouseUp: () => void };

const OCR_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), milliseconds)),
  ]);
}

export default function PdfNotesReader({ sourceUrl, title, height, onMouseUp }: Props) {
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [status, setStatus] = useState("Opening the scanned notes…");
  const [error, setError] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const workerRef = useRef<Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    let active = true;
    const runId = ++runRef.current;
    const objectUrls: string[] = [];
    setPages([]);
    setError("");
    setOcrProgress(0);
    setStatus("Opening the scanned notes…");

    void (async () => {
      try {
        const response = await withTimeout(fetch(sourceUrl), 30_000, "The notes took too long to download. Use Open source to check the file link.");
        if (!response.ok) throw new Error(`Could not load the PDF (${response.status}).`);
        const bytes = await response.arrayBuffer();
        if (!active || runRef.current !== runId) return;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
        const pdf = await withTimeout<any>(pdfjs.getDocument({ data: bytes }).promise, 30_000, "The PDF could not be opened in time.");
        const initial: PdfPage[] = Array.from({ length: pdf.numPages }, (_, index) => ({ number: index + 1, imageUrl: "", width: 0, height: 0, words: [], status: "waiting" }));
        let renderedPages = initial;
        setPages(initial);
        setStatus(`Rendering ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} as images…`);

        for (let index = 0; index < pdf.numPages; index += 1) {
          if (!active || runRef.current !== runId) return;
          const page = await pdf.getPage(index + 1);
          const viewport = page.getViewport({ scale: 1.55 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await withTimeout(page.render({ canvas, canvasContext: canvas.getContext("2d", { alpha: false })!, viewport }).promise, 45_000, `Page ${index + 1} took too long to render.`);
          const imageUrl = canvas.toDataURL("image/jpeg", 0.88);
          objectUrls.push(imageUrl);
          renderedPages = renderedPages.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl, width: canvas.width, height: canvas.height, status: "reading" } : item);
          setPages(renderedPages);
        }

        setStatus("Starting local OCR. You can already view the page images below…");
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
          logger: (message) => {
            if (!active || runRef.current !== runId) return;
            if (typeof message.progress === "number") setOcrProgress(Math.round(((message.progress * 100) / Math.max(pdf.numPages, 1))));
            if (message.status) setStatus(`Reading scanned notes · ${message.status.replace(/_/g, " ")}…`);
          },
        });
        workerRef.current = worker;

        for (let index = 0; index < pdf.numPages; index += 1) {
          if (!active || runRef.current !== runId) return;
          const current = renderedPages[index];
          const page = await withTimeout(worker.recognize(current.imageUrl), OCR_TIMEOUT_MS, `OCR timed out on page ${index + 1}. The image is still available below.`);
          const words = ((page.data as { words?: Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }> }).words ?? [])
            .filter((word) => word.text?.trim() && word.bbox)
            .map((word) => ({ text: word.text!.trim(), left: word.bbox!.x0, top: word.bbox!.y0, width: Math.max(2, word.bbox!.x1 - word.bbox!.x0), height: Math.max(8, word.bbox!.y1 - word.bbox!.y0) }));
          renderedPages = renderedPages.map((item, itemIndex) => itemIndex === index ? { ...item, words, status: "ready" } : item);
          setPages(renderedPages);
          setOcrProgress(Math.round(((index + 1) / Math.max(pdf.numPages, 1)) * 100));
          setStatus(`Scanned text ready on page ${index + 1} of ${pdf.numPages}.`);
        }
      } catch (cause) {
        if (active && runRef.current === runId) {
          setError(cause instanceof Error ? cause.message : "The PDF could not be read.");
          setStatus("The page images are still available if rendering completed.");
        }
      } finally {
        const worker = workerRef.current;
        workerRef.current = null;
        if (worker) await worker.terminate().catch(() => undefined);
      }
    })();

    return () => {
      active = false;
      runRef.current += 1;
      const worker = workerRef.current;
      workerRef.current = null;
      if (worker) void worker.terminate().catch(() => undefined);
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [sourceUrl]);

  return (
    <div className="pdf-notes-reader" style={{ height }} onMouseUp={onMouseUp} aria-label={`Scanned notes: ${title}`}>
      <div className="pdf-notes-status">
        <span>{ocrProgress > 0 ? `${ocrProgress}%` : <Loader2 size={14} className="pdf-reader-spin" />}</span>
        <span>{status}</span>
      </div>
      {error && <div className="pdf-notes-error">{error} You can still read the scanned page images and use Open source to download the original.</div>}
      {pages.length === 0 && !error && <div className="pdf-notes-empty"><ScanLine size={18} /> Preparing the page image…</div>}
      <div className="pdf-notes-pages">
        {pages.map((page) => (
          <section className="pdf-notes-page" key={page.number} aria-label={`Page ${page.number}`}>
            <div className="pdf-notes-page-label">Page {page.number} · {page.status === "ready" ? "selectable text ready" : page.status === "reading" ? "reading…" : "image"}</div>
            <div className="pdf-notes-canvas" style={{ aspectRatio: `${page.width || 1} / ${page.height || 1}` }}>
              {page.imageUrl && <img src={page.imageUrl} alt={`Scanned notes page ${page.number}`} />}
              {page.words.length > 0 && <div className="pdf-notes-text-layer" aria-label={`Selectable OCR text for page ${page.number}`}>
                {page.words.map((word, index) => <span key={`${page.number}-${index}`} style={{ left: `${(word.left / page.width) * 100}%`, top: `${(word.top / page.height) * 100}%`, width: `${(word.width / page.width) * 100}%`, height: `${(word.height / page.height) * 100}%`, fontSize: `${Math.max(8, (word.height / page.height) * 100 * 1.05)}%` }}>{word.text}</span>)}
              </div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
