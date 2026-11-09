import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const constitution = require("../src/data/constitution-2010.json");

const articles = constitution.chapters.flatMap((chapter) => chapter.articles);

test("the standalone Constitution source contains the preamble, 18 chapters and all Articles 1–264", () => {
  assert.ok(constitution.preamble.trim().length > 500);
  assert.equal(constitution.chapters.length, 18);
  assert.equal(articles.length, 264);
  assert.deepEqual(articles.map((article) => article.number), Array.from({ length: 264 }, (_, index) => index + 1));
  assert.ok(articles.every((article) => article.title.trim() && article.text.trim()));
  assert.equal(constitution.chapters[0].articles[0].number, 1);
  assert.equal(constitution.chapters.at(-1).articles.at(-1).number, 264);
});

test("chapter article ranges do not omit or duplicate provisions", () => {
  const chapterArticleNumbers = constitution.chapters.map((chapter) => chapter.articles.map((article) => article.number));
  assert.deepEqual(chapterArticleNumbers.flat(), Array.from({ length: 264 }, (_, index) => index + 1));
  for (const chapter of constitution.chapters) {
    assert.ok(chapter.title.length > 2);
    assert.equal(chapter.firstArticle, chapter.articles[0].number);
  }
});

test("Part headings remain navigable structural labels and do not bleed into prior Articles", () => {
  const parts = constitution.chapters.flatMap((chapter) => chapter.parts.map((part) => ({ chapter, part })));
  assert.ok(parts.length > 0);
  for (const { chapter, part } of parts) {
    assert.ok(part.title.trim());
    assert.ok(chapter.articles.some((article) => article.number === part.beforeArticle));
  }
  for (const number of [25, 58, 80, 254, 260]) {
    const article = articles.find((entry) => entry.number === number);
    assert.doesNotMatch(article.text.slice(-100), /Constitution of Kenya|Chapter (?:Sixteen|Seventeen|Eighteen)/i);
  }
});

test("all six schedules are present and include their complete section text", () => {
  assert.deepEqual(constitution.schedules.map((schedule) => schedule.number), ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH"]);
  assert.ok(constitution.schedules.every((schedule) => schedule.text.startsWith(`${schedule.number} SCHEDULE`) && schedule.text.length > 500));
});

test("Constitution reading text uses dark ink on a paper surface in every app theme", () => {
  const styles = readFileSync(new URL("../src/constitution.css", import.meta.url), "utf8");
  assert.ok(styles.includes(".constitution-page{--ink:#17211a;--card:#fffefa;"));
  assert.ok(styles.includes(".constitution-verbatim{color:#17211a;font-size:17px;"));
  assert.ok(styles.includes("@media(max-width:820px){.constitution-page .constitution-verbatim{font-size:16px;"));
});

test("source edition, attribution, feature route and unchanged PDF download are declared", () => {
  assert.equal(constitution.edition, "2010-09-03");
  assert.match(constitution.attribution, /Kenya Law and Laws\.Africa/);
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/ConstitutionPage.tsx", import.meta.url), "utf8");
  assert.match(app, /id: "constitution", label: "Constitution"/);
  assert.match(page, /href="\/constitution\/ConstitutionofKenya-2010\.pdf" download/);
  assert.ok(statSync(new URL("../public/constitution/ConstitutionofKenya-2010.pdf", import.meta.url)).size > 1_000_000);
});
