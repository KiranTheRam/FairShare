export type ThemeId = "dark" | "forest" | "light" | "sunset";

export const THEME_IDS: readonly ThemeId[] = ["dark", "forest", "light", "sunset"] as const;

// Preview swatches let the theme picker render a faithful miniature of each
// palette without switching the whole page. Values mirror globals.css.
export const THEMES: ReadonlyArray<{
  id: ThemeId;
  name: string;
  tagline: string;
  preview: { canvas: string; paper: string; hero: string; primary: string; accent: string };
}> = [
  {
    id: "dark",
    name: "Neutral Dark",
    tagline: "Calm, low-glare default",
    preview: { canvas: "#0b0c0f", paper: "#15171b", hero: "linear-gradient(135deg, #252a3a, #171921)", primary: "#8ea6ff", accent: "#f07b65" },
  },
  {
    id: "forest",
    name: "Forest Green",
    tagline: "The original deep green",
    preview: { canvas: "#08110e", paper: "#101a16", hero: "linear-gradient(135deg, #173c32, #0b211b)", primary: "#54bfa0", accent: "#f07b65" },
  },
  {
    id: "light",
    name: "Daylight",
    tagline: "Porcelain and fresh emerald",
    preview: { canvas: "#f6f6f1", paper: "#ffffff", hero: "linear-gradient(135deg, #11624e, #0a3d31)", primary: "#0c7a5e", accent: "#ee6a4d" },
  },
  {
    id: "sunset",
    name: "Sunset",
    tagline: "Amber, terracotta, and plum",
    preview: { canvas: "#faf1e5", paper: "#fffdf8", hero: "linear-gradient(135deg, #c9721f, #b04326 55%, #6d2438)", primary: "#b3502a", accent: "#d9542f" },
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}
