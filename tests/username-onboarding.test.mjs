import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const messages = readFileSync(new URL("../src/MessagesPage.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261110182501_optional_unlimited_usernames.sql", import.meta.url), "utf8");
const promptCss = readFileSync(new URL("../src/username-prompt.css", import.meta.url), "utf8");

test("username setup can be dismissed for this account on this device", () => {
  assert.match(app, /username-prompt-dismissed:\$\{userId\}/);
  assert.match(app, /window\.localStorage\.getItem\(`username-prompt-dismissed:/);
  assert.match(app, /window\.localStorage\.setItem\(`username-prompt-dismissed:/);
  assert.match(app, /setUsernamePromptOpen\(!value && !promptDismissed\)/);
  assert.match(app, /onLater=\{deferUsernamePrompt\}/);
  assert.match(app, /aria-label="Close username setup"/);
  assert.match(app, /className="username-prompt-later"[^>]*>Later<\/button>/);
  assert.match(promptCss, /@media\(max-width:520px\)/);
  assert.doesNotMatch(app, /autoFocus required value=\{value\}/);
});

test("username accepts letters without digits and has no application-defined length limit", () => {
  assert.ok(app.includes("/^[a-z0-9._]+$/"));
  assert.doesNotMatch(app, /maxLength=\{30\}|\{3,30\}/);
  assert.doesNotMatch(messages, /minLength=\{3\}|maxLength=\{30\}|username\.length < 3/);
  assert.match(messages, /Numbers are optional; there is no character-count limit/);
  assert.match(migration, /drop constraint if exists user_directory_username_check/);
  assert.match(migration, /drop constraint if exists user_directory_username_key/);
  assert.match(migration, /create unique index if not exists user_directory_username_hash_idx\s+on public\.user_directory \(md5\(username\)\)/);
  assert.ok(migration.includes("username ~ '^[a-z0-9._]+$'"));
  assert.doesNotMatch(migration, /\{3,30\}|length\(normalized\)|char_length\(normalized\)/);
});
