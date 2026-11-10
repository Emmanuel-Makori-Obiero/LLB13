export type CaseResult = {
  title: string;
  url: string;
  citation: string | null;
};

export function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;|&#47;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function officialLawUrl(value: string): string | null {
  try {
    const url = new URL(value.replace(/&amp;/gi, "&"), "https://new.kenyalaw.org");
    const candidate = url.searchParams.get("q") || url.searchParams.get("url") || url.searchParams.get("uddg") || url.href;
    const clean = new URL(candidate, url.origin);
    if (clean.protocol !== "https:" && clean.protocol !== "http:") return null;
    const host = clean.hostname.toLowerCase();
    const supported = host === "new.kenyalaw.org" || host === "kenyalaw.org"
      || host === "www.bailii.org" || host === "bailii.org"
      || host === "www.supremecourt.uk" || host === "supremecourt.uk"
      || host === "www.judiciary.uk" || host === "judiciary.uk"
      || host === "caselaw.nationalarchives.gov.uk";
    if (!supported) return null;
    if (host.includes("kenyalaw.org") && !/\/akn\/ke\/judgment\//.test(clean.pathname)) return null;
    if (host.includes("bailii.org") && !/\/(uk|ie|ewca|ewhc|sc|ukhl|uksc)\//i.test(clean.pathname)) return null;
    clean.protocol = "https:";
    return clean.toString();
  } catch {
    return null;
  }
}

export function parseResults(html: string): CaseResult[] {
  const results: CaseResult[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const url = officialLawUrl(match[1]);
    if (!url || seen.has(url)) continue;
    const title = decodeHtml(match[2]);
    if (title.length < 8 || /cached|similar|translate/i.test(title)) continue;
    seen.add(url);
    const citationMatch = title.match(/(\[\d{4}\]\s+[A-Z]+\s+\d+\s+\(KLR\)|\b[A-Z]{2,8}\s+\d+\/\d{4}\b)/i);
    results.push({ title: title.slice(0, 240), url, citation: citationMatch?.[1] ?? null });
    if (results.length === 10) break;
  }
  return results;
}
