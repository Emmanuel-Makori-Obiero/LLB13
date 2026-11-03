export type ThemeMode = "light" | "dark";

export const THEME_PRESETS = [
  {
    id: "light",
    label: "Classic Paper",
    description: "Warm paper tones with no photo backdrop.",
    mode: "light",
    wallpaper: "",
    accent: "#163a34",
  },
  {
    id: "dark",
    label: "Midnight Library",
    description: "A quiet, deep-green study after hours.",
    mode: "dark",
    wallpaper: "/wallpapers/midnight-library.webp",
    accent: "#d0a76d",
  },
  {
    id: "halloween",
    label: "Halloween Study",
    description: "Warm lanterns, autumn leaves, and a little seasonal magic.",
    mode: "dark",
    wallpaper: "/wallpapers/halloween-study.webp",
    accent: "#f0a44b",
  },
  {
    id: "forest",
    label: "Forest Focus",
    description: "Soft green views for a calm study session.",
    mode: "dark",
    wallpaper: "/wallpapers/forest-study.webp",
    accent: "#95bd83",
  },
  {
    id: "ocean",
    label: "Ocean Calm",
    description: "Cool blue light and a peaceful coastal desk.",
    mode: "dark",
    wallpaper: "/wallpapers/ocean-study.webp",
    accent: "#72c4d7",
  },
  {
    id: "nairobi",
    label: "Nairobi Dawn",
    description: "A golden city sunrise from a quiet library.",
    mode: "light",
    wallpaper: "/wallpapers/nairobi-study.webp",
    accent: "#a85e31",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  mode: ThemeMode;
  wallpaper: string;
  accent: string;
}[];

export type ThemeId = (typeof THEME_PRESETS)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return THEME_PRESETS.some((theme) => theme.id === value);
}

export function normalizeThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : "light";
}

export function hasPersonalThemeSelection(themeId: unknown, selectedFlag: unknown): boolean {
  if (selectedFlag === true) return true;
  if (selectedFlag === false) return false;
  // Before the explicit flag existed, only non-default preset IDs could reliably
  // indicate a deliberate choice; preserve those legacy selections.
  return isThemeId(themeId) && themeId !== "light";
}

export function resolveProfileTheme(
  personalTheme: unknown,
  selectedFlag: unknown,
  platformDefault: unknown,
): ThemeId {
  return normalizeThemeId(
    hasPersonalThemeSelection(personalTheme, selectedFlag)
      ? personalTheme
      : platformDefault,
  );
}

export function getThemePreset(value: unknown) {
  const id = normalizeThemeId(value);
  return THEME_PRESETS.find((theme) => theme.id === id) ?? THEME_PRESETS[0];
}

export function hasCustomWallpaper(customWallpaper: unknown, avatarUrl: unknown): boolean {
  const custom = typeof customWallpaper === "string" ? customWallpaper.trim() : "";
  const avatar = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  if (!custom) return false;
  if (!avatar) return true;
  const assetIdentity = (value: string) => {
    try {
      const url = new URL(value, "https://llb13.local");
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.split(/[?#]/, 1)[0];
    }
  };
  return assetIdentity(custom) !== assetIdentity(avatar);
}

export function resolveWallpaper(
  themeId: unknown,
  customWallpaper: unknown,
  avatarUrl: unknown,
): string {
  const custom = typeof customWallpaper === "string" ? customWallpaper.trim() : "";
  if (hasCustomWallpaper(custom, avatarUrl)) return custom;
  return getThemePreset(themeId).wallpaper;
}
