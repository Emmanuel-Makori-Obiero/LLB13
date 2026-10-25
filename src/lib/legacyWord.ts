const decodeHtmlEntities = (value: string) => value
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash|bull|copy);/gi, (entity) => {
    const entities: Record<string, string> = {
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
      "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“", "&ndash;": "–", "&mdash;": "—", "&bull;": "•", "&copy;": "©",
    };
    return entities[entity.toLowerCase()] ?? entity;
  })
  .replace(/&#(\d+);/g, (_entity, value: string) => {
    const codePoint = Number(value);
    return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : " ";
  })
  .replace(/&#x([\da-f]+);/gi, (_entity, value: string) => {
    const codePoint = Number.parseInt(value, 16);
    return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : " ";
  });

/**
 * The platform’s old “Word” download was HTML with a .doc extension. Detect
 * that exact family of files and turn its document structure into readable text.
 * Returns null for real binary .doc files, which are not browser-readable.
 */
export function extractLegacyWordHtml(html: string): string | null {
  const prefix = html.replace(/^\uFEFF/, "").trimStart().slice(0, 2048);
  if (!/^<!doctype\s+html\b|^<html\b/i.test(prefix)) return null;

  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<br\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<hr\b[^>]*\/?\s*>/gi, "\n---\n")
    .replace(/<h([1-6])\b[^>]*>/gi, (_tag, level: string) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<tr\b[^>]*>/gi, "\n| ")
    .replace(/<\/tr\s*>/gi, " |\n")
    .replace(/<\/?t[dh]\b[^>]*>/gi, (tag) => /^<\//.test(tag) ? " | " : "")
    .replace(/<blockquote\b[^>]*>/gi, "\n> ")
    .replace(/<\/blockquote\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<\/?(?:p|header|main|section|div|ul|ol|table|thead|tbody|body|html)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");

  const decoded = decodeHtmlEntities(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  const lines = decoded.split(/\r?\n/).map((line) =>
    line.replace(/[\t ]+/g, " ").replace(/\s*\|\s*/g, " | ").trim(),
  );
  const normalized = lines.join("\n").replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, "\n\n").trim();
  return normalized.length >= 20 ? normalized : null;
}
