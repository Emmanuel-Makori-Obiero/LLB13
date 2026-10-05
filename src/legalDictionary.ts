export type DictionaryShelf = "blacks" | "law";

export type LegalDictionaryEntry = {
  term: string;
  pronunciation?: string;
  definition: string;
  example?: string;
  shelf: DictionaryShelf;
  tags: string[];
};

// These are original study summaries, not reproduced text from any commercial dictionary.
export const LEGAL_DICTIONARY: LegalDictionaryEntry[] = [
  { term: "Ab initio", definition: "From the beginning. A legal act or proceeding treated as invalid from the moment it began.", example: "The court declared the agreement void ab initio.", shelf: "blacks", tags: ["latin", "validity"] },
  { term: "Actus reus", definition: "The external act, omission, or state of affairs that forms part of a criminal offence.", example: "The prosecution must connect the prohibited act to the accused.", shelf: "blacks", tags: ["criminal", "offence"] },
  { term: "Bona fide", definition: "In good faith; honestly and without an intention to deceive or take unfair advantage.", shelf: "blacks", tags: ["latin", "good faith"] },
  { term: "Caveat", definition: "A warning or formal notice to proceed carefully, or a reservation that limits an assertion.", shelf: "blacks", tags: ["notice", "procedure"] },
  { term: "Certiorari", definition: "A supervisory court order used to bring a decision before a higher court for review and possible quashing.", shelf: "blacks", tags: ["public law", "judicial review"] },
  { term: "Consideration", definition: "Something of legally recognized value exchanged to support a simple contract, subject to applicable exceptions.", shelf: "blacks", tags: ["contract", "agreement"] },
  { term: "Damages", definition: "Money awarded by a court to compensate for a proven loss, injury, or legally recognized wrong.", shelf: "blacks", tags: ["remedy", "civil"] },
  { term: "Estoppel", definition: "A rule that can prevent a person from contradicting a representation or position when another person reasonably relied on it.", shelf: "blacks", tags: ["equity", "reliance"] },
  { term: "Habeas corpus", definition: "A court process requiring the custodian of a detained person to justify the detention before the court.", shelf: "blacks", tags: ["liberty", "procedure"] },
  { term: "Injunction", definition: "A court order requiring a person to do something or to stop doing something.", shelf: "blacks", tags: ["remedy", "court order"] },
  { term: "Mens rea", definition: "The mental element required for a criminal offence, such as intention, knowledge, recklessness, or sometimes negligence.", shelf: "blacks", tags: ["criminal", "mental element"] },
  { term: "Obiter dictum", definition: "A judicial observation made in a judgment that was not necessary to decide the dispute; it may still be persuasive.", shelf: "blacks", tags: ["precedent", "judgment"] },
  { term: "Ratio decidendi", definition: "The legal principle necessary to the court's decision, which may bind lower courts under the applicable doctrine of precedent.", shelf: "blacks", tags: ["precedent", "judgment"] },
  { term: "Res judicata", definition: "The principle that a final judgment generally prevents the same parties from re-litigating the same cause or issue.", shelf: "blacks", tags: ["civil procedure", "finality"] },
  { term: "Ultra vires", definition: "Beyond the legal power or authority granted to a person, body, or public institution.", shelf: "blacks", tags: ["public law", "authority"] },
  { term: "Voir dire", definition: "A preliminary examination, often of a witness or prospective juror, used to decide competence, admissibility, or impartiality.", shelf: "blacks", tags: ["evidence", "trial"] },
  { term: "Without prejudice", definition: "A communication or step made on a protected basis so it generally cannot be used as an admission in later proceedings, subject to exceptions.", shelf: "blacks", tags: ["settlement", "evidence"] },
  { term: "Affidavit", definition: "A written statement of facts confirmed by oath or affirmation before an authorized person.", shelf: "law", tags: ["evidence", "procedure"] },
  { term: "Appeal", definition: "A request for a higher court or tribunal to review a lower decision according to the permitted grounds and procedure.", shelf: "law", tags: ["procedure", "court"] },
  { term: "Arbitration", definition: "A private dispute-resolution process in which an appointed arbitrator makes a decision that may be binding under the parties' agreement and the law.", shelf: "law", tags: ["dispute resolution", "contract"] },
  { term: "Bail", definition: "Release of an accused person from custody while a case continues, usually subject to conditions designed to secure attendance and protect the process.", shelf: "law", tags: ["criminal", "procedure"] },
  { term: "Breach of contract", definition: "Failure, without a legally accepted excuse, to perform a contractual promise when performance is due.", shelf: "law", tags: ["contract", "remedy"] },
  { term: "Burden of proof", definition: "The obligation on a party to establish the facts or legal elements needed to succeed; the standard differs between civil and criminal matters.", shelf: "law", tags: ["evidence", "trial"] },
  { term: "Constitution", definition: "The highest legal framework of a state, establishing institutions, powers, rights, and limits on public authority.", shelf: "law", tags: ["public law", "Kenya"] },
  { term: "Contract", definition: "An agreement that the law recognizes as creating enforceable obligations between parties.", shelf: "law", tags: ["agreement", "obligation"] },
  { term: "Evidence", definition: "Information presented to a court to help prove or disprove a fact in issue, subject to rules of relevance and admissibility.", shelf: "law", tags: ["trial", "proof"] },
  { term: "Judicial review", definition: "Court supervision of the legality, fairness, and rationality of public decision-making, rather than a general appeal on the merits.", shelf: "law", tags: ["public law", "administrative law"] },
  { term: "Locus standi", definition: "The legal standing or sufficient interest required for a person to bring a claim or participate in proceedings.", shelf: "law", tags: ["procedure", "standing"] },
  { term: "Mediation", definition: "A facilitated negotiation in which a neutral mediator helps parties seek their own settlement without deciding the dispute for them.", shelf: "law", tags: ["dispute resolution", "settlement"] },
  { term: "Negligence", definition: "A failure to take the reasonable care required in the circumstances, causing legally recognized harm to another person.", shelf: "law", tags: ["tort", "duty"] },
  { term: "Plaintiff", definition: "The person or organization that starts a civil claim; terminology may vary by court and type of proceeding.", shelf: "law", tags: ["civil procedure", "parties"] },
  { term: "Precedent", definition: "An earlier judicial decision used as authority or guidance when deciding a later case with relevantly similar legal issues.", shelf: "law", tags: ["courts", "judgment"] },
  { term: "Statute", definition: "A written law enacted by a competent legislature, including its amendments and related rules where applicable.", shelf: "law", tags: ["legislation", "public law"] },
  { term: "Tort", definition: "A civil wrong, independent of contract, for which the law may provide a remedy such as damages or an injunction.", shelf: "law", tags: ["civil", "wrong"] },
  { term: "Writ", definition: "A formal court order directing a person or public body to perform, or refrain from, a specified legal act.", shelf: "law", tags: ["remedy", "procedure"] },
];

export function searchLegalDictionary(query: string, shelf?: DictionaryShelf) {
  const term = query.trim().toLowerCase();
  const entries = shelf ? LEGAL_DICTIONARY.filter((entry) => entry.shelf === shelf) : LEGAL_DICTIONARY;
  if (!term) return entries;
  return entries
    .filter((entry) => [entry.term, entry.definition, entry.example ?? "", ...entry.tags].join(" ").toLowerCase().includes(term))
    .sort((a, b) => Number(a.term.toLowerCase() !== term) - Number(b.term.toLowerCase() !== term));
}

export function findLegalTerm(query: string) {
  const normalized = query.trim().toLowerCase().replace(/^(define|what is|what does|meaning of|explain)\s+/i, "").replace(/[?!.]+$/g, "").trim();
  return LEGAL_DICTIONARY.find((entry) => entry.term.toLowerCase() === normalized)
    ?? LEGAL_DICTIONARY.find((entry) => normalized.length > 2 && entry.term.toLowerCase().includes(normalized));
}
