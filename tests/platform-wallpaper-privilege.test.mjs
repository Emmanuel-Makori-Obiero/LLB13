import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hardeningMigration = readFileSync(new URL("../supabase/migrations/20261102201200_platform_wallpaper_default_anon_hardening.sql", import.meta.url), "utf8");

test("anonymous users cannot execute the platform wallpaper setter", () => {
  assert.match(hardeningMigration, /revoke all on function public\.admin_set_default_wallpaper_theme\(text\) from anon/i);
});
