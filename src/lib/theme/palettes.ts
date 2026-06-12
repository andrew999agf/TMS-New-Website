/**
 * Theme system — five curated color palettes and five curated font palettes.
 *
 * Every palette is a complete token set. Switching is instant and site-wide:
 * the active palette is rendered to CSS custom properties on <html> (see
 * `themeToCssVars`), and all components read those variables via Tailwind's
 * arbitrary-value syntax or the semantic classes in globals.css.
 *
 * All fonts are OFL/Apache licensed (loaded in src/app/fonts.ts). All color
 * palettes are tuned for WCAG AA on their primary text/background pairings.
 *
 * NOTE: These are the *defaults*. The admin Appearance tab persists the active
 * selection (and any custom token overrides) in the database; see
 * `lib/theme/active.ts`.
 */

export type ColorTokens = {
  /** App background — the "paper" */
  bg: string;
  /** Raised surface (cards) */
  surface: string;
  /** Second surface step (insets, code, subtle fills) */
  surface2: string;
  /** Primary text — the "ink" */
  ink: string;
  /** Muted/secondary text */
  inkMuted: string;
  /** Hairline borders */
  border: string;
  /** Authoritative accent (CTAs, key terms) */
  accent: string;
  /** Accent hover/pressed */
  accent2: string;
  /** Text/icon color on top of accent */
  onAccent: string;
  /** Glossary-term highlight (must be visibly distinct from link color) */
  term: string;
  /** Link color */
  link: string;
  /** Form success */
  success: string;
  /** Form error / urgency flags */
  error: string;
  /** ---- Dark context (hero, footer, dark bands) ---- */
  darkBg: string;
  darkSurface: string;
  darkInk: string;
  darkInkMuted: string;
  darkBorder: string;
  /** Accent variant that reads well on the dark context */
  darkAccent: string;
};

export type ColorPalette = {
  id: string;
  name: string;
  description: string;
  tokens: ColorTokens;
};

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "oxblood-bone",
    name: "Oxblood & Bone",
    description: "Warm bone paper, near-black ink, deep oxblood accent. The default.",
    tokens: {
      bg: "#F6F3EC",
      surface: "#FFFFFF",
      surface2: "#EFEAE0",
      ink: "#1A1714",
      inkMuted: "#5C544B",
      border: "#DAD2C5",
      accent: "#7A1F2B",
      accent2: "#5E1620",
      onAccent: "#FBF7F0",
      term: "#A8642A",
      link: "#7A1F2B",
      success: "#2F6B43",
      error: "#A12B1E",
      darkBg: "#14110F",
      darkSurface: "#1E1A17",
      darkInk: "#F4EFE7",
      darkInkMuted: "#A89E92",
      darkBorder: "#332C26",
      darkAccent: "#C46A52",
    },
  },
  {
    id: "bronze-slate",
    name: "Bronze & Slate",
    description: "Charcoal-slate neutrals with a dark bronze/gold accent.",
    tokens: {
      bg: "#F4F4F2",
      surface: "#FFFFFF",
      surface2: "#E8E8E4",
      ink: "#17191C",
      inkMuted: "#565A60",
      border: "#D5D5D0",
      accent: "#8A6A2F",
      accent2: "#6E5325",
      onAccent: "#FBF8F1",
      term: "#3F6E7A",
      link: "#6E5325",
      success: "#2E6A4A",
      error: "#9E2C24",
      darkBg: "#121417",
      darkSurface: "#1C1F23",
      darkInk: "#EFEFEC",
      darkInkMuted: "#9CA0A6",
      darkBorder: "#2B2F34",
      darkAccent: "#C49A52",
    },
  },
  {
    id: "steel-blue",
    name: "Counsel Steel",
    description: "Cool stone neutrals, authoritative steel-blue accent.",
    tokens: {
      bg: "#F3F5F7",
      surface: "#FFFFFF",
      surface2: "#E6EAEE",
      ink: "#15191E",
      inkMuted: "#525964",
      border: "#D2D8DE",
      accent: "#274B6D",
      accent2: "#1C3954",
      onAccent: "#F4F8FB",
      term: "#9A5B2C",
      link: "#274B6D",
      success: "#2C6A4B",
      error: "#A02C22",
      darkBg: "#0F1419",
      darkSurface: "#171E25",
      darkInk: "#EEF2F6",
      darkInkMuted: "#97A1AC",
      darkBorder: "#26303A",
      darkAccent: "#5E8FBC",
    },
  },
  {
    id: "forest-parchment",
    name: "Forest & Parchment",
    description: "Parchment paper with a deep forest-green accent.",
    tokens: {
      bg: "#F5F4ED",
      surface: "#FFFFFF",
      surface2: "#EAE8DC",
      ink: "#161915",
      inkMuted: "#555B50",
      border: "#D7D4C5",
      accent: "#2C4A33",
      accent2: "#203829",
      onAccent: "#F4F7F0",
      term: "#9A5A2A",
      link: "#2C4A33",
      success: "#2C6A45",
      error: "#9E2C22",
      darkBg: "#11140F",
      darkSurface: "#1A1E16",
      darkInk: "#EFF1E9",
      darkInkMuted: "#9AA092",
      darkBorder: "#272C20",
      darkAccent: "#6E9A70",
    },
  },
  {
    id: "ink-brass",
    name: "Ink & Brass",
    description: "High-contrast graphite monochrome with a brass accent.",
    tokens: {
      bg: "#F2F2F0",
      surface: "#FFFFFF",
      surface2: "#E5E5E2",
      ink: "#111111",
      inkMuted: "#54534F",
      border: "#D2D2CD",
      accent: "#9A7B33",
      accent2: "#7C6228",
      onAccent: "#FAF7EF",
      term: "#3D5A6B",
      link: "#1F1F1F",
      success: "#2E6A48",
      error: "#9E2A22",
      darkBg: "#0E0E0D",
      darkSurface: "#1A1A18",
      darkInk: "#F1F1ED",
      darkInkMuted: "#9B9B94",
      darkBorder: "#292927",
      darkAccent: "#C7A24E",
    },
  },
];

