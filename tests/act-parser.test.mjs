import test from "node:test";
import assert from "node:assert/strict";
import { buildActStructureAuditMessage, parseActStructureAudit, parseUploadedAct, pdfItemsToPageText } from "../src/lib/actParser.ts";

test("PDF text items retain line boundaries needed by numbered statute headings", () => {
  const text = pdfItemsToPageText([
    { str: "CONTENTS", transform: [1, 0, 0, 1, 18, 700] },
    { str: "1. Short title.", transform: [1, 0, 0, 1, 18, 680] },
    { str: "........................................ 1", transform: [1, 0, 0, 1, 100, 680] },
    { str: "2. English law of contract to apply in Kenya.", transform: [1, 0, 0, 1, 18, 660] },
    { str: "........................................ 1", transform: [1, 0, 0, 1, 180, 660] },
  ]);

  assert.match(text, /CONTENTS\n1\. Short title\. \.{3,} 1\n2\./);
});

test("Law of Contract Act skips table-of-contents entries and captures operative sections and schedule", () => {
  const raw = `THE LAW OF CONTRACT ACT\nCAP. 23\nLegislation as at 31 December 2022\n\nContents\n1. Short title. .................................................... 1\n2. English law of contract to apply in Kenya. ...................... 1\n3. Certain contracts to be in writing. ............................. 1\n4. Application of Indian Act. ...................................... 3\nSCHEDULE [s. 2] .................................................... 3\n\nLaw of Contract Act (Cap. 23)\n1. Short title.\nThis Act may be cited as the Law of Contract Act.\n\n2. English law of contract to apply in Kenya.\nThe common law of England relating to contract shall extend and apply to Kenya.\n\n3. Certain contracts to be in writing.\nNo suit shall be brought upon a contract unless it is in writing.\n\n4. Application of Indian Act.\nThe Indian Act shall apply as provided by this Act.\n\nSCHEDULE [s. 2]\nThe provisions set out in this Schedule apply.`;

  const parsed = parseUploadedAct(raw, "LawofContractAct.pdf");
  assert.equal(parsed.title, "LAW OF CONTRACT ACT");
  assert.deepEqual(parsed.sections.map(({ number }) => number), [1, 2, 3, 4]);
  assert.equal(parsed.sections[0].text, "This Act may be cited as the Law of Contract Act.");
  assert.match(parsed.sections[1].text, /common law of England/);
  assert.equal(parsed.schedules.length, 1);
  assert.match(parsed.schedules[0].text, /provisions set out in this Schedule/);
  assert.doesNotMatch(parsed.sections[0].text, /\.{3,}/);
});

test("another Act layout with plain contents page numbers and dash headings is parsed generically", () => {
  const raw = `THE SAMPLE ADMINISTRATION ACT\nContents\n1. Short title 1\n2. Application 1\nFIRST SCHEDULE 8\n\nTHE SAMPLE ADMINISTRATION ACT\n1—Short title.\nThis Act may be cited as the Sample Administration Act.\n\n2—Application.\nThis Act applies throughout Kenya.\n\nFIRST SCHEDULE\nMatters prescribed under this Act.`;
  const parsed = parseUploadedAct(raw, "sample-administration.pdf");

  assert.equal(parsed.title, "SAMPLE ADMINISTRATION ACT");
  assert.deepEqual(parsed.sections.map(({ number }) => number), [1, 2]);
  assert.match(parsed.sections[0].text, /may be cited as the Sample Administration Act/);
  assert.match(parsed.sections[1].text, /applies throughout Kenya/);
  assert.equal(parsed.schedules.length, 1);
  assert.match(parsed.schedules[0].text, /Matters prescribed under this Act/);
});

test("a document without a numbered section 1 is not misidentified as an Act", () => {
  assert.deepEqual(parseUploadedAct("2. Later section\nText", "empty.pdf").sections, []);
});

test("Act audit input compares source headings with parsed output without special-casing one Act", () => {
  const message = buildActStructureAuditMessage(
    "CONTENTS\n1. Short title. ........ 1\n\n1. Short title.\nBody text\nFIRST SCHEDULE\nSchedule text",
    [{ number: 1, title: "Short title.", text: "Body text" }],
    [{ number: "Schedule", title: "FIRST SCHEDULE", text: "Schedule text" }],
  );

  assert.match(message, /sourceHeadingInventoryIncludesContentsEntries/);
  assert.match(message, /parsedSections/);
  assert.match(message, /parsedSchedules/);
  assert.match(message, /FIRST SCHEDULE/);
  assert.match(message, /inventoryTruncated/);
});

test("AI Act audit parsing accepts the expected shape and leaves malformed results unverified", () => {
  assert.deepEqual(parseActStructureAudit({ status: "pass", summary: "No obvious outline mismatch.", issues: [] }), {
    status: "pass",
    summary: "No obvious outline mismatch.",
    issues: [],
  });
  assert.deepEqual(parseActStructureAudit('{"status":"review","summary":"Check numbering.","issues":["Possible missing heading"]}'), {
    status: "review",
    summary: "Check numbering.",
    issues: ["Possible missing heading"],
  });
  assert.equal(parseActStructureAudit({ status: "pass", summary: "No issue." }), null);
  assert.equal(parseActStructureAudit({ status: "pass", summary: "Mismatch noted.", issues: ["Possible omitted heading"] })?.status, "review");
  assert.equal(parseActStructureAudit("not JSON"), null);
});
