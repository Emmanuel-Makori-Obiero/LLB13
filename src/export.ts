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

export function downloadWord(title: string, text: string, filename: string) {
  const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = text
    .split(/\r?\n/)
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"))
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
  downloadBlob(new Blob([html], { type: "application/msword" }), filename);
}

function pdfText(value: string) {
  // Core PDF fonts use WinAnsi. Keep the export readable if a note contains
  // characters outside that built-in character set.
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e\n\r\t]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function downloadPdf(title: string, text: string, filename: string) {
  const maxChars = 92;
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(" ", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    lines.push(remaining);
  }

  const pageSize = 48;
  const pages: string[][] = [];
  const allLines = [`${title}`, "", ...lines];
  for (let i = 0; i < allLines.length; i += pageSize) {
    pages.push(allLines.slice(i, i + pageSize));
  }
  if (!pages.length) pages.push([title]);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageIds: number[] = [];
  for (const page of pages) {
    const commands = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL"];
    page.forEach((line, index) => {
      if (index > 0) commands.push("T*");
      commands.push(`(${pdfText(line)}) Tj`);
    });
    commands.push("ET");
    const stream = commands.join("\n");
    const contentId = objects.length + 1;
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n% Group 13\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++)
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(new Blob([pdf], { type: "application/pdf" }), filename);
}
