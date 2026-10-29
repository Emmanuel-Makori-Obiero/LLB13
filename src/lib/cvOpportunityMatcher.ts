import type { CareerFeedItem } from "./careerFeed";

export type CVProfile = {
  keywords: string[];
  certificates: string[];
  completedDegrees: string[];
  inProgressDegrees: string[];
};

export type QualificationFit = "certificate-mentioned" | "certificate-not-found" | "degree-required" | "degree-mentioned" | "degree-in-cv" | "not-stated";

export type CVOpportunityMatch = {
  item: CareerFeedItem;
  score: number;
  matchedTerms: string[];
  qualificationFit: QualificationFit;
  qualificationNote: string;
};

const STOP_WORDS = new Set([
  "about", "above", "after", "also", "among", "and", "are", "been", "being", "below", "between", "both", "but", "can", "could", "during", "each", "from", "have", "into", "its", "more", "most", "must", "other", "our", "over", "same", "should", "some", "such", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "upon", "very", "was", "were", "what", "when", "where", "which", "while", "will", "with", "within", "would", "your", "you", "the", "for", "are", "you", "not", "from", "have", "has", "had", "who", "how", "why", "where", "any", "all", "one", "two", "per", "via", "etc",
]);

const CREDENTIAL_WORDS = new Set([
  "academic", "bachelor", "bachelors", "certificate", "certificates", "certification", "certifications", "certified", "college", "degree", "degrees", "diploma", "diplomas", "doctorate", "education", "graduate", "graduates", "llb", "llm", "master", "masters", "phd", "qualification", "qualifications", "university",
]);

const CERTIFICATE_PATTERN = /\b(?:certificates?|certifications?|certified)\b/i;
const DEGREE_PATTERN = /\b(?:bachelor(?:'s)?|b\.?a\.?|b\.?sc\.?|b\.?com\.?|ll\.?b\.?|ll\.?m\.?|master(?:'s)?|m\.?sc\.?|ph\.?d\.?|doctorate|university degree|degree)\b/i;
const IN_PROGRESS_PATTERN = /\b(?:currently (?:studying|pursuing|enrolled)|pursu(?:e|ing)|candidate|student|expected(?:\s+(?:to\s+)?(?:graduate|complete)|\s+20\d{2})?|in progress|ongoing|enrolled)\b/i;

