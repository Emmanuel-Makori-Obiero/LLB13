export type ExportOptions = {
  eyebrow?: string;
  subtitle?: string;
  sources?: string[];
  footer?: string;
};

type TableRow = string[];
type ExportBlock = { kind: "heading" | "subheading" | "paragraph" | "bullet" | "number" | "quote" | "rule" | "table"; text: string; rows?: TableRow[] };

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

const splitTable = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const isTableSeparator = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());

function blocks(text: string): ExportBlock[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const result: ExportBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rows: TableRow[] = [splitTable(line)];
      i += 2;
      while (i < lines.length && lines[i].trim().includes("|")) { rows.push(splitTable(lines[i])); i += 1; }
      i -= 1;
      result.push({ kind: "table", text: "", rows });
    } else if (/^#{1,2}\s+/.test(line)) result.push({ kind: "heading", text: line.replace(/^#{1,2}\s+/, "") });
    else if (/^#{3,6}\s+/.test(line) || /^\*\*[^*].*\*\*$/.test(line)) result.push({ kind: "subheading", text: line.replace(/^#{3,6}\s+/, "").replace(/^\*\*|\*\*$/g, "") });
    else if (/^\s*[-*•]\s+/.test(raw)) result.push({ kind: "bullet", text: raw.replace(/^\s*[-*•]\s+/, "") });
    else if (/^\s*\d+[.)]\s+/.test(raw)) result.push({ kind: "number", text: raw.replace(/^\s*(\d+)[.)]\s+/, "$1. ") });
    else if (/^\s*>/.test(raw)) result.push({ kind: "quote", text: raw.replace(/^\s*>\s?/, "") });
    else if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) result.push({ kind: "rule", text: "" });
    else result.push({ kind: "paragraph", text: line });
  }
  return result;
}

const escapeXml = (value: string) => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function wordRuns(value: string, color?: string) {
  const parts: string[] = [];
  const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let previous = 0;
  const addRun = (text: string, bold = false, italic = false, monospace = false) => {
    if (!text) return;
    const props = [
      bold ? "<w:b/>" : "",
      italic ? "<w:i/>" : "",
      monospace ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : "",
      color ? `<w:color w:val="${color}"/>` : "",
    ].join("");
    parts.push(`<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`);
  };
  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    addRun(value.slice(previous, index), false, false, false);
    const token = match[0];
    if (token.startsWith("**")) addRun(token.slice(2, -2), true, false, false);
    else if (token.startsWith("*")) addRun(token.slice(1, -1), false, true, false);
    else addRun(token.slice(1, -1), false, false, true);
    previous = index + token.length;
  }
  addRun(value.slice(previous), false, false, false);
  return parts.join("") || "<w:r><w:t></w:t></w:r>";
}

function wordParagraph(text: string, style = "Normal", options: { color?: string; borderBottom?: boolean } = {}) {
  const border = options.borderBottom
    ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="DEDBD1"/></w:pBdr>'
    : "";
  const props = `<w:pPr><w:pStyle w:val="${style}"/>${border}</w:pPr>`;
  return `<w:p>${props}${wordRuns(text, options.color)}</w:p>`;
}

function wordTable(rows: TableRow[]) {
  if (!rows.length) return "";
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const tableWidth = 9360;
  const baseColumnWidth = Math.floor(tableWidth / columnCount);
  const grid = Array.from({ length: columnCount }, (_, index) => `<w:gridCol w:w="${index === columnCount - 1 ? tableWidth - baseColumnWidth * (columnCount - 1) : baseColumnWidth}"/>`).join("");
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="CFD8CC"/>`).join("");
  const body = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, cellIndex) => {
      const width = cellIndex === columnCount - 1 ? tableWidth - baseColumnWidth * (columnCount - 1) : baseColumnWidth;
      const header = rowIndex === 0;
      const shading = header ? '<w:shd w:fill="163A34"/>' : "";
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}</w:tcPr>${wordParagraph(row[cellIndex] ?? "", "Normal", { color: header ? "FFFEFA" : undefined })}</w:tc>`;
    }).join("");
    return `<w:tr>${rowIndex === 0 ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : ""}${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function wordDocumentXml(title: string, text: string, options: ExportOptions) {
  const content: string[] = [
    wordParagraph(options.eyebrow ?? "Group 13 · Study document", "Eyebrow"),
    wordParagraph(title, "Title"),
  ];
  if (options.subtitle) content.push(wordParagraph(options.subtitle, "Subtitle"));
  for (const block of blocks(text)) {
    if (block.kind === "table") content.push(wordTable(block.rows ?? []));
    else if (block.kind === "heading") content.push(wordParagraph(block.text, "Heading1"));
    else if (block.kind === "subheading") content.push(wordParagraph(block.text, "Heading2"));
    else if (block.kind === "bullet") content.push(wordParagraph(`•  ${block.text}`, "ListParagraph"));
    else if (block.kind === "number") content.push(wordParagraph(block.text, "ListParagraph"));
    else if (block.kind === "quote") content.push(wordParagraph(block.text, "Quote"));
    else if (block.kind === "rule") content.push(wordParagraph("", "Normal", { borderBottom: true }));
    else content.push(wordParagraph(block.text));
  }
  if (options.sources?.length) {
    content.push(wordParagraph("Sources used", "Heading2"));
    for (const source of options.sources) content.push(wordParagraph(`•  ${source}`, "ListParagraph"));
  }
  if (options.footer) content.push(wordParagraph(options.footer, "FooterNote"));
  content.push('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1008" w:right="1008" w:bottom="1008" w:left="1008" w:header="480" w:footer="480" w:gutter="0"/></w:sectPr>');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content.join("")}</w:body></w:document>`;
}

