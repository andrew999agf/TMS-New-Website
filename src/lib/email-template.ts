import { FIRM, OFFICES } from "@/lib/firm";
import type { ColorTokens } from "@/lib/theme/palettes";

/**
 * Branded, table-based HTML email shell that mirrors the site: a dark logo
 * banner, a gold accent line, the message body, and a dark footer listing the
 * offices with click-to-call phone numbers. Colors and fonts come from the live
 * theme so the email matches the current palette. The logo enlarges on desktop;
 * dark sections use a bgcolor attribute so the navy renders on mobile too.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tel = (p: string) => {
  const d = p.replace(/[^\d]/g, "");
  return "tel:" + (d.length === 10 ? "+1" + d : "+" + d);
};
const fam = (name: string) => name.trim().replace(/\s+/g, "+");

export function brandedEmailHtml({
  colors,
  fonts,
  logoLight,
  logoDark,
  firmName,
  bodyHtml,
}: {
  colors: ColorTokens;
  fonts?: { display?: string; body?: string };
  logoLight?: string;
  logoDark?: string;
  firmName: string;
  bodyHtml: string;
}): string {
  const displayFam = fonts?.display?.trim();
  const bodyFam = fonts?.body?.trim();
  const SERIF = `${displayFam ? `'${displayFam}', ` : ""}Georgia, 'Times New Roman', serif`;
  const SANS = `${bodyFam ? `'${bodyFam}', ` : ""}Arial, Helvetica, sans-serif`;

  const families = [displayFam, bodyFam].filter(Boolean) as string[];
  const fontLink = families.length
    ? `<link href="https://fonts.googleapis.com/css2?${[...new Set(families)].map((f) => `family=${fam(f)}:wght@400;600;700`).join("&")}&display=swap" rel="stylesheet" />`
    : "";

  const dark = colors.darkBg;

  // Logo that's small on phones, large on desktop — and reliably large in
  // Outlook too (it ignores media queries, so it gets an MSO-only fixed size).
  const logoImg = (src: string) =>
    `<!--[if mso]><img src="${src}" alt="${esc(firmName)}" width="430" style="display:inline-block;border:0" /><![endif]-->` +
    `<!--[if !mso]><!--><img src="${src}" alt="${esc(firmName)}" class="tms-logo" width="220" style="width:220px;max-width:88%;height:auto;display:inline-block;border:0" /><!--<![endif]-->`;

  // Dark band wrapped in its own bgcolor table (most reliable across clients,
  // incl. mobile and dark mode) rather than a bgcolor on a single cell.
  const band = (bg: string, inner: string, pad = "30px 32px") =>
    `<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="background-color:${bg};background:${bg}"><tr><td align="center" style="padding:${pad}">${inner}</td></tr></table></td></tr>`;

  let header: string;
  if (logoLight) {
    header = band(dark, logoImg(logoLight));
  } else if (logoDark) {
    header = band(colors.surface, logoImg(logoDark));
  } else {
    header = band(dark, `<div style="font-family:${SERIF};color:${colors.darkInk};font-size:26px;letter-spacing:.02em">${esc(firmName)}</div>`, "34px 32px");
  }

  const accent = `<tr><td style="padding:0;font-size:0;line-height:0"><div style="height:3px;background-color:${colors.darkAccent}">&nbsp;</div><div style="height:4px;background-color:${colors.accent}">&nbsp;</div></td></tr>`;

  const officeCells = OFFICES.map((o) => {
    const phone = o.phone
      ? `<a href="${tel(o.phone)}" style="color:${colors.darkAccent};text-decoration:none">${esc(o.phone)}</a>`
      : "";
    return `<td style="vertical-align:top;padding:0 14px 14px 0;font-family:${SANS};font-size:12px;line-height:1.55;color:${colors.darkInkMuted};width:33%">
      <div style="color:${colors.darkInk};font-weight:bold;font-family:${SANS};font-size:13px;margin-bottom:5px">${esc(o.name)}</div>
      ${esc(o.street)}<br/>${esc(o.city)}, ${esc(o.state)} ${esc(o.zip)}<br/>${phone}
    </td>`;
  }).join("");

  const footerInner = `
      <div style="font-family:${SERIF};color:${colors.darkInk};font-size:18px;margin-bottom:16px">${esc(firmName)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${officeCells}</tr></table>
      <div style="border-top:1px solid ${colors.darkBorder};margin-top:8px;padding-top:14px;font-family:${SANS};font-size:11px;color:${colors.darkInkMuted};line-height:1.7">
        Fax <a href="${tel(FIRM.fax)}" style="color:${colors.darkInkMuted};text-decoration:none">${esc(FIRM.fax)}</a><br/>
        This email and the firm's website may be considered attorney advertising. Submitting an inquiry does not create an attorney-client relationship.
      </div>`;
  const footer = `<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${dark}" style="background-color:${dark};background:${dark}"><tr><td style="padding:28px 32px">${footerInner}</td></tr></table></td></tr>`;

  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    ${fontLink}
    <style>
      /* Logo enlarges on wider (desktop) screens; stays smaller on phones. */
      @media only screen and (min-width:600px) {
        img.tms-logo { width:440px !important; max-width:440px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${colors.bg}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.bg}" style="background-color:${colors.bg};padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:${colors.surface};border:1px solid ${colors.border};border-radius:10px;overflow:hidden">
          ${header}
          ${accent}
          <tr><td style="padding:32px;font-family:${SERIF};color:${colors.ink};font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
          ${footer}
        </table>
      </td></tr>
    </table>
  </body></html>`;
}
