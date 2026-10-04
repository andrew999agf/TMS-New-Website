import "server-only";
import { FIRM } from "@/lib/firm";
import { getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml, firmSignatureHtml } from "@/lib/email-template";
import { ordinal } from "./build";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The email that carries a production to counsel — same words as the cover
 *  letter, in the firm's branded shell, letter PDF attached. */
export async function buildProductionEmail(o: {
  caseName: string; causeNumber: string; label: string; seq: number;
  /** "ABC000001 through ABC000120", or "" when unlabeled. */
  range: string;
  link: string;
  productionAttached: boolean;
}): Promise<{ subject: string; html: string }> {
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;
  const p = (html: string) => `<p style="margin:0 0 12px;line-height:1.6;color:${colors.ink}">${html}</p>`;

  const nth = ordinal(o.seq).toLowerCase();
  const what = o.range ? `${nth} production, Bates numbered ${esc(o.range)}` : `${nth} production`;
  const enclosed = o.productionAttached
    ? `Please see the enclosed ${what}. The cover letter is attached. The production can also be found at the following link:`
    : `Please see the attached cover letter for our ${what}. The production is too large to email and can be found at the following link:`;

  const body =
    p(`<b>RE:&nbsp; ${esc(o.caseName)}</b>${o.causeNumber ? `<br/>Cause No. ${esc(o.causeNumber)}` : ""}<br/>${esc(o.label)}${o.range ? ` — ${esc(o.range)}` : ""}`) +
    p("Counsel:") +
    p(enclosed) +
    p(`<a href="${esc(o.link)}" style="color:${colors.accent};font-weight:bold">${esc(o.link)}</a>`) +
    p("Respectfully,") +
    firmSignatureHtml(colors);

  const subject = `${o.caseName}${o.causeNumber ? ` (Cause No. ${o.causeNumber})` : ""} — ${o.label}${o.range ? ` (${o.range})` : ""}`;
  return {
    subject,
    html: brandedEmailHtml({
      colors, fonts,
      logoLight: globals["global.logoLight"] || undefined,
      logoDark: globals["global.logoDark"] || undefined,
      firmName, bodyHtml: body, footer: false,
    }),
  };
}