const WORD_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="1F2320"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="left"/><w:spacing w:before="40" w:after="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="48"/><w:color w:val="163A34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="320"/></w:pPr><w:rPr><w:sz w:val="22"/><w:color w:val="52665E"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Eyebrow"><w:name w:val="Eyebrow"/><w:pPr><w:spacing w:before="100" w:after="70"/></w:pPr><w:rPr><w:b/><w:sz w:val="16"/><w:color w:val="8F3E32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="420" w:after="160"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="DEDBD1"/></w:pBdr></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="32"/><w:color w:val="163A34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="8F3E32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="80"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420" w:right="240"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C96E52"/></w:pBdr><w:spacing w:before="160" w:after="180"/></w:pPr><w:rPr><w:i/><w:color w:val="4E5049"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="FooterNote"><w:name w:val="Footer Note"/><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="DEDBD1"/></w:pBdr><w:spacing w:before="300"/></w:pPr><w:rPr><w:sz w:val="17"/><w:color w:val="77776E"/></w:rPr></w:style></w:styles>`;

export function normalizeWordFilename(filename: string) {
  const base = filename.replace(/\.docx?$/i, "").trim() || "study-document";
  return `${base}.docx`;
}

export async function buildWordDocument(title: string, text: string, options: ExportOptions = {}): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", wordDocumentXml(title, text, options));
  zip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file("word/styles.xml", WORD_STYLES_XML);
  return await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

export async function downloadWord(title: string, text: string, filename: string, options: ExportOptions = {}) {
  const content = await buildWordDocument(title, text, options);
  downloadBlob(new Blob([content], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), normalizeWordFilename(filename));
}

function pdfText(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "*")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e\n\r\t]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdf(value: string, max: number): string[] {
  const clean = value.replace(/\*\*|__|`/g, "").replace(/\*([^*]+)\*/g, "$1").trim();
  if (!clean) return [""];
  const lines: string[] = [];
  let remaining = clean;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.55)) cut = max;
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  lines.push(remaining);
  return lines;
}

type PdfPage = { commands: string[]; y: number };

