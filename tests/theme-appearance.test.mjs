import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getThemePreset,
  normalizeThemeId,
  resolveWallpaper,
  THEME_PRESETS,
} from "../src/lib/appearance.ts";

const wallpaperPath = (path) => resolve(process.cwd(), "public", path.replace(/^\//, ""));

test("the shared theme gallery includes the requested seasonal and study wallpapers", () => {
  for (const id of ["halloween", "dark", "forest", "ocean", "nairobi"]) {
    const theme = getThemePreset(id);
    assert.ok(theme.wallpaper, `${id} should have a wallpaper`);
    assert.ok(existsSync(wallpaperPath(theme.wallpaper)), `${theme.wallpaper} should exist`);
  }
  assert.equal(THEME_PRESETS.length, 6);
});

test("custom wallpaper takes precedence over a preset wallpaper", () => {
  assert.equal(
    resolveWallpaper("halloween", "https://storage.test/my-wallpaper.webp", "https://storage.test/avatar.webp"),
    "https://storage.test/my-wallpaper.webp",
  );
});

test("the profile avatar is never used as a wallpaper, including legacy matches", () => {
  const avatar = "https://storage.test/profile-picture.webp";
  assert.equal(resolveWallpaper("halloween", avatar, avatar), "/wallpapers/halloween-study.webp");
  assert.equal(resolveWallpaper("light", "", avatar), "");
  assert.equal(
    resolveWallpaper("nairobi", "https://storage.test/profile/photo.webp?token=wallpaper", "https://storage.test/profile/photo.webp?token=avatar"),
    "/wallpapers/nairobi-study.webp",
  );
});

test("unknown theme IDs safely fall back to Classic Paper", () => {
  assert.equal(normalizeThemeId("not-a-theme"), "light");
  assert.equal(resolveWallpaper("not-a-theme", "", ""), "");
});

test("the app no longer restores an unscoped legacy wallpaper value", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /localStorage\.getItem\(["']group13-wallpaper["']\)/);
  assert.match(app, /resolveWallpaper\(themeId,\s*profile\.wallpaperUrl,\s*profile\.avatarUrl\)/);
});
