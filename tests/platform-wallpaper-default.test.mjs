import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261102201057_platform_wallpaper_default.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/data/repository.ts", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../src/AdminPage.tsx", import.meta.url), "utf8");
const adminControl = readFileSync(new URL("../src/PlatformAppearanceAdmin.tsx", import.meta.url), "utf8");

test("the primary-admin wallpaper control is absent from non-primary admin views", () => {
  assert.match(adminPage, /canManageAdmins\s*&&\s*<PlatformAppearanceAdmin/);
  assert.match(adminControl, /aria-labelledby="platform-wallpaper-title"/);
  assert.match(adminControl, /repository\.adminSetDefaultWallpaperTheme\(selectedTheme\)/);
  assert.match(adminControl, /platform-wallpaper-default-change/);
});

test("users keep explicit personal theme selections while unset accounts use the site default", () => {
  assert.match(app, /appearance_theme_selected/);
  assert.match(app, /resolveProfileTheme\(/);
  assert.match(app, /appearanceThemeUserSelected/);
  assert.match(repository, /getDefaultWallpaperTheme/);
});

test("the platform setting is publicly readable but only the primary admin can write it", () => {
  assert.match(migration, /alter table public\.site_appearance_settings enable row level security/i);
  assert.match(migration, /for select\s+to anon, authenticated\s+using \(true\)/i);
  assert.match(migration, /revoke all on table public\.site_appearance_settings from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.site_appearance_settings to anon, authenticated/i);
  assert.match(migration, /auth\.uid\(\) is null or not coalesce\(public\.is_primary_admin\(\), false\)/i);
  assert.match(migration, /grant execute on function public\.admin_set_default_wallpaper_theme\(text\) to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.admin_set_default_wallpaper_theme\(text\) to anon/i);
});
