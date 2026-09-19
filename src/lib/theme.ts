export const DEFAULT_ACCENT = "#0D9488";

export const accentPresets = [
  { label: "Classic Teal", value: "#0D9488" },
  { label: "Dark Blue", value: "#1E3A8A" },
  { label: "Deep Purple", value: "#7C3AED" },
  { label: "Slate", value: "#475569" },
] as const;

export const isHex = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

/** Readable text color for a hex accent, so light accents stay legible. */
export function accentForeground(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return luminance > 0.45 ? "oklch(0.2 0.025 250)" : "oklch(0.99 0 0)";
}

export function applyAppearance(theme: "light" | "dark", accent: string) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.setProperty("--user-accent", accent);
  root.style.setProperty("--accent-on", accentForeground(accent));
}

/** Restore the saved appearance on routes that can be opened directly. */
export function applySavedAppearance() {
  if (typeof window === "undefined") return;
  const theme = window.localStorage.getItem("orbis-theme") === "dark" ? "dark" : "light";
  const saved = window.localStorage.getItem("orbis-accent");
  applyAppearance(theme, saved && isHex(saved) ? saved : DEFAULT_ACCENT);
}
