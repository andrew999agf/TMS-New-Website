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
 * Strip anything that reads as an email address out of text shown to a
 * prospective client.
 *
 * The referral card deliberately omits the attorney's email so a declined
 * inquiry reaches counsel by phone or their own intake rather than landing
 * unsolicited in their inbox. This closes the side doors: an address typed into
 * the firm, address, or practice-area field — or a "website" that's really a
 * mailto — would otherwise hand out the same thing.
 */
const EMAIL_RE = /(mailto:)?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const stripEmails = (s: string) => s.replace(EMAIL_RE, "").replace(/\s*[·|,;]\s*$/, "").replace(/\s{2,}/g, " ").trim();

/**
 * Build the "turn-back" email sent to a prospective client the firm can't take:
 * a gracious decline, a statute-of-limitations caution, an optional list of
 * referral attorneys, the statewide-matters note, and a no-attorney-client
 * disclaimer — all in the firm's branded email shell.
 */
export async function buildTurnbackEmail(opts: { name?: string | null; attorneys: TurnbackAttorney[]; referralArea?: string; note?: string }): Promise<{ subject: string; html: string }> {
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;
  const greeting = opts.name?.trim() ? esc(opts.name.trim()) : "there";
  const area = (opts.referralArea?.trim() || "a licensed attorney in the appropriate practice area");

  const attorneys = opts.attorneys.filter((a) => a.name?.trim());
  let referralBlock = "";
  if (attorneys.length) {
    const cards = attorneys
      .map((a) => {
        // Every field is scrubbed of email addresses before it reaches the
        // prospect — a.email is never rendered here at all, and this stops one
        // slipping in through any of the free-text fields.
        const firm = stripEmails(a.firm ?? "");
        const practiceArea = stripEmails(a.practiceArea ?? "");
        const address = stripEmails(a.address ?? "");
        const phone = stripEmails(a.phone ?? "");
        // A "website" that is really an email is dropped rather than linked.
        const website = /@/.test(a.website ?? "") ? "" : (a.website ?? "").trim();

        const lines: string[] = [];
        if (firm) lines.push(`<div style="color:${colors.inkMuted};font-size:13px">${esc(firm)}</div>`);
        if (practiceArea) lines.push(`<div style="color:${colors.inkMuted};font-size:13px">${esc(practiceArea)}</div>`);
        if (address) lines.push(`<div style="color:${colors.inkMuted};font-size:13px">${esc(address)}</div>`);
        // Phone and website only — the attorney's email address is deliberately
        // withheld so referrals arrive by phone or their own intake form rather
        // than as unsolicited email to counsel. (a.email is still used
        // internally for the optional courtesy notice to counsel.)
        const contact: string[] = [];
        if (phone) contact.push(esc(phone));
        if (website) contact.push(`<a href="${esc(normUrl(website))}" style="color:${colors.accent};text-decoration:none">${esc(website)}</a>`);
        if (contact.length) lines.push(`<div style="font-size:13px;margin-top:2px">${contact.join(" &nbsp;·&nbsp; ")}</div>`);
        return `<td style="padding:12px 14px;border:1px solid ${colors.border};border-radius:8px;background:${colors.surface2}">
          <div style="font-weight:bold;font-size:15px;color:${colors.ink}">${esc(stripEmails(a.name))}</div>
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

  const note = opts.note?.trim();
  const body = `
    <p style="margin:0 0 14px">Dear ${greeting},</p>
    <p style="margin:0 0 16px">Thank you for reaching out to our office. After reviewing your inquiry, we are unfortunately not able to assist you with this matter. We encourage you to consult with ${esc(area)} in your area who may be able to help.</p>
    ${note ? `<p style="margin:0 0 16px;white-space:pre-wrap">${esc(note)}</p>` : ""}
    <p style="margin:0 0 16px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>Please act promptly.</strong> Legal matters are often subject to strict deadlines, such as a statute of limitations. If a deadline passes, you may lose the right to pursue your claim entirely. We strongly encourage you to speak with an attorney as soon as possible to protect your rights.</p>
    ${referralBlock}
    <p style="margin:0 0 16px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>No attorney-client relationship has been created.</strong> This message, and our decision not to represent you, does not create an attorney-client relationship between you and ${esc(firmName)}. We are not your attorneys and are not advising you on the merits, deadlines, or handling of your matter.</p>
    <div style="margin:20px 0 6px;padding:14px 18px;background:${colors.surface2};border-left:3px solid ${colors.accent}">
      <p style="margin:0 0 6px;font-size:16px;font-weight:bold;line-height:1.4;color:${colors.ink}">We may not have been able to help with this matter — but we may be able to help with others.</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${colors.ink}">Our firm handles a range of matters statewide, including personal injury, wrongful death claims, and other plaintiff&rsquo;s litigation &mdash; including business fraud, real estate fraud, and large contract claims. If you have a matter like these, we would welcome the opportunity to speak with you.</p>
    </div>
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
