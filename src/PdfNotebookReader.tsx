import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractReadableParagraphs } from "./lib/pdf-reflow";

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<any>;
};

type Props = {
  sourceUrl: string;
  title: string;
  initialScrollTop?: number;
  onScrollPosition?: (position: number) => void;
  onMouseUp?: () => void;
};

const PAGE_OVERSCAN_PX = 900;
const MAX_PAGE_PIXELS = 4_000_000;

export default function PdfNotebookReader({
  sourceUrl,
  title,
  initialScrollTop = 0,
  onScrollPosition,
  onMouseUp,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [documentProxy, setDocumentProxy] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState("");
  const [phoneReflow, setPhoneReflow] = useState(() => window.matchMedia("(max-width: 720px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setPhoneReflow(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    let active = true;
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
    setDocumentProxy(null);
    setPageCount(0);
    setLoadProgress(0);
    setError("");

    const loadingTask = pdfjs.getDocument({ url: sourceUrl, rangeChunkSize: 65_536 });
    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (active && total > 0) setLoadProgress(Math.min(99, Math.round((loaded / total) * 100)));
    };
    void loadingTask.promise.then((pdf) => {
      if (!active) return;
      setDocumentProxy(pdf);
      setPageCount(pdf.numPages);
      setLoadProgress(100);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "This PDF could not be opened in Notebook view.");
    });

    return () => {
      active = false;
      void loadingTask.destroy().catch(() => undefined);
    };
  }, [sourceUrl]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!documentProxy || !scroller || initialScrollTop <= 0) return;
    requestAnimationFrame(() => {
      if (scrollerRef.current) scrollerRef.current.scrollTop = initialScrollTop;
    });
  }, [documentProxy, initialScrollTop]);

  return (
    <div
      ref={scrollerRef}
      className="pdf-notebook-reader"
      aria-label={`Notebook pages: ${title}`}
      onMouseUp={onMouseUp}
      onScroll={(event) => onScrollPosition?.(event.currentTarget.scrollTop)}
      tabIndex={0}
    >
      {!documentProxy && !error && <div className="pdf-notebook-loading" role="status">
        <Loader2 size={18} className="pdf-reader-spin" />
        <span>{loadProgress > 0 ? `Opening textbook · ${loadProgress}%` : "Opening textbook pages…"}</span>
      </div>}
      {error && <div className="pdf-notebook-error" role="alert">
        <strong>Notebook preview could not open this PDF.</strong>
        <span>{error}</span>
        <a href={sourceUrl} target="_blank" rel="noreferrer">Open the PDF in your browser</a>
      </div>}
      {documentProxy && <div className="pdf-notebook-stack">
        {Array.from({ length: pageCount }, (_, index) => (
          <PdfNotebookPage
            key={`${sourceUrl}:${index + 1}`}
            documentProxy={documentProxy}
            pageNumber={index + 1}
            rootRef={scrollerRef}
            reflow={phoneReflow}
          />
        ))}
      </div>}
    </div>
  );
}

type PageProps = {
  documentProxy: PdfDocument;
  pageNumber: number;
  rootRef: { current: HTMLDivElement | null };
  reflow: boolean;
};

function PdfNotebookPage({ documentProxy, pageNumber, rootRef, reflow }: PageProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(8.5 / 11);
  const [readableParagraphs, setReadableParagraphs] = useState<string[]>([]);
  const [pageReady, setPageReady] = useState(false);
  const [pageError, setPageError] = useState(false);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      root: rootRef.current,
      rootMargin: `${PAGE_OVERSCAN_PX}px 0px`,
      threshold: 0,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const updateWidth = () => setSurfaceWidth(Math.floor(element.clientWidth));
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerContainer = textLayerRef.current;
    if (!nearViewport || !surfaceWidth || !canvas || !textLayerContainer) return;

    let active = true;
    let renderTask: { promise: Promise<unknown>; cancel: () => void } | null = null;
    let textLayer: { render: () => Promise<void>; cancel: () => void } | null = null;
    let pageProxy: any;
    setPageReady(false);
    setPageError(false);
    setReadableParagraphs([]);
    textLayerContainer.replaceChildren();

    void (async () => {
      try {
        pageProxy = await documentProxy.getPage(pageNumber);
        if (!active) return;
        const baseViewport = pageProxy.getViewport({ scale: 1 });
        setAspectRatio(baseViewport.width / baseViewport.height);

        let textContent: any = { items: [] };
        try { textContent = await pageProxy.getTextContent(); } catch { /* The page image remains readable. */ }
        if (!active) return;
        const paragraphs = extractReadableParagraphs(textContent.items ?? []);
        if (reflow && paragraphs.length > 0) {
          setReadableParagraphs(paragraphs);
          setPageReady(true);
          return;
        }

        const cssScale = Math.min(surfaceWidth / baseViewport.width, 1.7);
        const viewport = pageProxy.getViewport({ scale: cssScale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
        const pixelCount = viewport.width * viewport.height * pixelRatio * pixelRatio;
        const outputScale = pixelCount > MAX_PAGE_PIXELS
          ? pixelRatio * Math.sqrt(MAX_PAGE_PIXELS / pixelCount)
          : pixelRatio;

        canvas.width = Math.max(1, Math.ceil(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.ceil(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Your browser could not draw this PDF page.");
        const activeRenderTask = pageProxy.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          background: "#fffdf7",
        });
        renderTask = activeRenderTask;
        await activeRenderTask.promise;
        if (!active) return;

        if (!reflow && (textContent.items?.length ?? 0) > 0) {
          textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
          await textLayer.render();
        }
        if (active) setPageReady(true);
      } catch {
        if (active) {
          setPageError(true);
          setPageReady(true);
        }
      }
    })();

    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
      textLayerContainer.replaceChildren();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas.style.width = "";
        canvas.style.height = "";
      }
      pageProxy?.cleanup?.();
    };
  }, [documentProxy, nearViewport, pageNumber, reflow, surfaceWidth]);

  const showReflow = reflow && readableParagraphs.length > 0;
  return (
    <section
      ref={pageRef}
      className={`pdf-notebook-sheet ${pageError ? "has-error" : ""}`}
      aria-label={`Page ${pageNumber}`}
    >
      <span className="pdf-notebook-page-number">{String(pageNumber).padStart(2, "0")}</span>
      <div className="pdf-notebook-page-surface" ref={surfaceRef} style={{ aspectRatio: showReflow ? "auto" : aspectRatio }}>
        {nearViewport && !pageError && <>
          <canvas ref={canvasRef} className="pdf-notebook-canvas" style={{ display: showReflow ? "none" : undefined }} aria-label={`PDF page ${pageNumber}`} />
          <div ref={textLayerRef} className="pdf-notebook-text-layer textLayer" style={{ display: showReflow ? "none" : undefined }} aria-label={`Selectable text for page ${pageNumber}`} />
        </>}
        {showReflow && <article className="pdf-notebook-reflow" aria-label={`Reflowed text from page ${pageNumber}`}>
          {readableParagraphs.map((paragraph, index) => <p key={`${pageNumber}:${index}`}>{paragraph}</p>)}
        </article>}
        {nearViewport && !pageReady && !pageError && <div className="pdf-notebook-page-loading"><Loader2 size={15} className="pdf-reader-spin" /><span>Preparing page…</span></div>}
        {pageError && <div className="pdf-notebook-page-error">Page {pageNumber} could not be rendered.</div>}
      </div>
    </section>
  );
}
