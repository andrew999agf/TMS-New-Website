"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin, audit } from "@/lib/auth";
import { FIRM } from "@/lib/firm";
import { SITE_URL } from "@/lib/seo";
import { sendEmail, describeSendFailure } from "@/lib/email";
import { getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml } from "@/lib/email-template";
import { getIntakePartner, partnerPath } from "@/lib/intake/partners";
import { getPartnerContacts, savePartnerContacts, MAX_PARTNER_CONTACTS, type PartnerContact } from "@/lib/intake/partner-contacts";
import { updatePartnerProfile, MAX_PARTNER_CONTACT_CHARS } from "@/lib/intake/partner-profile";

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Add someone at the partner office. From then on they are copied on the
 *  intake team's email for each lead that comes in through the partner's link. */
export async function addPartnerContact(input: { partner: string; name: string; email: string }): Promise<Result> {
  const session = await requireAdmin();
  const partner = getIntakePartner(input.partner);
  if (!partner) return { ok: false, error: "Unknown partner." };
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const email = (input.email ?? "").trim().slice(0, 254);
  if (!name) return { ok: false, error: "Enter their name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  try {
    const list = await getPartnerContacts(partner.slug);
    if (list.some((c) => c.email.toLowerCase() === email.toLowerCase())) return { ok: false, error: "That email address is already on the list." };
    if (list.length >= MAX_PARTNER_CONTACTS) return { ok: false, error: `The list is limited to ${MAX_PARTNER_CONTACTS} people.` };
    list.push({ id: randomBytes(6).toString("hex"), name, email, addedAt: new Date().toISOString() });
    await savePartnerContacts(partner.slug, list);
    await audit(session.email, "create", "intake-partner-contact", partner.slug, `Added ${name} <${email}> to ${partner.name}`);
    revalidatePath("/admin/intake");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function removePartnerContact(input: { partner: string; id: string }): Promise<Result> {
  const session = await requireAdmin();
  const partner = getIntakePartner(input.partner);
  if (!partner) return { ok: false, error: "Unknown partner." };
  try {
    const list = await getPartnerContacts(partner.slug);
    const gone = list.find((c) => c.id === input.id);
    if (!gone) return { ok: true };
    await savePartnerContacts(partner.slug, list.filter((c) => c.id !== input.id));
    await audit(session.email, "delete", "intake-partner-contact", partner.slug, `Removed ${gone.name} <${gone.email}> from ${partner.name}`);
    revalidatePath("/admin/intake");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Email the partner's intake link to one contact, or to everyone on the list.
 * Each person gets their own message, addressed to them, in the firm's branded
 * style: a button that opens the form, the link itself to copy or forward, and
 * the three ways to use it.
 */
export async function sendPartnerLink(input: { partner: string; id?: string }): Promise<Result> {
  const session = await requireAdmin();
  const partner = getIntakePartner(input.partner);
  if (!partner) return { ok: false, error: "Unknown partner." };
  const all = await getPartnerContacts(partner.slug);
  const targets = input.id ? all.filter((c) => c.id === input.id) : all;
  if (targets.length === 0) return { ok: false, error: input.id ? "That person is no longer on the list." : "Add someone to the list first." };

  const href = `${SITE_URL}${partnerPath(partner.slug)}`;
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;
  const li = (html: string) => `<tr><td style="vertical-align:top;padding:0 10px 10px 0;color:${colors.accent};font-weight:bold">&bull;</td><td style="padding:0 0 10px">${html}</td></tr>`;

  const bodyFor = (c: PartnerContact) => `
    <p style="margin:0 0 14px">Dear ${esc(c.name || "there")},</p>
    <p style="margin:0 0 16px">Here is the intake link for <strong>${esc(partner.name)}</strong>. Use it whenever someone at your office needs help with a civil, probate or injury matter.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr>
      <td align="center" bgcolor="${colors.accent}" style="background-color:${colors.accent};border-radius:8px">
        <a href="${href}" style="display:inline-block;padding:15px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${colors.onAccent};text-decoration:none">Open the intake form &rarr;</a>
      </td></tr></table>
    <p style="margin:0 0 6px;font-size:13px;color:${colors.inkMuted}">The link, to copy and paste:</p>
    <p style="margin:0 0 20px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent};font-family:Consolas,Menlo,monospace;font-size:14px;word-break:break-all"><a href="${href}" style="color:${colors.ink};text-decoration:none">${href}</a></p>
    <p style="margin:0 0 10px"><strong>Three ways to use it</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px">
      ${li("<strong>Fill it out together.</strong> Open the form and complete it with the person while they are in your office.")}
      ${li("<strong>Send it to them.</strong> Copy the link into a text or an email, or forward this message, and they can fill it out on their own phone.")}
      ${li("<strong>Keep it handy.</strong> Bookmark the form on the front-desk computer or tablet.")}
    </table>
    <p style="margin:0 0 16px">The form takes about three minutes and has an <strong>English / Espa&ntilde;ol</strong> switch at the top.</p>
    <p style="margin:0 0 14px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>What happens next.</strong> Each submission goes straight to our intake team, and you are copied on the notice so you know it arrived. We follow up with the person directly.</p>
    <p style="margin:18px 0 0;color:${colors.inkMuted};font-size:13px">&mdash; The office of ${esc(firmName)}</p>
    <p style="margin:18px 0 0;padding-top:12px;border-top:1px solid ${colors.border};color:${colors.inkMuted};font-size:12px;line-height:1.6">${esc(firmName)} and ${esc(partner.name)} are separate, independent law firms and are not a partnership.</p>`;

  const sentIds: string[] = [];
  let lastFailure = "";
  for (const c of targets) {
    const html = brandedEmailHtml({ colors, fonts, logoLight: globals["global.logoLight"] || undefined, logoDark: globals["global.logoDark"] || undefined, firmName, bodyHtml: bodyFor(c) });
    const res = await sendEmail({ to: c.email, fromName: firmName, subject: `Your intake link for ${partner.name}`, html });
    if (res.sent) sentIds.push(c.id); else lastFailure = describeSendFailure(res.reason);
  }
  if (sentIds.length) {
    const now = new Date().toISOString();
    try {
      // Re-read so a contact added or removed while sending isn't overwritten.
      const fresh = await getPartnerContacts(partner.slug);
      await savePartnerContacts(partner.slug, fresh.map((c) => (sentIds.includes(c.id) ? { ...c, linkSentAt: now } : c)));
    } catch { /* the emails went; the "sent" date is a nicety */ }
    await audit(session.email, "send", "intake-partner-link", partner.slug, `Emailed the ${partner.name} intake link to ${targets.filter((c) => sentIds.includes(c.id)).map((c) => c.email).join(", ")}`);
    revalidatePath("/admin/intake");
  }
  if (sentIds.length === targets.length) return { ok: true, message: targets.length === 1 ? `Sent to ${targets[0].name || targets[0].email}.` : `Sent to all ${targets.length} people.` };
  if (sentIds.length === 0) return { ok: false, error: lastFailure || "The email could not be sent. Check the email settings." };
  return { ok: false, error: `Sent to ${sentIds.length} of ${targets.length}. ${lastFailure}`.trim() };
}

/**
 * The partner's logo on its intake form. `url` is the address of an image the
 * admin just uploaded; "" shows no logo; null goes back to the starting logo.
 */
export async function savePartnerLogo(input: { partner: string; url: string | null }): Promise<Result> {
  const session = await requireAdmin();
  const partner = getIntakePartner(input.partner);
  if (!partner) return { ok: false, error: "Unknown partner." };
  let url = input.url;
  if (typeof url === "string" && url !== "") {
    url = url.trim();
    let parsed: URL | null = null;
    try { parsed = new URL(url); } catch { /* not a web address */ }
    if (!parsed || !/^https?:$/.test(parsed.protocol) || url.length > 1000) return { ok: false, error: "That upload didn't return a usable image address. Try again." };
  }
  try {
    await updatePartnerProfile(partner.slug, { logoUrl: url });
    await audit(session.email, "update", "intake-partner-profile", partner.slug, url === null ? `Put back the original ${partner.name} logo` : url === "" ? `Removed the ${partner.name} logo` : `Uploaded a new ${partner.name} logo`);
    revalidatePath("/admin/intake");
    revalidatePath(partnerPath(partner.slug));
    return { ok: true, message: url === null ? "The original logo is back." : url === "" ? "Logo removed. Their name shows in its place." : "Logo saved." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** The partner's contact details as shown at the bottom of its intake form. */
export async function savePartnerContactDetails(input: { partner: string; text: string }): Promise<Result> {
  const session = await requireAdmin();
  const partner = getIntakePartner(input.partner);
  if (!partner) return { ok: false, error: "Unknown partner." };
  const text = String(input.text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_PARTNER_CONTACT_CHARS) return { ok: false, error: `Keep it under ${MAX_PARTNER_CONTACT_CHARS} characters.` };
  try {
    await updatePartnerProfile(partner.slug, { contact: text });
    await audit(session.email, "update", "intake-partner-profile", partner.slug, `Updated the ${partner.name} contact details`);
    revalidatePath("/admin/intake");
    revalidatePath(partnerPath(partner.slug));
    return { ok: true, message: "Contact details saved." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
