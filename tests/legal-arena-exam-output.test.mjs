import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePracticeExam } from "../src/lib/practiceExam.ts";

const games = readFileSync(new URL("../src/GamesHub.tsx", import.meta.url), "utf8");
const examPage = readFileSync(new URL("../src/ExamReviewPage.tsx", import.meta.url), "utf8");
const arenaCss = readFileSync(new URL("../src/legal-arena-tournament.css", import.meta.url), "utf8");

const q = (number, marks = 20) => ({
  number,
  type: "problem",
  question: `Question ${number}: Advise the parties on the legal duties, relevant Kenyan law, evidence and remedies arising from these facts.`,
  marks,
  modelAnswer: "Identify the legal issue, state the supported rule, apply it carefully to the facts, and conclude on a suitable remedy.",
  keyPoints: ["Identify issue", "Apply law"],
  explanation: "Use only supported law and explain the application.",
});

test("complete practice exam normalizer requires exact count and complete answer keys", () => {
  const result = normalizePracticeExam({ data: { title: "Contract Law Practice Exam", instructions: "Answer all questions.", duration_minutes: 150, questions: [q(1), q(2), q(3)] } }, 3);
  assert.ok(result);
  assert.equal(result.paper.title, "Contract Law Practice Exam");
  assert.equal(result.paper.durationMinutes, 150);
  assert.equal(result.paper.totalMarks, 100);
  assert.equal(result.questions.length, 3);
  assert.equal(result.questions.reduce((sum, question) => sum + question.marks, 0), 100);
  assert.equal(normalizePracticeExam({ data: { questions: [q(1), q(2)] } }, 3), null);
  assert.equal(normalizePracticeExam({ data: { questions: [{ ...q(1), modelAnswer: "short" }, q(2), q(3)] } }, 3), null);
});

test("valid question marks are proportionally normalized to exactly 100", () => {
  const result = normalizePracticeExam({ data: { questions: [q(1, 20), q(2, 20), q(3, 20)] } }, 3);
  assert.ok(result);
  assert.deepEqual(result.questions.map((question) => question.marks), [34, 33, 33]);
});

test("live debate always renders the motion and the bot is instructed to stay on the legal issue", () => {
  assert.match(games, /DEBATE MOTION/);
  assert.match(games, /room\.motion\?\.trim\(\)/);
  assert.match(games, /Do not turn a library title, topic or metadata into a product complaint or technical-support dispute/);
  assert.match(games, /Do not introduce product features, software search behavior, Boolean operators, truncation, indexing or interface details/);
  assert.match(games, /disregard them and focus on the legal cause of action, rights\/duties, relevant evidence and remedy/);
  assert.match(arenaCss, /\.arena-match-motion/);
});

test("exam UI explicitly requests and displays a full paper instead of a loose question list", () => {
  assert.match(examPage, /Create ONE complete new Kenyan-law practice examination based on the uploaded paper/);
  assert.match(examPage, /EXACTLY \$\{questionCount\} open-response questions/);
  assert.match(examPage, /marks must be positive whole numbers adding to exactly 100/i);
  assert.match(examPage, /COMPLETE PRACTICE EXAM/);
  assert.match(examPage, /durationMinutes/);
  assert.doesNotMatch(examPage, /const structureText = paper\.text\.slice\(0, 12_000\)/);
});
