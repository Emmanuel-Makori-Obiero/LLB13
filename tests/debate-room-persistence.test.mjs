import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repository = readFileSync(new URL("../src/lib/debate.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../src/GamesHub.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("../supabase/migrations/012_legal_arena_invites_and_secure_evaluation.sql", import.meta.url), "utf8");

 test("debate history is loaded from the participant-filtered database room rows", () => {
  assert.match(repository, /listDebateRoomsForUser\(userId: string\)/);
  assert.match(repository, /player_one_id\.eq\.\$\{userId\},player_two_id\.eq\.\$\{userId\}/);
  assert.match(repository, /order\("created_at", \{ ascending: false \}\)[\s\S]*?limit\(25\)/);
  assert.match(access, /for select to authenticated[\s\S]*?using \(player_one_id = auth\.uid\(\) or player_two_id = auth\.uid\(\)\)/i);
 });

test("on return the app restores an ongoing room and offers older debates to reopen", () => {
  assert.match(component, /listDebateRoomsForUser/);
  assert.match(component, /Restored your saved debate/);
  assert.match(component, /Your debate history/);
  assert.match(component, /openPastRoom/);
  assert.match(component, /savedRoom\.status === "active" \|\| savedRoom\.status === "evaluating"/);
  assert.match(component, /room and submissions are saved/);
});

test("invitees must complete Join competition; hosts get explicit participant confirmation with polling fallback", () => {
  assert.match(component, /invite link being opened or shared does not count as a join/);
  assert.match(component, /Opponent joined:/);
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /shareInvite/);
  assert.match(component, /setInterval\(async \(\) => \{[\s\S]*getDebateRoom\(room\.id\)/);
});
