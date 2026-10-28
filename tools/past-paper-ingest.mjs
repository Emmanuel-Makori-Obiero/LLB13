#!/usr/bin/env node
/**
 * Bulk-import law past papers into the shared Library and AI index.
 *
 * Required for a real run:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node tools/past-paper-ingest.mjs --archive /path/ALLLAWPASTPAPERS.rar
 *
 * Add OPENAI_API_KEY to also populate vector embeddings. Without it, the
 * lexical tsvector index is still created and the run remains useful.
 * Use --dry-run to inspect metadata without writing anything.
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] || fallback : fallback;
};
const archive = arg("--archive");
const inputDir = arg("--input-dir");
const dryRun = args.includes("--dry-run");
const limit = Number(arg("--limit", "0")) || 0;
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const embeddingKey = process.env.OPENAI_API_KEY || "";
const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const embeddingDimensions = 1536;

if (!archive && !inputDir) throw new Error("Pass --archive /path/file.rar or --input-dir /path/to/extracted/files.");
if (!dryRun && (!supabaseUrl || !serviceKey)) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for a real import.");

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (value, fallback = "Unknown") => String(value || fallback).replace(/\s+/g, " ").trim();
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function parseMetadata(relativePath, text = "") {
  const normalized = relativePath.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.at(-1) || normalized;
  const semester = parts.find((part) => /^(JAN|MAY|SEPT)/i.test(part)) || "Unknown session";
  const yearMatch = semester.match(/\b(20\d{2})\b/) || normalized.match(/\b(20\d{2})\b/);
  const examYear = yearMatch ? Number(yearMatch[1]) : null;
  const sessionMatch = semester.match(/^(JAN\s*-\s*APRIL|MAY\s*-\s*AUG|SEPT\s*-\s*DEC)/i);
  const examSession = sessionMatch ? sessionMatch[1].toUpperCase().replace(/\s+/g, " ") : semester;
  const base = fileName.replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
  const codeMatch = base.match(/\b((?:D?CLS|GSL|MCLS)\s*[0-9O]{3})\b/i);
  const courseCode = codeMatch ? codeMatch[1].toUpperCase().replace(/\s+/, " ").replace(/O(?=\d)/, "0") : "Unclassified";
  const variant = base.replace(codeMatch?.[0] || "", "").replace(/^[-_\s]+|[-_\s]+$/g, "").trim() || "Regular";
  const firstLines = text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 3).slice(0, 12);
  const sourceTitle = firstLines.find((line) => /exam|paper|college|university|course|law/i.test(line) && line.length < 180);
  const title = `${courseCode} · ${examSession}${examYear ? ` ${examYear}` : ""}${variant !== "Regular" ? ` · ${variant}` : ""}`;
  const confidence = (examYear ? 0.3 : 0) + (courseCode !== "Unclassified" ? 0.35 : 0) + (semester !== "Unknown session" ? 0.25 : 0) + (sourceTitle ? 0.1 : 0);
  return { title, examYear, examSession, courseCode, paperVariant: variant, sourceTitle: sourceTitle || "", confidence: Math.min(1, confidence), semester, fileName };
}

function chunkText(text, size = 1200, overlap = 200) {
  const paragraphs = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current ? `${current}\n\n` : "") + paragraph.length > size && current) {
      chunks.push(current);
      current = `${current.slice(-overlap)}\n\n${paragraph}`;
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
    while (current.length > size * 1.5) {
      chunks.push(current.slice(0, size));
      current = current.slice(size - overlap);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function extractText(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".pdf") {
    try { return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }); } catch { return ""; }
  }
  if (extension === ".docx") {
    try {
      const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
      return xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\s*\/>/g, "\n").replace(/<\/w:p>/g, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\n{3,}/g, "\n\n");
    } catch { return ""; }
  }
  if ([".txt", ".md", ".rtf"].includes(extension)) return fsSync.readFileSync(file, "utf8");
  return "";
}

async function walk(root) {
  const output = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (/\.(docx|pdf|txt|md|rtf)$/i.test(entry.name)) output.push(full);
    }
  }
  await visit(root);
  return output.sort();
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.slice(0, 600)}`);
  return body ? JSON.parse(body) : null;
}
async function rest(table, query = "") { return request(`${supabaseUrl}/rest/v1/${table}${query}`); }
async function uploadObject(storagePath, bytes, contentType) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/materials/${storagePath}`, { method: "POST", headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" }, body: bytes });
  if (!response.ok) throw new Error(`Storage upload failed: ${(await response.text()).slice(0, 500)}`);
}
async function embed(texts) {
  if (!embeddingKey) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${embeddingKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: embeddingModel, input: texts, dimensions: embeddingDimensions }) });
    if (response.ok) return (await response.json()).data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    if (![408, 409, 429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Embedding provider failed: ${(await response.text()).slice(0, 500)}`);
    await sleep(1500 * (attempt + 1));
  }
  throw new Error("Embedding provider remained unavailable after retries.");
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "llb13-papers-"));
  let root = inputDir;
  try {
    if (archive) {
      root = path.join(temp, "extracted");
      await fs.mkdir(root, { recursive: true });
      const extraction = spawnSync("unar", ["-f", "-o", root, archive], { encoding: "utf8" });
      if (extraction.error) throw extraction.error;
      if (extraction.status !== 0) console.warn("Archive extraction reported unreadable entries; importing every file that was extracted successfully.");
    }
    const files = (await walk(root)).slice(0, limit || undefined);
    if (!files.length) throw new Error("No supported DOCX/PDF/text files found.");
    console.log(`Discovered ${files.length} files${dryRun ? " (dry run)" : ""}. Embeddings: ${embeddingKey ? `${embeddingModel} (${embeddingDimensions})` : "disabled; lexical index only"}.`);
    const manifest = [];
    for (const [index, file] of files.entries()) {
      const relativePath = path.relative(root, file).replaceAll("\\", "/");
      const bytes = await fs.readFile(file);
      const text = extractText(file).trim();
      const metadata = parseMetadata(relativePath, text);
      const chunks = text ? chunkText(text) : [];
      manifest.push({ relativePath, bytes: bytes.length, chunks: chunks.length, ...metadata });
      console.log(`${String(index + 1).padStart(3, " ")} ${metadata.title} · ${relativePath} · ${chunks.length} chunks`);
      if (dryRun) continue;
      const fileHash = sha256(bytes);
      const proposedMaterialId = crypto.randomUUID();
      const safePath = `past-papers/${fileHash.slice(0, 2)}/${fileHash}-${metadata.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const mime = path.extname(file).toLowerCase() === ".pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      await uploadObject(safePath, bytes, mime);
      const material = { id: proposedMaterialId, title: metadata.title, author: metadata.sourceTitle || null, type: "Past paper", unit: metadata.courseCode, topic: `${metadata.courseCode} · ${metadata.examSession}`, date: metadata.examYear ? String(metadata.examYear) : new Date().toISOString().slice(0, 10), source: `Bulk archive · ${metadata.semester}`, url: `${supabaseUrl}/storage/v1/object/public/materials/${safePath}`, storage_path: safePath, file_sha256: fileHash, archive_path: relativePath, exam_year: metadata.examYear, exam_session: metadata.examSession, course_code: metadata.courseCode, paper_variant: metadata.paperVariant, mime_type: mime, file_size: bytes.length, ingestion_status: !text ? "failed" : embeddingKey ? "embedding" : "ready", ingestion_error: !text ? "No readable text could be extracted from this file; check the original or run OCR." : null, metadata_confidence: metadata.confidence, target_years: [] };
      const materialRows = await request(`${supabaseUrl}/rest/v1/materials?on_conflict=archive_path`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(material) });
      const materialId = materialRows?.[0]?.id || proposedMaterialId;
      if (!text) continue;
      const existing = await rest("ai_documents", `?material_id=eq.${materialId}&select=id&limit=1`);
      const documentId = existing[0]?.id || crypto.randomUUID();
      if (existing.length) await request(`${supabaseUrl}/rest/v1/ai_documents?id=eq.${documentId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ title: metadata.title, citation: `${metadata.courseCode} · ${metadata.examSession} · ${metadata.examYear || "year unknown"}`, embedding_model: embeddingKey ? embeddingModel : null, ingestion_status: embeddingKey ? "embedding" : "ready", ingestion_error: null }) });
      else await request(`${supabaseUrl}/rest/v1/ai_documents`, { method: "POST", body: JSON.stringify({ id: documentId, owner: null, scope: "library", title: metadata.title, citation: `${metadata.courseCode} · ${metadata.examSession} · ${metadata.examYear || "year unknown"}`, target_years: [], material_id: materialId, embedding_model: embeddingKey ? embeddingModel : null, ingestion_status: embeddingKey ? "embedding" : "ready" }) });
      await request(`${supabaseUrl}/rest/v1/ai_chunks?document_id=eq.${documentId}`, { method: "DELETE" });
      for (let start = 0; start < chunks.length; start += 100) {
        const batch = chunks.slice(start, start + 100);
        const vectors = embeddingKey ? await embed(batch) : null;
        await request(`${supabaseUrl}/rest/v1/ai_chunks`, { method: "POST", body: JSON.stringify(batch.map((content, offset) => ({ document_id: documentId, owner: null, scope: "library", idx: start + offset, content, embedding: vectors?.[offset] || null, embedding_model: vectors ? embeddingModel : null }))) });
      }
      await request(`${supabaseUrl}/rest/v1/materials?id=eq.${materialId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ingestion_status: "ready" }) });
    }
    if (dryRun) await fs.writeFile("past-paper-ingestion-manifest.json", JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2));
    console.log(`Completed ${manifest.length} files.`);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error.stack || error.message || error); process.exitCode = 1; });