function tokenSet(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [])
    .map((token) => token.replace(/^[.+#-]+|[.+#-]+$/g, ""))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !CREDENTIAL_WORDS.has(token) && !/^\d+$/.test(token)));
}

function credentialLines(text: string, pattern: RegExp): string[] {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+|[•;|]+|(?<=[.!?])\s+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && pattern.test(line));
  return [...new Set(lines.map((line) => line.slice(0, 160)))].slice(0, 8);
}

export function buildCVProfile(text: string): CVProfile {
  const normalized = text.trim();
  if (normalized.length < 30) throw new Error("The CV text is too short to build a useful match profile.");

  const frequencies = new Map<string, number>();
  for (const word of normalized.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) {
    const token = word.replace(/^[.+#-]+|[.+#-]+$/g, "");
    if (token.length < 3 || STOP_WORDS.has(token) || CREDENTIAL_WORDS.has(token) || /^\d+$/.test(token)) continue;
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  const keywords = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 80)
    .map(([word]) => word);

  const educationLines = credentialLines(normalized, DEGREE_PATTERN);
  const inProgressDegrees = educationLines.filter((line) => IN_PROGRESS_PATTERN.test(line));
  const completedDegrees = educationLines.filter((line) => !IN_PROGRESS_PATTERN.test(line));

  return {
    keywords,
    certificates: credentialLines(normalized, CERTIFICATE_PATTERN),
    completedDegrees,
    inProgressDegrees,
  };
}

export function opportunityKind(item: CareerFeedItem): string {
  const text = `${item.title} ${item.categories.join(" ")}`.toLowerCase();
  if (/\b(apprentice(?:ship)?s?)\b/.test(text)) return "Apprenticeships";
  if (/\b(pupillage|pupilage|judicial attachment|law clerkship|legal clinic)\b/.test(text)) return "Pupillage / legal attachment";
  if (/\b(internships?|attachments?|placements?|traineeships?|graduate trainee|clerkships?)\b/.test(text)) return "Internships / attachments";
  if (/\b(scholarships?|bursaries|bursary|student funding)\b/.test(text)) return "Scholarships / bursaries";
  if (/\b(fellowships?|fellow)\b/.test(text)) return "Fellowships";
  if (/\b(grants?|funding|prizes?|awards?)\b/.test(text)) return "Grants / funding";
  if (/\b(volunteer(?:ing)?|pro bono|community service)\b/.test(text)) return "Volunteering / service";
  if (/\b(research assistant|research associate|research opportunity|research fellowship)\b/.test(text)) return "Research / assistantships";
  if (/\b(conferences?|competitions?|challenges?|events?|call for papers|moot court)\b/.test(text)) return "Events / competitions";
  if (/\b(terms of reference|tor|consultant|consultancy|consulting firm|service provision|tender|procurement|request for proposals|request for quotation)\b/.test(text)) return "Consultancies / contracts";
  if (/\b(jobs?|careers?|employment|positions?|vacanc(?:y|ies)|hiring|roles?)\b/.test(text)) return "Jobs / vacancies";
  if (/\b(courses?|training|bootcamps?|workshops?|certification programmes?|classes)\b/.test(text)) return "Training / certification";
  if (/\b(officers?|directors?|managers?|coordinators?|assistants?|associates?|analysts?|specialists?|advisers?|advisors?|comptrollers?|supervisors?|advocates?|clerks?|researchers?)\b/.test(text)) return "Jobs / vacancies";
  return "Other opportunities";
}

function degreeRequired(text: string): boolean {
  const negative = /\b(?:not required|not mandatory|not essential|preferred|an advantage|desirable)\b/i;
  const patterns = [
    /\b(?:must\s+(?:hold|have|possess)|required|minimum\s+(?:academic\s+)?qualification|essential qualification|mandatory)\b[^.]{0,120}\b(?:degree|bachelor|master|ll\.?b|ll\.?m|ph\.?d|doctorate)\b/i,
    /\b(?:degree|bachelor(?:'s)?|master(?:'s)?|ll\.?b|ll\.?m|ph\.?d|doctorate)\b[^.]{0,90}\b(?:is\s+)?(?:required|essential|mandatory|a minimum requirement)\b/i,
  ];
  return text.split(/[\n.!?;]+/).some((sentence) => patterns.some((pattern) => pattern.test(sentence) && !negative.test(sentence)));
}

export function matchCVToOpportunities(profile: CVProfile, items: CareerFeedItem[]): CVOpportunityMatch[] {
  return items.map((item) => {
    const titleWords = tokenSet(item.title);
    const listingText = `${item.title}\n${item.description}\n${item.details ?? ""}\n${item.categories.join(" ")}`;
    const listingWords = tokenSet(listingText);
    const titleHits = profile.keywords.filter((keyword) => titleWords.has(keyword));
    const bodyHits = profile.keywords.filter((keyword) => listingWords.has(keyword));
    const matchedTerms = [...new Set([...titleHits, ...bodyHits])].slice(0, 6);
    const text = `${item.title}\n${item.description}\n${item.details ?? ""}`;
    const hasDegreeMention = DEGREE_PATTERN.test(text);
    const hasCertificateMention = CERTIFICATE_PATTERN.test(text);
    const requiresDegree = degreeRequired(text) && profile.completedDegrees.length === 0;

    let qualificationFit: QualificationFit = "not-stated";
    let qualificationNote = "No degree requirement was identified in the feed text; this does not confirm eligibility. Check the original posting.";
    if (requiresDegree) {
      qualificationFit = "degree-required";
      qualificationNote = "The feed text appears to require a degree, while this CV profile does not show a completed degree. A certificate is not treated as equivalent; check the original criteria before applying.";
    } else if (hasCertificateMention && profile.certificates.length > 0) {
      qualificationFit = "certificate-mentioned";
      qualificationNote = "The feed mentions a certificate and this CV includes one. Check that its subject, level, and issuing body meet the original requirement.";
    } else if (hasCertificateMention) {
      qualificationFit = "certificate-not-found";
      qualificationNote = "The feed mentions a certificate, but none was detected in this CV. Check the extracted profile and the original qualification requirement.";
    } else if (hasDegreeMention && profile.completedDegrees.length > 0) {
      qualificationFit = "degree-in-cv";
      qualificationNote = "The listing mentions a degree and this CV profile includes one; verify the required subject, level, and completion status.";
    } else if (hasDegreeMention) {
      qualificationFit = "degree-mentioned";
      qualificationNote = "The feed mentions a degree, but does not clearly state whether it is mandatory. Your certificate may not substitute; review the original posting.";
    }

    let score = bodyHits.length === 0 ? 0 : 12 + Math.min(bodyHits.length, 8) * 5 + Math.min(titleHits.length, 4) * 12;
    if (profile.certificates.length > 0 && hasCertificateMention && !requiresDegree) score += 14;
    if (requiresDegree) score -= 40;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { item, score, matchedTerms, qualificationFit, qualificationNote };
  })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
}
