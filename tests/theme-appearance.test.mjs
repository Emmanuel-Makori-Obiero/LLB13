import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getThemePreset,
  hasCustomWallpaper,
  hasPersonalThemeSelection,
  normalizeThemeId,
  resolveProfileTheme,
  resolveWallpaper,
  THEME_PRESETS,
} from "../src/lib/appearance.ts";

const wallpaperPath = (path) => resolve(process.cwd(), "public", path.replace(/^\//, ""));
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("the shared theme gallery includes the requested seasonal and study wallpapers", () => {
  for (const id of ["halloween", "dark", "forest", "ocean", "nairobi"]) {
    const theme = getThemePreset(id);
    assert.ok(theme.wallpaper, `${id} should have a wallpaper`);
    assert.ok(existsSync(wallpaperPath(theme.wallpaper)), `${theme.wallpaper} should exist`);
  }
  assert.equal(THEME_PRESETS.length, 6);
});

test("custom wallpaper takes precedence over a preset wallpaper", () => {
  assert.equal(hasCustomWallpaper("https://storage.test/my-wallpaper.webp", "https://storage.test/avatar.webp"), true);
  assert.equal(
    resolveWallpaper("halloween", "https://storage.test/my-wallpaper.webp", "https://storage.test/avatar.webp"),
    "https://storage.test/my-wallpaper.webp",
  );
});

test("the profile avatar is never used as a wallpaper, including legacy matches", () => {
  const avatar = "https://storage.test/profile-picture.webp";
  assert.equal(hasCustomWallpaper(avatar, avatar), false);
  assert.equal(hasCustomWallpaper("https://storage.test/profile/photo.webp?token=wallpaper", "https://storage.test/profile/photo.webp?token=avatar"), false);
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

test("dark mode keeps the wallpaper image layer instead of resetting it with a background shorthand", () => {
  const darkBodyRule = styles.match(/:root\[data-theme="dark"\] body\s*\{([^}]+)\}/);
  assert.ok(darkBodyRule, "dark mode should define body colors");
  assert.doesNotMatch(darkBodyRule[1], /\bbackground\s*:/, "a high-specificity shorthand would erase background-image");
  assert.match(styles, /html, body\s*\{[^}]*background-image:\s*linear-gradient\([^}]+var\(--user-wallpaper\)/);
  assert.match(styles, /:root\[data-theme="dark"\] html, :root\[data-theme="dark"\] body \{ background-color: var\(--paper\); \}/);
});

test("platform defaults apply only when a user has not selected a personal theme", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /hasCustomWallpaper\(profile\.wallpaperUrl, profile\.avatarUrl\)/);
  assert.equal(hasPersonalThemeSelection("halloween", undefined), true, "legacy non-default choices remain personal");
  assert.equal(hasPersonalThemeSelection("light", true), true, "an explicit Classic Paper choice remains personal");
  assert.equal(hasPersonalThemeSelection("forest", false), false, "an explicit unset marker takes precedence over a fallback value");
  assert.equal(resolveProfileTheme("halloween", undefined, "ocean"), "halloween");
  assert.equal(resolveProfileTheme("light", true, "ocean"), "light");
  assert.equal(resolveProfileTheme(undefined, false, "nairobi"), "nairobi");
  assert.equal(resolveProfileTheme(undefined, false, null), "light");
});
