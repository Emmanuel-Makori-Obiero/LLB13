import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "group13-theme";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "dark" || next === "light") setTheme(next);
    };
    window.addEventListener("group13-theme-change", onThemeChange);
    return () => window.removeEventListener("group13-theme-change", onThemeChange);
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.dispatchEvent(new CustomEvent<Theme>("group13-theme-change", { detail: next }));
  };
  return { theme, toggleTheme };
}
