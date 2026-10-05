#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const USER_AGENT = "LLB13-KenyaLawResearch/1.0 (polite public-case search; contact project owner)";
const DEFAULT_OUTPUT = path.resolve("data/kenya-law-index.json");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function args(argv) {
  const out = { queries: [], output: DEFAULT_OUTPUT, headed: false, profile: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--query") out.queries.push(argv[++i] ?? "");
    else if (value === "--output") out.output = path.resolve(argv[++i] ?? DEFAULT_OUTPUT);
    else if (value === "--headed") out.headed = true;
    else if (value === "--profile") out.profile = path.resolve(argv[++i] ?? "");
    else if (value === "--help") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Usage:\n  node tools/kenya-law-browser-indexer/index.mjs --query Gachagua\n\nOptions:\n  --query <text>     Search public Kenya Law judgments; repeat for more queries\n  --output <file>    JSON cache destination (default: data/kenya-law-index.json)\n  --headed           Show the browser while searching\n  --profile <dir>    Reuse a local Chromium profile, if desired\n\nThe worker only reads public pages, waits between requests, preserves official URLs,\nand stops if Kenya Law presents a CAPTCHA, login, or access-denied page. It does\nnot bypass protections or bulk-download judgment files.`);
}

function normalizeUrl(value) {
  try {
    const url = new URL(value, "https://new.kenyalaw.org");
    if (!/(^|\.)kenyalaw\.org$/i.test(url.hostname)) return null;
    if (!url.pathname.includes("/akn/ke/judgment/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function readCache(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return { generatedAt: null, results: [] }; }
}

async function main() {
  const options = args(process.argv);
  if (options.help || options.queries.length === 0) { printHelp(); process.exit(options.help ? 0 : 1); }
  const cache = await readCache(options.output);
  const byUrl = new Map((cache.results ?? []).map((item) => [item.url, item]));
  const contextOptions = { userAgent: USER_AGENT, viewport: { width: 1280, height: 900 } };
  if (options.profile) contextOptions.storageState = undefined;
  const browser = options.profile
    ? await chromium.launchPersistentContext(options.profile, { ...contextOptions, headless: !options.headed })
    : await chromium.launch({ headless: !options.headed });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  try {
    for (const query of options.queries.map((item) => item.trim()).filter(Boolean)) {
      const url = `https://new.kenyalaw.org/search/?show-advanced-tab=1&nature=Judgment&q=${encodeURIComponent(query)}`;
      console.log(`Searching public Kenya Law: ${query}`);
      const response = await page.goto(url, { waitUntil: "domcontentloaded" });
      await wait(1800);
      const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (response?.status() === 403 || /captcha|access denied|robot check|sign in to continue/.test(bodyText)) {
        throw new Error("Kenya Law presented an access check or login page; the worker stopped without bypassing it.");
      }
      const rows = await page.locator('a[href*="/akn/ke/judgment/"]').evaluateAll((links) => links.map((link) => ({ href: link.href, title: link.textContent })));
      let added = 0;
      for (const row of rows) {
        const officialUrl = normalizeUrl(row.href);
        const title = cleanTitle(row.title);
        if (!officialUrl || title.length < 8) continue;
        const citation = title.match(/\[\d{4}\]\s+[A-Z]+\s+\d+\s+\(KLR\)/i)?.[0] ?? null;
        if (!byUrl.has(officialUrl)) { byUrl.set(officialUrl, { title, url: officialUrl, citation, queries: [query], indexedAt: new Date().toISOString() }); added += 1; }
        else {
          const item = byUrl.get(officialUrl);
          item.queries = [...new Set([...(item.queries ?? []), query])];
        }
      }
      console.log(`  found ${rows.length} links, added ${added} new official results`);
      await wait(2500);
    }
  } finally {
    await browser.close();
  }
  const results = [...byUrl.values()].sort((a, b) => String(b.indexedAt).localeCompare(String(a.indexedAt)));
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + "\n");
  console.log(`Saved ${results.length} cached results to ${options.output}`);
}

main().catch((error) => { console.error(`Indexer stopped: ${error.message}`); process.exitCode = 1; });
