import {
  COLOR_VAR,
  getColorPalette,
  getFontPalette,
  type ColorTokens,
} from "./palettes";

export type ActiveTheme = {
  colorPaletteId: string;
  fontPaletteId: string;
  /** Per-token overrides from the admin custom palette editor */
  colorOverrides?: Partial<ColorTokens>;
  /** Custom font family overrides (full CSS font-family values) */
  fontOverrides?: { display?: string; body?: string; ui?: string };
};

/**
 * Produce the CSS that defines the active theme as custom properties on :root.
 * Rendered once in the document <head> so the very first paint is themed
 * (no flash). Switching palettes in admin re-renders this string.
 */
export function themeToCss(theme: ActiveTheme): string {
  const color = getColorPalette(theme.colorPaletteId);
  const font = getFontPalette(theme.fontPaletteId);

  const tokens: ColorTokens = { ...color.tokens, ...(theme.colorOverrides ?? {}) };

  const colorLines = (Object.keys(COLOR_VAR) as (keyof ColorTokens)[])
    .map((key) => `  ${COLOR_VAR[key]}: ${tokens[key]};`)
    .join("\n");

  const display = theme.fontOverrides?.display ?? font.display;
  const body = theme.fontOverrides?.body ?? font.body;
  const ui = theme.fontOverrides?.ui ?? font.ui;

  return `:root {
${colorLines}
  --font-display: ${display}, ui-serif, Georgia, serif;
  --font-body: ${body}, ui-sans-serif, system-ui, sans-serif;
  --font-ui: ${ui}, ui-sans-serif, system-ui, sans-serif;
}`;
}

/** Relative luminance per WCAG, used by the admin contrast checker. */
export function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const full =
    c.length === 3
      ? c
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : c;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export type ContrastGrade = "AAA" | "AA" | "AA Large" | "Fail";

export function gradeContrast(ratio: number): ContrastGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}
