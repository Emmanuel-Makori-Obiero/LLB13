import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCVProfile,
  matchCVToOpportunities,
  opportunityKind,
} from "../src/lib/cvOpportunityMatcher.ts";

const certificateCv = `
Skills: legal research, legal writing, policy analysis, drafting, advocacy, communication.
Certificate in Legal Practice, Kenya School of Law, 2024.
Bachelor of Laws (LLB), University of Nairobi, expected 2028.
`;

function item(title, description, details = "") {
  return {
    title,
    url: `https://ngojobsinafrica.com/job/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/`,
    description,
    details,
    published_at: null,
    categories: ["Kenya"],
  };
}

test("keeps certificates separate from a degree that is still in progress", () => {
  const profile = buildCVProfile(certificateCv);
  assert.equal(profile.certificates.length, 1);
  assert.match(profile.certificates[0], /Certificate in Legal Practice/);
  assert.equal(profile.completedDegrees.length, 0);
  assert.equal(profile.inProgressDegrees.length, 1);
  assert.match(profile.inProgressDegrees[0], /expected 2028/);
  assert.ok(profile.keywords.includes("research"));
});

test("ranks certificate-compatible listings ahead of degree-required listings for a certificate CV", () => {
  const profile = buildCVProfile(certificateCv);
  const certificateListing = item(
    "Legal Research Internship",
    "Legal research, legal writing, policy analysis, and drafting. Certificate in Legal Practice accepted.",
    "Minimum qualification: a certificate in legal studies or relevant legal training.",
  );
  const degreeListing = item(
    "Legal Research Officer",
    "Legal research, legal writing, policy analysis, and drafting. A bachelor's degree is required.",
    "Applicants must hold a bachelor's degree in law. A master's degree is preferred.",
  );
  const matches = matchCVToOpportunities(profile, [degreeListing, certificateListing]);
  assert.equal(matches[0].item.title, certificateListing.title);
  assert.equal(matches[0].qualificationFit, "certificate-mentioned");
  assert.equal(matches[1].qualificationFit, "degree-required");
  assert.match(matches[1].qualificationNote, /A certificate is not treated as equivalent/);
  assert.ok(matches[0].score > matches[1].score);
});

test("does not treat a preferred degree as a mandatory requirement", () => {
  const profile = buildCVProfile("Certificate in Legal Practice. Skills: legal research, policy analysis, drafting.");
  const preferred = item("Policy Research Assistant", "Legal research and policy analysis. A bachelor's degree is preferred, not required.");
  const match = matchCVToOpportunities(profile, [preferred])[0];
  assert.equal(match.qualificationFit, "degree-mentioned");
});

test("does not claim a certificate match when no certificate was detected in the CV", () => {
  const profile = buildCVProfile("Skills: legal research, policy analysis, drafting, advocacy, and communication.");
  const listing = item("Legal Research Assistant", "Legal research and policy analysis. A certificate in law is accepted.");
  const match = matchCVToOpportunities(profile, [listing])[0];
  assert.equal(match.qualificationFit, "certificate-not-found");
  assert.match(match.qualificationNote, /none was detected in this CV/);
});

test("recognizes an explicitly required degree and only labels, rather than assumes, unstated eligibility", () => {
  const profile = buildCVProfile("Certificate in Legal Practice. Skills: legal research, policy analysis, drafting.");
  const required = item("Legal Officer", "Legal research and policy analysis.", "Minimum qualification: a bachelor's degree in law is required.");
  const unclear = item("Legal Research Assistant", "Legal research, legal writing, and policy analysis.");
  const matches = matchCVToOpportunities(profile, [required, unclear]);
  assert.equal(matches.find((match) => match.item.title === required.title).qualificationFit, "degree-required");
  assert.equal(matches.find((match) => match.item.title === unclear.title).qualificationFit, "not-stated");
  assert.match(matches.find((match) => match.item.title === unclear.title).qualificationNote, /does not confirm eligibility/);
});

test("classifies a broad range of career-related opportunity types", () => {
  assert.equal(opportunityKind(item("Legal Apprenticeship", "A Kenya-based placement")), "Apprenticeships");
  assert.equal(opportunityKind(item("Judicial Pupillage", "Legal practice route")), "Pupillage / legal attachment");
  assert.equal(opportunityKind(item("Research Internship", "For a law student")), "Internships / attachments");
  assert.equal(opportunityKind(item("Kenya Law Scholarship", "Tuition support")), "Scholarships / bursaries");
  assert.equal(opportunityKind(item("Community Volunteer", "Human-rights programme")), "Volunteering / service");
  assert.equal(opportunityKind(item("Moot Court Competition", "Student challenge")), "Events / competitions");
  assert.equal(opportunityKind(item("Finance & Administration Officer", "Training and grant programme references in the description", "Internship, scholarship, and training keywords in the long text.")), "Jobs / vacancies");
  assert.equal(opportunityKind(item("Terms of Reference: Technical Support Consultant", "A short assignment")), "Consultancies / contracts");
});
