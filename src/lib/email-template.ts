import { FIRM, OFFICES } from "@/lib/firm";
import type { ColorTokens } from "@/lib/theme/palettes";

/**
 * Branded, table-based HTML email shell that mirrors the site: a dark logo
 * banner, a gold accent line, the message body in the firm's serif, and a dark
 * footer listing the offices with click-to-call phone numbers. Colors come from
 * the live theme so the email always matches the current palette.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tel = (p: string) => {
  const d = p.replace(/[^\d]/g, "");
  return "tel:" + (d.length === 10 ? "+1" + d : "+" + d);
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

export function brandedEmailHtml({
  colors,
  logoLight,
  logoDark,
  firmName,
  bodyHtml,
}: {
  colors: ColorTokens;
  logoLight?: string;
  logoDark?: string;
  firmName: string;
  bodyHtml: string;
}): string {
  // Header: white logo on the dark banner if we have one; otherwise the main
  // logo on a light banner; otherwise the firm name in serif.
  let header: string;
  if (logoLight) {
    header = `<tr><td style="background:${colors.darkBg};padding:30px 32px;text-align:center"><img src="${logoLight}" alt="${esc(firmName)}" width="230" style="max-width:230px;height:auto;display:inline-block;border:0" /></td></tr>`;
  } else if (logoDark) {
    header = `<tr><td style="background:${colors.surface};padding:30px 32px;text-align:center"><img src="${logoDark}" alt="${esc(firmName)}" width="230" style="max-width:230px;height:auto;display:inline-block;border:0" /></td></tr>`;
  } else {
    header = `<tr><td style="background:${colors.darkBg};padding:34px 32px;text-align:center"><div style="font-family:${SERIF};color:${colors.darkInk};font-size:24px;letter-spacing:.02em">${esc(firmName)}</div></td></tr>`;
  }

  // Navy + gold accent lines (echoing the site header).
  const accent = `<tr><td style="padding:0;font-size:0;line-height:0"><div style="height:3px;background:${colors.darkAccent}">&nbsp;</div><div style="height:4px;background:${colors.accent}">&nbsp;</div></td></tr>`;

  const officeCells = OFFICES.map((o) => {
    const phone = o.phone
      ? `<a href="${tel(o.phone)}" style="color:${colors.darkAccent};text-decoration:none">${esc(o.phone)}</a>`
      : "";
    return `<td style="vertical-align:top;padding:0 14px 14px 0;font-family:${SANS};font-size:12px;line-height:1.55;color:${colors.darkInkMuted};width:33%">
      <div style="color:${colors.darkInk};font-weight:bold;font-family:${SERIF};font-size:13px;margin-bottom:5px">${esc(o.name)}</div>
      ${esc(o.street)}<br/>${esc(o.city)}, ${esc(o.state)} ${esc(o.zip)}<br/>${phone}
    </td>`;
  }).join("");

  const footer = `<tr><td style="background:${colors.darkBg};padding:28px 32px">
      <div style="font-family:${SERIF};color:${colors.darkInk};font-size:17px;margin-bottom:16px">${esc(firmName)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${officeCells}</tr></table>
      <div style="border-top:1px solid ${colors.darkBorder};margin-top:8px;padding-top:14px;font-family:${SANS};font-size:11px;color:${colors.darkInkMuted};line-height:1.7">
        Fax <a href="${tel(FIRM.fax)}" style="color:${colors.darkInkMuted};text-decoration:none">${esc(FIRM.fax)}</a><br/>
        This email and the firm's website may be considered attorney advertising. Submitting an inquiry does not create an attorney-client relationship.
      </div>
    </td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:${colors.bg}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg};padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${colors.surface};border:1px solid ${colors.border};border-radius:10px;overflow:hidden">
          ${header}
          ${accent}
          <tr><td style="padding:32px;font-family:${SERIF};color:${colors.ink};font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
          ${footer}
        </table>
      </td></tr>
    </table>
  </body></html>`;
}
