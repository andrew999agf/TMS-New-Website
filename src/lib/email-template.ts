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

  // Locked light palette. Every surface in the email is painted from these, and
  // the dark-mode blocks below force them back if a client tries to invert.
  const PAGE = colors.bg;       // warm bone
  const CARD = colors.surface;  // white
  const INK = colors.ink;
  const MUTED = colors.inkMuted;
  const RULE = colors.border;

  // Logo that's small on phones, large on desktop — and reliably large in
  // Outlook too (it ignores media queries, so it gets an MSO-only fixed size).
  const logoImg = (src: string) =>
    `<!--[if mso]><img src="${src}" alt="${esc(firmName)}" width="430" style="display:inline-block;border:0" /><![endif]-->` +
    `<!--[if !mso]><!--><img src="${src}" alt="${esc(firmName)}" class="tms-logo" width="220" style="width:220px;max-width:88%;height:auto;display:inline-block;border:0" /><!--<![endif]-->`;

  // Dark band wrapped in its own bgcolor table (most reliable across clients,
  // incl. mobile and dark mode) rather than a bgcolor on a single cell.
  const band = (bg: string, inner: string, pad = "30px 32px") =>
    `<tr><td class="tms-band" style="padding:0;background-color:${bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="background-color:${bg};background:${bg}"><tr><td align="center" style="padding:${pad}">${inner}</td></tr></table></td></tr>`;

  // The logo always sits on a locked white band with the colored (navy) logo.
  //
  // We deliberately do NOT adapt to dark mode. Mail clients handle it
  // inconsistently — Gmail on iOS re-colours the message itself — and the
  // swap-to-dark version came out as a near-black card with an unreadable navy
  // logo. A single light treatment, defended below, is predictable everywhere.
  const primaryLogo = logoDark || logoLight;
  const header = primaryLogo
    ? band(CARD, logoImg(primaryLogo), "28px 32px")
    : band(CARD, `<div style="font-family:${SERIF};color:${colors.ink};font-size:26px;letter-spacing:.02em">${esc(firmName)}</div>`, "34px 32px");

  const accent = `<tr><td style="padding:0;font-size:0;line-height:0"><div style="height:3px;background-color:${colors.darkAccent}">&nbsp;</div><div style="height:4px;background-color:${colors.accent}">&nbsp;</div></td></tr>`;

  const officeCells = OFFICES.map((o) => {
    const phone = o.phone
      ? `<a href="${tel(o.phone)}" style="color:${colors.accent};text-decoration:none">${esc(o.phone)}</a>`
      : "";
    return `<td class="tms-ftr-text" style="vertical-align:top;padding:0 14px 14px 0;font-family:${SANS};font-size:12px;line-height:1.55;color:${colors.inkMuted};width:33%">
      <div class="tms-ftr-strong" style="color:${colors.ink};font-weight:bold;font-family:${SANS};font-size:13px;margin-bottom:5px">${esc(o.name)}</div>
      ${esc(o.street)}<br/>${esc(o.city)}, ${esc(o.state)} ${esc(o.zip)}<br/>${phone}
    </td>`;
  }).join("");

  const footerInner = `
      <div class="tms-ftr-strong" style="font-family:${SERIF};color:${colors.ink};font-size:18px;margin-bottom:16px">${esc(firmName)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${officeCells}</tr></table>
      <div class="tms-ftr-rule tms-ftr-text" style="border-top:1px solid ${colors.border};margin-top:8px;padding-top:14px;font-family:${SANS};font-size:11px;color:${colors.inkMuted};line-height:1.7">
        Fax <a class="tms-ftr-muted-link" href="${tel(FIRM.fax)}" style="color:${colors.inkMuted};text-decoration:none">${esc(FIRM.fax)}</a><br/>
        Submitting an inquiry does not create an attorney-client relationship.
      </div>`;
  // The footer is painted on the SAME locked white as the logo band, and flips
  // to the same dark band in dark mode — so the two ends of the email always
  // match each other instead of the footer reading as a separate pale card.
  const footer = `<tr><td style="padding:0"><table role="presentation" class="tms-ftr" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="background-color:${CARD};background:${CARD}"><tr><td style="padding:28px 32px">${footerInner}</td></tr></table></td></tr>`;

  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    ${fontLink}
    <style>
      /* Logo enlarges on wider (desktop) screens; stays smaller on phones. */
      @media only screen and (min-width:600px) {
        img.tms-logo { width:440px !important; max-width:440px !important; }
      }
      /*
       * Dark mode: hold the light design instead of adapting to it.
       *
       * Clients that honour color-scheme will leave this alone. The ones that
       * re-colour anyway (Gmail on iOS and Android, which rewrites the message
       * and exposes these [data-ogsc]/[data-ogsb] hooks) get every surface and
       * every piece of text pinned back, so the email reads the same on a phone
       * at night as it does on a desktop.
       */
      @media (prefers-color-scheme: dark) {
        .tms-page, .tms-page > tbody > tr > td { background-color:${PAGE} !important; }
        .tms-card { background-color:${CARD} !important; }
        .tms-band, .tms-band table, .tms-band td { background-color:${CARD} !important; }
        .tms-body, .tms-body * { color:${INK} !important; }
        .tms-muted, .tms-muted * { color:${MUTED} !important; }
        .tms-ftr, .tms-ftr table, .tms-ftr td { background-color:${CARD} !important; }
        .tms-ftr .tms-ftr-strong { color:${INK} !important; }
        .tms-ftr .tms-ftr-text, .tms-ftr .tms-ftr-muted-link { color:${MUTED} !important; }
        .tms-ftr .tms-ftr-rule { border-top-color:${RULE} !important; }
        .tms-ftr a { color:${colors.accent} !important; }
        .tms-ftr .tms-ftr-muted-link { color:${MUTED} !important; }
      }
      [data-ogsc] .tms-page, [data-ogsb] .tms-page { background-color:${PAGE} !important; }
      [data-ogsc] .tms-card, [data-ogsb] .tms-card { background-color:${CARD} !important; }
      [data-ogsc] .tms-band, [data-ogsb] .tms-band,
      [data-ogsc] .tms-band td, [data-ogsb] .tms-band td { background-color:${CARD} !important; }
      [data-ogsc] .tms-body, [data-ogsc] .tms-body * { color:${INK} !important; }
      [data-ogsc] .tms-muted, [data-ogsc] .tms-muted * { color:${MUTED} !important; }
      [data-ogsc] .tms-ftr, [data-ogsb] .tms-ftr,
      [data-ogsc] .tms-ftr td, [data-ogsb] .tms-ftr td { background-color:${CARD} !important; }
      [data-ogsc] .tms-ftr .tms-ftr-strong { color:${INK} !important; }
      [data-ogsc] .tms-ftr .tms-ftr-text, [data-ogsc] .tms-ftr .tms-ftr-muted-link { color:${MUTED} !important; }
      [data-ogsc] .tms-ftr .tms-ftr-rule { border-top-color:${RULE} !important; }
      [data-ogsc] .tms-ftr a { color:${colors.accent} !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${PAGE}">
    <table role="presentation" class="tms-page" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="background-color:${PAGE};padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" class="tms-card" width="600" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="width:600px;max-width:600px;background-color:${CARD};border:1px solid ${RULE};border-radius:10px;overflow:hidden">
          ${header}
          ${accent}
          <tr><td class="tms-body" style="padding:32px;font-family:${SERIF};color:${INK};font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
          ${footer}
        </table>
      </td></tr>
    </table>
  </body></html>`;
}
