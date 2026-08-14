import "server-only";
import { FIRM, OFFICES } from "@/lib/firm";
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
const tel = (p: string) => `tel:+1${p.replace(/[^0-9]/g, "")}`;

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
  const SERIF = `${fonts.display ? `'${fonts.display}', ` : ""}Georgia, 'Times New Roman', serif`;

  // One clear way to reach us, inside the card. The footer still lists every
  // office, so this stays to a single line rather than repeating all three.
  const hub = OFFICES.find((o) => o.isHub) ?? OFFICES[0];
  const site = `https://${FIRM.domain}`;
  const callRow = `
        <p style="margin:16px 0 0;padding-top:14px;border-top:1px solid ${colors.border};font-size:15px;line-height:1.6;color:${colors.ink}">
          <a href="${tel(hub.phone)}" style="color:${colors.accent};font-weight:bold;text-decoration:none">${esc(hub.phone)}</a>
          &nbsp;&middot;&nbsp;
          <a href="${site}" style="color:${colors.accent};text-decoration:none">${esc(FIRM.domain)}</a>
        </p>`;

  // The decline itself is deliberately quiet: a thin rule and muted text, no
  // filled panels. Nothing in the top half competes for attention, which is
  // what lets the closing card carry weight.
  const quiet = `margin:0 0 16px;padding:2px 0 2px 14px;border-left:2px solid ${colors.border};color:${colors.inkMuted};font-size:14px;line-height:1.6`;

  // The one thing meant to land. Not a loud colour block — a defined card with
  // an oxblood rule across the top and a serif headline in the accent, so it
  // reads as a considered note from the firm rather than an advert.
  const closing = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;border-collapse:separate">
      <tr><td style="padding:0;font-size:0;line-height:0"><div style="height:4px;background-color:${colors.accent};border-radius:4px 4px 0 0">&nbsp;</div></td></tr>
      <tr><td style="padding:20px 22px;background-color:${colors.surface};border:1px solid ${colors.border};border-top:0;border-radius:0 0 8px 8px">
        <p style="margin:0 0 10px;font-family:${SERIF};font-size:19px;line-height:1.35;font-weight:bold;color:${colors.accent}">If something serious ever happens &mdash; to you or someone you love</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:${colors.ink}">Bad things happen to good people. A wreck on the way home. A catastrophic injury. A death that never should have happened. <strong>That work is the heart of what this firm does.</strong></p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:${colors.ink}">We represent people and families across Texas in personal injury and wrongful death cases, along with other serious plaintiff&rsquo;s litigation &mdash; business fraud, real estate fraud, and major contract disputes.</p>
        <p style="margin:0;font-size:15px;line-height:1.65;color:${colors.ink}">If it ever happens to you, to a family member, or to a friend, please send them our way. We would consider it a privilege to be the call they make.</p>
        ${callRow}
      </td></tr>
    </table>`;

  const body = `
    <p style="margin:0 0 14px">Dear ${greeting},</p>
    <p style="margin:0 0 16px">Thank you for reaching out to our office. After reviewing your inquiry, we are unfortunately not able to assist you with this matter. We encourage you to consult with ${esc(area)} in your area who may be able to help.</p>
    ${note ? `<p style="margin:0 0 16px;white-space:pre-wrap">${esc(note)}</p>` : ""}
    <p style="${quiet}"><strong style="color:${colors.ink}">Please act promptly.</strong> Legal matters are often subject to strict deadlines, such as a statute of limitations. If a deadline passes, you may lose the right to pursue your claim entirely. We strongly encourage you to speak with an attorney as soon as possible to protect your rights.</p>
    ${referralBlock}
    <p style="${quiet}"><strong style="color:${colors.ink}">No attorney-client relationship has been created.</strong> This message, and our decision not to represent you, does not create an attorney-client relationship between you and ${esc(firmName)}. We are not your attorneys and are not advising you on the merits, deadlines, or handling of your matter.</p>
    ${closing}
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