export function buildPdfDocument(title: string, text: string, options: ExportOptions = {}): string {
  const pages: PdfPage[] = [];
  const drawText = (page: PdfPage, value: string, x: number, y: number, size: number, font: "F1" | "F2" | "F3", color = "0.12 0.14 0.13") => {
    page.commands.push(`${color} rg`, `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfText(value)}) Tj ET`);
  };
  const addPage = (): PdfPage => {
    const pageIndex = pages.length;
    const page: PdfPage = { commands: [
      "q", "0.969 0.961 0.941 rg", "0 0 612 792 re", "f",
      "0.086 0.227 0.204 rg", "0 705 612 87 re", "f", "Q",
    ], y: 686 };
    drawText(page, (options.eyebrow ?? "GROUP 13 - STUDY DOCUMENT").toUpperCase(), 48, 770, 8, "F2", "0.95 0.76 0.65");
    const titleLines = wrapPdf(title, 58).slice(0, 2);
    titleLines.forEach((line, index) => drawText(page, line, 48, 744 - index * 20, 17, "F3", "1 1 1"));
    if (pageIndex === 0 && options.subtitle) {
      const subtitleLines = wrapPdf(options.subtitle, 104).slice(0, 2);
      subtitleLines.forEach((line, index) => drawText(page, line, 48, page.y - index * 12, 8.5, "F1", "0.34 0.40 0.36"));
      page.y -= subtitleLines.length * 12 + 12;
    }
    pages.push(page);
    return page;
  };
  let page = addPage();
  const ensureSpace = (height: number) => {
    if (page.y - height < 48) page = addPage();
  };
  const drawRule = () => {
    ensureSpace(10);
    page.commands.push("0.82 0.83 0.79 RG 0.6 w", `48 ${page.y.toFixed(2)} m 564 ${page.y.toFixed(2)} l S`);
    page.y -= 12;
  };
  const drawTable = (rows: TableRow[]) => {
    if (!rows.length) return;
    const columnCount = Math.max(1, ...rows.map((row) => row.length));
    const tableX = 48;
    const tableWidth = 516;
    const columnWidth = tableWidth / columnCount;
    const fontSize = columnCount >= 5 ? 7 : 8.5;
    const lineHeight = columnCount >= 5 ? 9.5 : 11;
    const maxChars = Math.max(7, Math.floor((columnWidth - 12) / (fontSize * 0.52)));
    rows.forEach((row, rowIndex) => {
      const cellLines = Array.from({ length: columnCount }, (_, index) => wrapPdf(row[index] ?? "", maxChars));
      const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length));
      const rowHeight = Math.max(24, maxLines * lineHeight + 10);
      ensureSpace(rowHeight);
      const top = page.y;
      const bottom = top - rowHeight;
      row.forEach((_cell, column) => {
        const x = tableX + column * columnWidth;
        if (rowIndex === 0) {
          page.commands.push("0.086 0.227 0.204 rg", `${x.toFixed(2)} ${bottom.toFixed(2)} ${columnWidth.toFixed(2)} ${rowHeight.toFixed(2)} re f`);
        } else if (rowIndex % 2 === 0) {
          page.commands.push("0.925 0.932 0.910 rg", `${x.toFixed(2)} ${bottom.toFixed(2)} ${columnWidth.toFixed(2)} ${rowHeight.toFixed(2)} re f`);
        }
        page.commands.push("0.78 0.82 0.77 RG 0.45 w", `${x.toFixed(2)} ${bottom.toFixed(2)} ${columnWidth.toFixed(2)} ${rowHeight.toFixed(2)} re S`);
        cellLines[column].forEach((line, lineIndex) => drawText(page, line, x + 6, top - 14 - lineIndex * lineHeight, fontSize, rowIndex === 0 ? "F2" : "F1", rowIndex === 0 ? "1 1 1" : "0.12 0.14 0.13"));
      });
      page.y = bottom;
    });
    page.y -= 14;
  };

  for (const block of blocks(text)) {
    if (block.kind === "rule") { drawRule(); continue; }
    if (block.kind === "table") { drawTable(block.rows ?? []); continue; }
    if (block.kind === "heading" || block.kind === "subheading") {
      const size = block.kind === "heading" ? 15 : 11;
      const lineHeight = block.kind === "heading" ? 19 : 15;
      page.y -= block.kind === "heading" ? 9 : 5;
      const lines = wrapPdf(block.text, Math.floor(516 / (size * 0.53)));
      ensureSpace(lines.length * lineHeight + 8);
      lines.forEach((line, index) => drawText(page, line, 48, page.y - index * lineHeight, size, block.kind === "heading" ? "F3" : "F2", block.kind === "heading" ? "0.086 0.227 0.204" : "0.56 0.24 0.20"));
      page.y -= lines.length * lineHeight + 7;
      continue;
    }
    const prefix = block.kind === "bullet" ? "* " : block.kind === "number" ? "  " : block.kind === "quote" ? "  " : "";
    const lines = wrapPdf(`${prefix}${block.text}`, block.kind === "paragraph" ? 96 : 91);
    const lineHeight = block.kind === "quote" ? 14 : 13;
    const topPadding = block.kind === "quote" ? 8 : 0;
    ensureSpace(lines.length * lineHeight + topPadding + 5);
    if (block.kind === "quote") {
      const height = lines.length * lineHeight + 10;
      page.commands.push("0.94 0.94 0.91 rg", `54 ${(page.y - height + 4).toFixed(2)} 506 ${height.toFixed(2)} re f`, "0.78 0.38 0.29 RG 2 w", `54 ${(page.y - height + 4).toFixed(2)} m 54 ${(page.y + 4).toFixed(2)} l S`);
    }
    lines.forEach((line, index) => drawText(page, line, block.kind === "quote" ? 64 : 50, page.y - topPadding - index * lineHeight, 9.5, block.kind === "quote" ? "F3" : "F1", block.kind === "quote" ? "0.30 0.32 0.29" : "0.12 0.14 0.13"));
    page.y -= lines.length * lineHeight + (block.kind === "quote" ? 12 : 7);
  }
  if (options.sources?.length) {
    drawRule();
    const heading = wrapPdf("Sources used", 52);
    ensureSpace(26);
    heading.forEach((line) => drawText(page, line, 48, page.y, 14, "F3", "0.086 0.227 0.204"));
    page.y -= 20;
    for (const source of options.sources) {
      const lines = wrapPdf(`* ${source}`, 91);
      ensureSpace(lines.length * 12 + 5);
      lines.forEach((line, index) => drawText(page, line, 50, page.y - index * 12, 8.5, "F1", "0.12 0.14 0.13"));
      page.y -= lines.length * 12 + 4;
    }
  }

  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"];
  const pageIds: number[] = [];
  pages.forEach((pdfPage, pageIndex) => {
    const footer = wrapPdf(`${options.footer ?? "Prepared in Group 13"}  ·  ${pageIndex + 1}/${pages.length}`, 105)[0];
    drawText(pdfPage, footer, 48, 27, 7.5, "F1", "0.47 0.47 0.43");
    const stream = pdfPage.commands.join("\n");
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n% Group 13\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function downloadPdf(title: string, text: string, filename: string, options: ExportOptions = {}) {
  const content = buildPdfDocument(title, text, options);
  downloadBlob(new Blob([content], { type: "application/pdf" }), filename);
}
