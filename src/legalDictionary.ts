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

  { term: "Acquittal", definition: "A formal finding that the prosecution has not proved the accused person’s guilt to the required standard.", example: "The court entered an acquittal after finding the evidence insufficient.", shelf: "law", tags: ["criminal", "trial", "result"] },
  { term: "Admissibility", definition: "Whether evidence meets the legal requirements for being received and considered by a court.", shelf: "law", tags: ["evidence", "trial"] },
  { term: "Administrative action", definition: "A decision, omission, or conduct by a public body while exercising public power or performing a public function.", shelf: "law", tags: ["public law", "government"] },
  { term: "Adverse possession", definition: "A land claim based on open, continuous, and legally qualifying possession for the statutory period, subject to the applicable land law and facts.", shelf: "law", tags: ["land", "property"] },
  { term: "Affirmative action", definition: "A measure designed to address disadvantage or improve participation for a group that has experienced exclusion or inequality.", shelf: "law", tags: ["equality", "Constitution", "rights"] },
  { term: "Amicus curiae", definition: "A person or organization permitted to assist a court with relevant information or perspective without being one of the principal parties.", shelf: "blacks", tags: ["latin", "court", "procedure"] },
  { term: "Arraignment", definition: "The stage at which an accused person is brought before court, informed of the charge, and called upon to plead.", shelf: "law", tags: ["criminal", "procedure"] },
  { term: "Bail bond", definition: "A financial or other undertaking connected with release from custody and the accused person’s attendance at future proceedings.", shelf: "law", tags: ["criminal", "release"] },
  { term: "Cause of action", definition: "The combination of facts which, if proved, gives a claimant a legally recognized basis to seek a remedy.", shelf: "law", tags: ["civil procedure", "claim"] },
  { term: "Certiorari", definition: "A supervisory order that may quash a public decision made unlawfully, unfairly, irrationally, or outside jurisdiction.", shelf: "law", tags: ["judicial review", "remedy"] },
  { term: "Child custody", definition: "The legal arrangements governing a child’s care, residence, and day-to-day decision-making, guided by the child’s best interests.", shelf: "law", tags: ["family", "children"] },
  { term: "Civil contempt", definition: "Conduct that disobeys a court order or obstructs the administration of justice and may attract sanctions.", shelf: "law", tags: ["court", "procedure"] },
  { term: "Class action", definition: "Proceedings in which a representative or group litigates a common issue affecting multiple people, subject to procedural requirements.", shelf: "law", tags: ["civil procedure", "public interest"] },
  { term: "Constitutional petition", definition: "A court proceeding asking for interpretation, enforcement, or protection of constitutional rights or principles.", shelf: "law", tags: ["Constitution", "rights", "procedure"] },
  { term: "Counterclaim", definition: "A claim brought by a defendant against the claimant in the same proceedings, connected to the dispute or permitted by procedure.", shelf: "law", tags: ["civil procedure", "pleading"] },
  { term: "Criminal liability", definition: "Legal responsibility for conduct that satisfies the elements of an offence, including any required mental element and absence of a defence.", shelf: "law", tags: ["criminal", "offence"] },
  { term: "Decree", definition: "A formal adjudicative order expressing the final determination of rights or obligations in a proceeding.", shelf: "law", tags: ["court", "remedy"] },
  { term: "Defamation", definition: "A publication that unlawfully harms another person’s reputation, subject to the elements, defences, and applicable limitations.", shelf: "law", tags: ["tort", "reputation"] },
  { term: "Delegated legislation", definition: "Rules, regulations, or orders made by an authorized person or body under power granted by an Act or other enabling law.", shelf: "law", tags: ["legislation", "public law"] },
  { term: "Devolution", definition: "The constitutional distribution of functions and power between the national and county levels of government.", example: "A devolution question asks which level of government has the relevant constitutional function.", shelf: "law", tags: ["Kenya", "Constitution", "government"] },
  { term: "Doctrine of precedent", definition: "The approach under which courts follow binding legal principles from higher courts while treating other decisions as persuasive according to hierarchy and context.", shelf: "law", tags: ["courts", "judgment"] },
  { term: "Doli incapax", definition: "A historic term concerning a child’s presumed inability to form criminal responsibility; current application depends on the governing child and criminal law.", shelf: "blacks", tags: ["latin", "criminal", "children"] },
  { term: "Double jeopardy", definition: "The protection against being tried or punished again for the same offence after a qualifying final outcome, subject to legal exceptions.", shelf: "law", tags: ["criminal", "rights"] },
  { term: "Due process", definition: "Fair and lawful procedure before a person is deprived of a right, liberty, property, or legitimate legal interest.", shelf: "law", tags: ["fairness", "rights", "procedure"] },
  { term: "Easement", definition: "A legally recognized right to use another person’s land for a defined purpose, such as access or drainage.", shelf: "law", tags: ["land", "property"] },
  { term: "Equity", definition: "A body of principles that supplements strict legal rules by focusing on fairness, conscience, and appropriate relief within legal limits.", shelf: "blacks", tags: ["remedy", "fairness"] },
  { term: "Ex parte", definition: "A proceeding or application made by one side without the other side being present at that stage, usually subject to procedural safeguards.", shelf: "blacks", tags: ["latin", "procedure"] },
  { term: "Exclusionary rule", definition: "A rule that may prevent improperly obtained or legally inadmissible evidence from being used, subject to the applicable law and balancing questions.", shelf: "law", tags: ["evidence", "trial"] },
  { term: "Expert witness", definition: "A witness whose specialized knowledge, skill, training, or experience assists the court on an issue beyond ordinary understanding.", shelf: "law", tags: ["evidence", "trial"] },
  { term: "Fair administrative action", definition: "The right to administrative action that is lawful, reasonable, procedurally fair, and accompanied by written reasons where required.", shelf: "law", tags: ["Kenya", "public law", "rights"] },
  { term: "Fundamental rights", definition: "Basic rights protected by the Constitution or other applicable law, subject to lawful limitations and enforcement mechanisms.", shelf: "law", tags: ["Constitution", "rights"] },
  { term: "Hearsay", definition: "A statement made outside the current proceedings that is offered to prove the truth of what it asserts, subject to rules and exceptions.", shelf: "law", tags: ["evidence", "trial"] },
  { term: "Indictment", definition: "A formal accusation of a criminal offence; the exact procedure and terminology depend on the applicable criminal process.", shelf: "law", tags: ["criminal", "charge"] },
  { term: "Interlocutory application", definition: "An application made during an ongoing case seeking temporary, procedural, or case-management relief before final judgment.", shelf: "law", tags: ["civil procedure", "court"] },
  { term: "Inter partes", definition: "Between the parties to a dispute, with the relevant parties given an opportunity to participate or respond.", shelf: "blacks", tags: ["latin", "procedure"] },
  { term: "Jurisdiction", definition: "The legal authority of a court or tribunal to hear a matter, exercise power over parties or subject matter, and grant a remedy.", shelf: "law", tags: ["court", "procedure"] },
  { term: "Judicial notice", definition: "A court’s acceptance of a fact as sufficiently established or readily verifiable without requiring ordinary proof of that fact.", shelf: "law", tags: ["evidence", "trial"] },
  { term: "Legitimate expectation", definition: "An expectation arising from a representation, practice, or promise that a public body may be required to treat fairly, subject to law and public interest.", shelf: "law", tags: ["public law", "fairness"] },
  { term: "Limitation period", definition: "The legally prescribed time within which a claim or proceeding must generally be started, subject to exceptions and special rules.", shelf: "law", tags: ["procedure", "time"] },
  { term: "Liquidated damages", definition: "A sum agreed in advance as a genuine contractual measure of likely loss, distinguished from an unenforceable penalty according to the law and facts.", shelf: "law", tags: ["contract", "remedy"] },
  { term: "Mandamus", definition: "A public-law order compelling a public body or official to perform a legal duty that has not been performed.", shelf: "blacks", tags: ["remedy", "public law"] },
  { term: "Mitigation", definition: "Steps taken to reduce or avoid loss after a wrong or breach; a claimant generally cannot recover loss that reasonable mitigation would have prevented.", shelf: "law", tags: ["remedy", "damages"] },
  { term: "Natural justice", definition: "Core procedural fairness principles, commonly including an unbiased decision-maker and a fair opportunity to be heard.", shelf: "law", tags: ["fairness", "procedure"] },
  { term: "Nolle prosequi", definition: "A formal decision not to continue a prosecution, subject to the constitutional and statutory powers governing the prosecuting authority.", shelf: "blacks", tags: ["latin", "criminal"] },
  { term: "Occupier’s liability", definition: "Potential responsibility of a person controlling premises for harm caused by unsafe conditions, subject to the applicable duty and circumstances.", shelf: "law", tags: ["tort", "premises"] },
  { term: "Perjury", definition: "Knowingly making a materially false statement under oath or affirmation in a setting where the law requires truthfulness.", shelf: "law", tags: ["criminal", "evidence"] },
  { term: "Plea bargain", definition: "A formal agreement or process in which an accused person and prosecution resolve criminal charges on agreed terms permitted by law and approved through the required procedure.", shelf: "law", tags: ["criminal", "procedure"] },
  { term: "Presumption of innocence", definition: "The principle that an accused person is treated as innocent unless and until guilt is proved according to law.", shelf: "law", tags: ["criminal", "rights"] },
  { term: "Probate", definition: "The legal process of proving a will and authorizing the administration of a deceased person’s estate.", shelf: "law", tags: ["succession", "estate"] },
  { term: "Pro bono", definition: "Professional legal work provided without charge or for a reduced fee, commonly to improve access to justice.", shelf: "blacks", tags: ["latin", "access to justice"] },
  { term: "Proportionality", definition: "A method of testing whether a limitation, sanction, or public measure is suitably connected to its aim and not excessive in relation to the rights or interests affected.", shelf: "law", tags: ["Constitution", "rights"] },
  { term: "Plea", definition: "The accused person’s formal response to a criminal charge, such as guilty or not guilty, recorded according to procedure.", shelf: "law", tags: ["criminal", "procedure"] },
  { term: "Public interest litigation", definition: "Proceedings brought to protect a public, collective, or constitutional interest rather than only a private individual claim.", shelf: "law", tags: ["Constitution", "rights", "procedure"] },
  { term: "Quantum", definition: "The amount or extent of money, compensation, loss, or other relief at issue after liability or entitlement is considered.", shelf: "blacks", tags: ["latin", "damages"] },
  { term: "Ratio of probabilities", definition: "The civil standard commonly expressed as proof that a fact is more likely than not, subject to the applicable law and context.", shelf: "law", tags: ["evidence", "civil"] },
  { term: "Reasonable doubt", definition: "The level of uncertainty relevant to the criminal burden of proof; it is more than fanciful or trivial doubt, but not absolute certainty.", shelf: "law", tags: ["criminal", "evidence"] },
  { term: "Remand", definition: "Keeping an accused person in custody or releasing them on conditions while a criminal case is pending, according to the court’s order.", shelf: "law", tags: ["criminal", "procedure"] },
  { term: "Restitution", definition: "Relief aimed at restoring a person to the position they were in before a wrong, or returning property or its value where the law permits.", shelf: "law", tags: ["remedy", "criminal"] },
  { term: "Specific performance", definition: "An equitable remedy requiring a party to perform a contractual obligation rather than merely paying damages, where appropriate.", shelf: "law", tags: ["contract", "remedy"] },
  { term: "Sub judice", definition: "A matter currently before a court or tribunal, with legal and procedural limits on how it may be discussed or litigated elsewhere.", shelf: "blacks", tags: ["latin", "court"] },
  { term: "Summons", definition: "A formal document requiring a person to attend court, respond to a claim, or take a specified procedural step.", shelf: "law", tags: ["procedure", "court"] },
  { term: "Testamentary capacity", definition: "The legal and mental capacity required for a person to make a valid will, subject to the governing succession law.", shelf: "law", tags: ["succession", "estate"] },
  { term: "Trespass", definition: "Direct, unjustified interference with another person’s land, goods, or person, depending on the form of trespass alleged.", shelf: "law", tags: ["tort", "property"] },
  { term: "Tribunal", definition: "A body established by law to determine particular disputes or exercise a specialized adjudicative function.", shelf: "law", tags: ["procedure", "public law"] },
  { term: "Vicarious liability", definition: "Responsibility imposed on one person, often an employer, for a qualifying wrong committed by another in the course of assigned work.", shelf: "law", tags: ["tort", "employment"] },
  { term: "Victim impact statement", definition: "Information describing how an offence affected a victim, considered at the stage and in the manner permitted by criminal procedure.", shelf: "law", tags: ["criminal", "victims"] },
  { term: "Warrant", definition: "A formal authorization issued by a lawful authority, commonly permitting an arrest, search, seizure, or other specified action.", shelf: "law", tags: ["criminal", "procedure"] },
  { term: "Without notice", definition: "An application or step taken before the affected party is notified, normally requiring candour and later opportunity to respond.", shelf: "law", tags: ["procedure", "court"] },
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
