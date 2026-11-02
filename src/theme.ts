import { useEffect, useState } from "react";
import { getThemePreset, normalizeThemeId, type ThemeId } from "./lib/appearance";

export type Theme = "light" | "dark";
const STORAGE_KEY = "group13-theme";

function initialTheme(): ThemeId {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeThemeId(saved);
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [themeId, setThemeId] = useState<ThemeId>(initialTheme);
  const theme = getThemePreset(themeId).mode;

  useEffect(() => {
    const preset = getThemePreset(themeId);
    document.documentElement.dataset.theme = preset.mode;
    document.documentElement.dataset.skin = preset.id;
    window.localStorage.setItem(STORAGE_KEY, preset.id);
  }, [themeId]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<ThemeId>).detail;
      if (next) setThemeId(normalizeThemeId(next));
    };
    window.addEventListener("group13-theme-change", onThemeChange);
    return () => window.removeEventListener("group13-theme-change", onThemeChange);
  }, []);

  const setTheme = (value: ThemeId) => {
    const next = normalizeThemeId(value);
    setThemeId(next);
    window.dispatchEvent(new CustomEvent<ThemeId>("group13-theme-change", { detail: next }));
  };
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, themeId, setTheme, toggleTheme };
}
