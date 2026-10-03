export type ExportOptions = {
  eyebrow?: string;
  subtitle?: string;
  sources?: string[];
  footer?: string;
};

type ExportBlock = { kind: "heading" | "subheading" | "paragraph" | "bullet" | "number" | "quote" | "rule"; text: string };

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(value: string) {
  let safe = escapeHtml(value).replace(/\[S(\d+)\]/g, "<sup class=\"citation\">S$1</sup>");
  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
  return safe;
}

function blocks(text: string): ExportBlock[] {
  const result: ExportBlock[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,2}\s+/.test(line)) result.push({ kind: "heading", text: line.replace(/^#{1,2}\s+/, "") });
    else if (/^#{3,6}\s+/.test(line) || /^\*\*[^*].*\*\*$/.test(line)) result.push({ kind: "subheading", text: line.replace(/^#{3,6}\s+/, "").replace(/^\*\*|\*\*$/g, "") });
    else if (/^\s*[-*•]\s+/.test(raw)) result.push({ kind: "bullet", text: raw.replace(/^\s*[-*•]\s+/, "") });
    else if (/^\s*\d+[.)]\s+/.test(raw)) result.push({ kind: "number", text: raw.replace(/^\s*(\d+)[.)]\s+/, "$1. ") });
    else if (/^\s*>/.test(raw)) result.push({ kind: "quote", text: raw.replace(/^\s*>\s?/, "") });
    else if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) result.push({ kind: "rule", text: "" });
    else result.push({ kind: "paragraph", text: line });
  }
  return result;
}

function documentBodyHtml(text: string) {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const block of blocks(text)) {
    if (block.kind === "bullet" || block.kind === "number") {
      const next = block.kind === "bullet" ? "ul" : "ol";
      if (list !== next) { closeList(); list = next; out.push(`<${list}>`); }
      out.push(`<li>${inlineHtml(block.text)}</li>`);
    } else {
      closeList();
      if (block.kind === "heading") out.push(`<h2>${inlineHtml(block.text)}</h2>`);
      else if (block.kind === "subheading") out.push(`<h3>${inlineHtml(block.text)}</h3>`);
      else if (block.kind === "quote") out.push(`<blockquote>${inlineHtml(block.text)}</blockquote>`);
      else if (block.kind === "rule") out.push(`<hr>`);
      else out.push(`<p>${inlineHtml(block.text)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

export function downloadWord(title: string, text: string, filename: string, options: ExportOptions = {}) {
  const sources = options.sources?.length
    ? `<section class="sources"><h3>Sources used</h3><ul>${options.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}</ul></section>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{margin:0.7in}body{font-family:"Aptos","Calibri",Arial,sans-serif;color:#1f2320;background:#fffefa;line-height:1.55;font-size:10.5pt;margin:0}header{background:#163a34;color:#f7f5f0;padding:28px 34px 24px;margin-bottom:24px}header .eyebrow{font-size:8pt;letter-spacing:1.5pt;text-transform:uppercase;color:#f2c3a8;font-weight:bold;margin-bottom:9px}h1{font-family:Georgia,serif;font-size:25pt;font-weight:normal;margin:0 0 7px}header p{margin:0;color:#dce7d9;font-size:10pt}main{padding:0 34px}h2{font-family:Georgia,serif;color:#163a34;font-size:16pt;font-weight:normal;border-bottom:1px solid #dedbd1;padding-bottom:5px;margin:21px 0 9px}h3{color:#8f3e32;font-size:11pt;margin:17px 0 5px}p{margin:0 0 10px}ul,ol{margin:4px 0 12px 24px;padding:0}li{margin:0 0 5px}blockquote{border-left:3px solid #c96e52;background:#fff7ef;margin:12px 0;padding:10px 14px;color:#4e5049}hr{border:0;border-top:1px solid #dedbd1;margin:17px 0}.sources{background:#eef4ed;border:1px solid #dce7d9;padding:12px 15px;margin-top:24px}.sources h3{margin-top:0;color:#163a34}.citation{color:#8f3e32;font-size:8pt}.footer{margin-top:28px;padding-top:8px;border-top:1px solid #dedbd1;color:#77776e;font-size:8.5pt}</style></head><body><header><div class="eyebrow">${escapeHtml(options.eyebrow ?? "Group 13 · Study document")}</div><h1>${escapeHtml(title)}</h1>${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ""}</header><main>${documentBodyHtml(text)}${sources}${options.footer ? `<div class="footer">${escapeHtml(options.footer)}</div>` : ""}</main></body></html>`;
  downloadBlob(new Blob([html], { type: "application/msword" }), filename);
}

function pdfText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7e\n\r\t]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string, max: number) {
  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.55)) cut = max;
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  lines.push(remaining);
  return lines;
}

export function downloadPdf(title: string, text: string, filename: string, options: ExportOptions = {}) {
  const lines: { text: string; kind: ExportBlock["kind"] }[] = [];
  for (const block of blocks(text)) {
    if (block.kind === "rule") { lines.push({ text: "", kind: "rule" }); continue; }
    const prefix = block.kind === "bullet" ? "· " : "";
    for (const line of wrap(prefix + block.text, block.kind === "paragraph" ? 88 : 78)) lines.push({ text: line, kind: block.kind });
  }
  if (options.sources?.length) {
    lines.push({ text: "", kind: "rule" }, { text: "Sources used", kind: "heading" });
    options.sources.forEach((source) => wrap(`· ${source}`, 78).forEach((line) => lines.push({ text: line, kind: "bullet" })));
  }
  const pageLines = 43;
  const pages: typeof lines[] = [];
  for (let i = 0; i < Math.max(1, lines.length); i += pageLines) pages.push(lines.slice(i, i + pageLines));
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"];
  const pageIds: number[] = [];
  pages.forEach((page, pageIndex) => {
    const commands = ["q", "0.969 0.961 0.941 rg", "0 0 612 792 re", "f", "0.086 0.227 0.204 rg", "0 722 612 70 re", "f", "Q", "BT", "/F2 9 Tf", "0.95 0.76 0.65 rg", "50 765 Td", `(${pdfText((options.eyebrow ?? "GROUP 13 · STUDY DOCUMENT").toUpperCase())}) Tj`, "0 -27 Td", "/F3 24 Tf", `(${pdfText(title)}) Tj`, "0 -42 Td", "/F1 10 Tf", "0.12 0.14 0.13 rg"];
    page.forEach((line, index) => {
      if (index > 0) commands.push("T*", "0 0 0 rg");
      if (line.kind === "heading") commands.push("/F3 15 Tf", "0.086 0.227 0.204 rg");
      else if (line.kind === "subheading") commands.push("/F2 11 Tf", "0.56 0.24 0.20 rg");
      else commands.push("/F1 10 Tf", "0.12 0.14 0.13 rg");
      commands.push(`(${pdfText(line.text)}) Tj`);
    });
    commands.push("ET", "BT", "/F1 8 Tf", "0.47 0.47 0.43 rg", "50 28 Td", `(${pdfText(`${options.footer ?? "Prepared in Group 13"}  ·  ${pageIndex + 1}/${pages.length}`)}) Tj`, "ET");
    const stream = commands.join("\n");
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n% Group 13\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = pdf.length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(new Blob([pdf], { type: "application/pdf" }), filename);
}
