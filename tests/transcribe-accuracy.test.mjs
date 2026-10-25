import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isConservativeTranscriptCorrection, proofreadTranscript, splitTranscriptForProofreading } from "../supabase/functions/transcribe/proofread.ts";

const source = "The lecturer discusses constitutional rights, legal remedies, and the burden of proof in a Kenyan court.";

test("proofreading pass two receives the text returned by pass one", async () => {
  const inputs = [];
  const output = await proofreadTranscript(source, async (current, pass) => {
    inputs.push({ current, pass });
    return pass === 1
      ? "The lecturer discusses constitutional rights, legal remedies, and the burden of proof in a Kenyan court."
      : "The lecturer discusses constitutional rights, legal remedies, and the burden of proof in a Kenyan court.";
  });
  assert.equal(output.passes, 2);
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].current, source);
  assert.equal(inputs[0].pass, 1);
  assert.equal(inputs[1].current, output.text);
  assert.equal(inputs[1].pass, 2);
});

test("a failing second pass preserves the first corrected transcript", async () => {
  const inputs = [];
  const output = await proofreadTranscript(source, async (current, pass) => {
    inputs.push(current);
    if (pass === 1) return "The lecturer discusses constitutional rights, legal remedies, and the burden of proof in a Kenyan court.";
    throw new Error("provider unavailable");
  });
  assert.equal(output.passes, 1);
  assert.equal(output.text, inputs[0]);
  assert.equal(inputs[1], inputs[0]);
});

test("destructive, summary-like, empty, and overly short edits are rejected", () => {
  assert.equal(isConservativeTranscriptCorrection(source, "The lecture is about rights."), false);
  assert.equal(isConservativeTranscriptCorrection(source, ""), false);
  assert.equal(isConservativeTranscriptCorrection(source, `${source} unrelated fabricated words repeated repeatedly and repeatedly.`), false);
});

test("long transcript chunks are corrected twice and pass two sees the first-pass wording", async () => {
  const long = "teh lecturer explained the constitutional rule in class. ".repeat(800);
  const chunks = splitTranscriptForProofreading(long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 8_000));
  assert.equal(chunks.join(""), long);
  const secondPassInputs = [];
  let calls = 0;
  const output = await proofreadTranscript(long, async (current, pass) => {
    calls += 1;
    if (pass === 1) return current.replaceAll("teh", "the");
    secondPassInputs.push(current);
    return current;
  });
  assert.equal(output.passes, 2);
  assert.equal(calls, chunks.length * 2);
  assert.ok(secondPassInputs.length === chunks.length);
  assert.ok(secondPassInputs.every((current) => !current.includes("teh")));
  assert.ok(output.text.startsWith("the lecturer"));
});

test("oversized proofreading input is preserved rather than truncated", async () => {
  const long = "spoken words ".repeat(5_000);
  let calls = 0;
  const output = await proofreadTranscript(long, async () => { calls += 1; return ""; });
  assert.equal(calls, 0);
  assert.equal(output.text, long);
  assert.equal(output.passes, 0);
});

test("the deployed transcription route exposes Large v3, records its use, and runs the two-pass helper", () => {
  const endpoint = fs.readFileSync(new URL("../supabase/functions/transcribe/index.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../src/TranscribePage.tsx", import.meta.url), "utf8");
  assert.match(endpoint, /accurate: "whisper-large-v3"/);
  assert.match(endpoint, /balanced: "whisper-large-v3-turbo"/);
  assert.match(endpoint, /model: "openai\/gpt-oss-20b"/);
  assert.match(endpoint, /max_completion_tokens: 4096/);
  assert.match(endpoint, /proofreadTranscript\(originalText/);
  assert.match(endpoint, /model,\n    proofreading_passes: proofread\.passes/);
  assert.match(page, /form\.append\("quality", quality\)/);
  assert.match(page, /Higher accuracy · Whisper Large v3/);
  assert.match(page, /up to two restrained text-only proofreading passes/);
});
