import "server-only";
import { FIRM } from "@/lib/firm";
import { getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml } from "@/lib/email-template";

export type TurnbackAttorney = {
  name: string;
  firm?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  practiceArea?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const normUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/**
 * Build the "turn-back" email sent to a prospective client the firm can't take:
 * a gracious decline, a statute-of-limitations caution, an optional list of
 * referral attorneys, the statewide-matters note, and a no-attorney-client
 * disclaimer — all in the firm's branded email shell.
 */
export async function buildTurnbackEmail(opts: { name?: string | null; attorneys: TurnbackAttorney[] }): Promise<{ subject: string; html: string }> {
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;
  const greeting = opts.name?.trim() ? esc(opts.name.trim()) : "there";

  const attorneys = opts.attorneys.filter((a) => a.name?.trim());
  let referralBlock = "";
  if (attorneys.length) {
    const cards = attorneys
      .map((a) => {
        const lines: string[] = [];
        if (a.firm) lines.push(`<div style="color:${colors.inkMuted};font-size:13px">${esc(a.firm)}</div>`);
        if (a.practiceArea) lines.push(`<div style="color:${colors.inkMuted};font-size:13px">${esc(a.practiceArea)}</div>`);
        if (a.address) lines.push(`<div style="color:${colors.inkMuted};font-size:13px">${esc(a.address)}</div>`);
        const contact: string[] = [];
        if (a.phone) contact.push(esc(a.phone));
        if (a.email) contact.push(`<a href="mailto:${esc(a.email)}" style="color:${colors.accent};text-decoration:none">${esc(a.email)}</a>`);
        if (a.website) contact.push(`<a href="${esc(normUrl(a.website))}" style="color:${colors.accent};text-decoration:none">${esc(a.website)}</a>`);
        if (contact.length) lines.push(`<div style="font-size:13px;margin-top:2px">${contact.join(" &nbsp;·&nbsp; ")}</div>`);
        return `<td style="padding:12px 14px;border:1px solid ${colors.border};border-radius:8px;background:${colors.surface2}">
          <div style="font-weight:bold;font-size:15px;color:${colors.ink}">${esc(a.name)}</div>
          ${lines.join("")}
        </td>`;
      })
      .map((cell) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr>${cell}</tr></table>`)
      .join("");
    referralBlock = `
      <p style="margin:18px 0 10px">While we cannot take your case, you may wish to reach out to one of the following attorneys, who may be able to assist you:</p>
      ${cards}
      <p style="margin:2px 0 16px;font-size:13px;color:${colors.inkMuted}">This is not a recommendation or endorsement of any particular attorney; it is provided only for your convenience. You are free to contact any attorney of your choosing.</p>`;
  }

  const body = `
    <p style="margin:0 0 14px">Dear ${greeting},</p>
    <p style="margin:0 0 16px">Thank you for reaching out to our office. After reviewing your inquiry, we are unfortunately not able to assist you with this matter. We encourage you to consult with a civil attorney in your area who may be able to help.</p>
    <p style="margin:0 0 16px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>Please act promptly.</strong> Legal matters are often subject to strict deadlines, such as a statute of limitations. If a deadline passes, you may lose the right to pursue your claim entirely. We strongly encourage you to speak with an attorney as soon as possible to protect your rights.</p>
    ${referralBlock}
    <p style="margin:0 0 16px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>No attorney-client relationship has been created.</strong> This message, and our decision not to represent you, does not create an attorney-client relationship between you and ${esc(firmName)}. We are not your attorneys and are not advising you on the merits, deadlines, or handling of your matter.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="padding:18px 20px;border-radius:10px;background:${colors.accent};color:${colors.onAccent}">
      <div style="font-size:17px;font-weight:bold;line-height:1.4;color:${colors.onAccent}">We may not have been able to help with this matter — but we may be able to help with others.</div>
      <div style="font-size:14px;line-height:1.6;margin-top:8px;color:${colors.onAccent}">Our firm handles a range of matters statewide, including personal injury, wrongful death claims, and other plaintiff&rsquo;s litigation &mdash; including business fraud, real estate fraud, and large contract claims. If you have a matter like these, we would welcome the opportunity to speak with you.</div>
    </td></tr></table>
    <p style="margin:20px 0 0;color:${colors.inkMuted};font-size:13px">&mdash; The office of ${esc(firmName)}</p>`;

  const html = brandedEmailHtml({
    colors,
    fonts,
    logoLight: globals["global.logoLight"] || undefined,
    logoDark: globals["global.logoDark"] || undefined,
    firmName,
    bodyHtml: body,
  });

  return { subject: `Regarding your inquiry to ${firmName}`, html };
}

/**
 * A very short, low-key professional note to a referral attorney letting them
 * know we sent someone their way — practice area and the person's last name
 * only. Uses the branded shell for a consistent look.
 */
export async function buildAttorneyReferralNotice(opts: { attorneyName: string; practiceArea: string; lastName: string }): Promise<{ subject: string; html: string }> {
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;
  const area = opts.practiceArea.trim() || "legal";
  const last = opts.lastName.trim();

  const body = `
    <p style="margin:0 0 14px">Dear Counsel,</p>
    <p style="margin:0 0 16px">Our office recently spoke with a prospective client we are not able to assist. We provided your firm&rsquo;s information and encouraged them to contact you regarding a <strong>${esc(area)}</strong> matter${last ? `. Their last name is <strong>${esc(last)}</strong>` : ""}. They may reach out to you directly.</p>
    <p style="margin:0 0 16px">We appreciate the opportunity to send them your way. There is nothing you need to do in response to this note.</p>
    <p style="margin:18px 0 0;color:${colors.inkMuted};font-size:13px">&mdash; The office of ${esc(firmName)}</p>`;

  const html = brandedEmailHtml({
    colors,
    fonts,
    logoLight: globals["global.logoLight"] || undefined,
    logoDark: globals["global.logoDark"] || undefined,
    firmName,
    bodyHtml: body,
  });

  return { subject: `Referral to your office${last ? ` — ${last}` : ""}`, html };
}
