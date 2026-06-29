"use server";

import { FIRM } from "@/lib/firm";
import { getBranch } from "@/lib/intake/config";
import { requireAdmin, audit } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml } from "@/lib/email-template";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Send a prospective client a branded "please complete your intake" email with
 * a big, clear button that deep-links to the right intake (by practice area).
 * Matches the post-submission acknowledgment styling (brandedEmailHtml).
 */
export async function sendIntakeRequest(input: {
  name?: string;
  email: string;
  branchIds: string[];
  note?: string;
}) {
  const session = await requireAdmin();

  const email = (input.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: "Enter a valid email address." };
  }
  const branches = (input.branchIds || []).map(getBranch).filter((b): b is NonNullable<typeof b> => Boolean(b));
  if (branches.length === 0) {
    return { ok: false as const, error: "Choose at least one intake to send." };
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`).replace(/\/$/, "");
  const link = (slug: string) => `${baseUrl}/consultation?practice=${encodeURIComponent(slug)}`;

  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;
  const greeting = input.name?.trim() ? esc(input.name.trim()) : "there";
  const note = input.note?.trim();

  // Email-safe, table-based CTA button in the firm accent color.
  const button = (label: string, href: string) => `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 12px"><tr>
      <td align="center" bgcolor="${colors.accent}" style="background-color:${colors.accent};border-radius:8px">
        <a href="${href}" style="display:inline-block;padding:15px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${colors.onAccent};text-decoration:none">${esc(label)} &rarr;</a>
      </td></tr></table>`;

  const buttons = branches.map((b) => button(`Start the ${b.label} intake`, link(b.practiceSlug))).join("");
  const plainLinks = branches.map((b) => link(b.practiceSlug)).join("<br/>");
  const matterList = branches.map((b) => b.label).join(", ");

  const body = `
    <p style="margin:0 0 14px">Dear ${greeting},</p>
    <p style="margin:0 0 16px">To help us assist you, please complete the short intake form below. It only takes a few minutes and sends your information to the right place at our office.</p>
    ${note ? `<p style="margin:0 0 16px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}">${esc(note)}</p>` : ""}
    <div style="margin:8px 0 18px">${buttons}</div>
    <p style="margin:0 0 16px;font-size:13px;color:${colors.inkMuted}">If the button doesn&rsquo;t work, copy and paste this link into your browser:<br/>${plainLinks}</p>
    <p style="margin:0 0 14px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>This does not create an attorney-client relationship.</strong> Our firm does not represent you until you have signed a representation agreement issued by our firm and paid the applicable retainer fee.</p>
    <p style="margin:18px 0 0;color:${colors.inkMuted};font-size:13px">&mdash; The office of ${esc(firmName)}</p>`;

  const html = brandedEmailHtml({
    colors,
    fonts,
    logoLight: globals["global.logoLight"] || undefined,
    logoDark: globals["global.logoDark"] || undefined,
    firmName,
    bodyHtml: body,
  });

  const subject =
    branches.length === 1
      ? `${firmName}: please complete your ${branches[0].label} intake`
      : `${firmName}: please complete your intake`;

  const res = await sendEmail({ to: email, fromName: firmName, subject, html });
  if (!res.sent) {
    return { ok: false as const, error: "Email isn't configured yet, or sending failed. Check email settings." };
  }
  await audit(session.email, "send", "intake-request", email, `Sent intake request (${matterList}) to ${email}`);
  return { ok: true as const };
}