export type FontPalette = {
  id: string;
  name: string;
  description: string;
  /** CSS variable names produced by next/font (see src/app/fonts.ts) */
  display: string;
  body: string;
  ui: string;
  /** Human-readable family names for the admin specimen cards */
  displayLabel: string;
  bodyLabel: string;
};

export const FONT_PALETTES: FontPalette[] = [
  {
    id: "editorial",
    name: "Editorial",
    description: "Fraunces display with Inter body. Expensive magazine register.",
    display: "var(--font-fraunces)",
    body: "var(--font-inter)",
    ui: "var(--font-inter)",
    displayLabel: "Fraunces",
    bodyLabel: "Inter",
  },
  {
    id: "newsreader",
    name: "Newsreader",
    description: "Newsreader display with IBM Plex Sans. Literary, calm authority.",
    display: "var(--font-newsreader)",
    body: "var(--font-plex-sans)",
    ui: "var(--font-plex-sans)",
    displayLabel: "Newsreader",
    bodyLabel: "IBM Plex Sans",
  },
  {
    id: "spectral",
    name: "Spectral",
    description: "Spectral display with Public Sans. Government-grade gravitas.",
    display: "var(--font-spectral)",
    body: "var(--font-public-sans)",
    ui: "var(--font-public-sans)",
    displayLabel: "Spectral",
    bodyLabel: "Public Sans",
  },
  {
    id: "caslon",
    name: "Libre Caslon",
    description: "Libre Caslon Display with Figtree. Classic law-book lineage.",
    display: "var(--font-caslon)",
    body: "var(--font-figtree)",
    ui: "var(--font-figtree)",
    displayLabel: "Libre Caslon Display",
    bodyLabel: "Figtree",
  },
  {
    id: "source",
    name: "Source Serif",
    description: "Source Serif 4 with Inter Tight. Crisp, modern, technical.",
    display: "var(--font-source-serif)",
    body: "var(--font-inter-tight)",
    ui: "var(--font-inter-tight)",
    displayLabel: "Source Serif 4",
    bodyLabel: "Inter Tight",
  },
];

export const DEFAULT_COLOR_PALETTE_ID = "oxblood-bone";
export const DEFAULT_FONT_PALETTE_ID = "editorial";

export function getColorPalette(id: string | null | undefined): ColorPalette {
  return (
    COLOR_PALETTES.find((p) => p.id === id) ??
    COLOR_PALETTES.find((p) => p.id === DEFAULT_COLOR_PALETTE_ID)!
  );
}

export function getFontPalette(id: string | null | undefined): FontPalette {
  return (
    FONT_PALETTES.find((p) => p.id === id) ??
    FONT_PALETTES.find((p) => p.id === DEFAULT_FONT_PALETTE_ID)!
  );
}

/** Token -> CSS custom property name. Single source of truth. */
export const COLOR_VAR: Record<keyof ColorTokens, string> = {
  bg: "--c-bg",
  surface: "--c-surface",
  surface2: "--c-surface-2",
  ink: "--c-ink",
  inkMuted: "--c-ink-muted",
  border: "--c-border",
  accent: "--c-accent",
  accent2: "--c-accent-2",
  onAccent: "--c-on-accent",
  term: "--c-term",
  link: "--c-link",
  success: "--c-success",
  error: "--c-error",
  darkBg: "--c-dark-bg",
  darkSurface: "--c-dark-surface",
  darkInk: "--c-dark-ink",
  darkInkMuted: "--c-dark-ink-muted",
  darkBorder: "--c-dark-border",
  darkAccent: "--c-dark-accent",
};
