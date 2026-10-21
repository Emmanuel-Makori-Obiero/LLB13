import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261021184202_arena_ai_player_identity.sql", import.meta.url), "utf8");
const aiMigration = readFileSync(new URL("../supabase/migrations/029_arena_points_matchmaking_ai.sql", import.meta.url), "utf8");
const grants = readFileSync(new URL("../supabase/migrations/031_arena_authenticated_read_grants.sql", import.meta.url), "utf8");

test("AI debate player, winner, and message identities are accepted without trusting arbitrary IDs", () => {
  assert.match(aiMigration, /bot_id uuid := '00000000-0000-0000-0000-000000000001'/);
  assert.match(migration, /drop constraint if exists debate_rooms_player_two_id_fkey/i);
  assert.match(migration, /drop constraint if exists debate_rooms_winner_id_fkey/i);
  assert.match(migration, /drop constraint if exists debate_messages_user_id_fkey/i);
  assert.match(migration, /exists \(select 1 from auth\.users u where u\.id = new\.player_two_id\)[\s\S]*?exists \(select 1 from public\.debate_ai_players ai where ai\.user_id = new\.player_two_id\)/i);
  assert.match(migration, /new\.winner_id is distinct from new\.player_one_id[\s\S]*?new\.winner_id is distinct from new\.player_two_id/i);
  assert.match(migration, /r\.player_one_id = new\.user_id or r\.player_two_id = new\.user_id/i);
  assert.match(migration, /security definer/i);
});

test("the identity migration preserves account deletion cleanup and authenticated clients remain read-only", () => {
  assert.match(migration, /after delete on auth\.users/i);
  assert.match(migration, /delete from public\.debate_messages where user_id = old\.id/i);
  assert.match(migration, /case when player_two_id = old\.id then null else player_two_id end/i);
  assert.match(migration, /case when winner_id = old\.id then null else winner_id end/i);
  assert.match(grants, /revoke all on table public\.debate_rooms, public\.debate_messages[\s\S]*?from anon, public/i);
  assert.match(grants, /grant select on table public\.debate_rooms, public\.debate_messages/i);
  assert.doesNotMatch(grants, /grant (?:insert|update|delete)[\s\S]*?debate_rooms|grant (?:insert|update|delete)[\s\S]*?debate_messages/i);
});
