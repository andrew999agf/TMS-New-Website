import "server-only";
import { OFFICE_INFO, type EngagementOffice } from "./config";
import { FIRM } from "@/lib/firm";
import { getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml, firmSignatureHtml } from "@/lib/email-template";
import type { EngagementEmailTemplate } from "./email-shared";

export { DEFAULT_PAYMENT_LINK, type EngagementEmailTemplate } from "./email-shared";

/**
 * The firm's engagement emails, exactly as Max sends them today — two bodies
 * (engagement letter vs. fee agreement), each office-aware (phone + PO box),
 * with the e-sign link woven in where the old copy said the letter "will also
 * be sent for signature through an e-sign link." Rendered in the same branded
 * shell as the turnback email (logo band, theme colors, dark footer), closed
 * with the managing-attorney signature block and the firm's confidentiality
 * boilerplate.
 */

const OFFICE_MAIL: Record<EngagementOffice, { lines: string[]; phone: string }> = {
  "fort-worth": { lines: [FIRM.name, "PO Box 11009", "Fort Worth, Texas 76110"], phone: "(817) 348-8325" },
  meridian: { lines: [FIRM.name, "PO Box 123", "Meridian, Texas 76665"], phone: "(254) 435-4288" },
};

export type EngagementEmailOpts = {
  template: EngagementEmailTemplate;
  office: EngagementOffice;
  clientName: string;
  signUrl: string;
  paymentLink: string;
  /** Fee-agreement template only. */
  criminalNote?: boolean;
  debtNote?: boolean;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function buildEngagementEmail(o: EngagementEmailOpts): Promise<{ subject: string; html: string }> {
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const firmName = globals["global.firmName"] || FIRM.name;

  const office = OFFICE_MAIL[o.office] ?? OFFICE_MAIL["fort-worth"];
  const phone = office.phone || OFFICE_INFO[o.office]?.phone || "";
  const p = (html: string) => `<p style="margin:0 0 12px;line-height:1.6;color:${colors.ink}">${html}</p>`;
  const addr = `<span style="color:${colors.inkMuted}">${office.lines.map(esc).join("<br/>")}</span>`;
  const pay = `<a href="${esc(o.paymentLink)}" style="color:${colors.accent};font-weight:bold">Payment Link</a>`;
  const signBtn = `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px"><tr>
    <td style="background-color:${colors.accent};border-radius:6px">
      <a href="${esc(o.signUrl)}" style="display:inline-block;padding:11px 22px;color:#ffffff;font-weight:bold;text-decoration:none">Review &amp; sign the letter electronically</a>
    </td>
  </tr></table>`;
  const parts: string[] = [];
  let subject: string;

  if (o.template === "engagement") {
    subject = `Engagement Letter — ${firmName}`;
    parts.push(p(`Dear ${esc(o.clientName)},`));
    parts.push(p("Please see the attached engagement letter outlining a proposal for our office’s services. If you would like our office to represent you in this matter please do the following:"));
    parts.push(`<ol style="margin:0 0 12px;padding-left:22px;line-height:1.7;color:${colors.ink}">
      <li>Sign and return the engagement letter,</li>
      <li>Pay the applicable retainer fee, and</li>
      <li>Email a copy of your Driver License.</li>
    </ol>`);
    parts.push(p("The attached engagement letter can be signed electronically here:"));
    parts.push(signBtn);
    parts.push(p(`Please review the letter and if you have any questions please feel free to contact our office at <strong>${esc(phone)}</strong>.`));
    parts.push(p(`Payments may be made by check, money order, or debit card to the following address:<br/>${addr}`));
    parts.push(p(`Payments may also be made through the payment link below:<br/>${pay}`));
    parts.push(p("Again, if you have any questions or concerns, please do not hesitate to contact our office."));
  } else {
    subject = `Fee Agreement — ${firmName}`;
    parts.push(p(`Dear ${esc(o.clientName)},`));
    parts.push(p("Please see the attached Fee Agreement outlining a proposal for our firm's services. If you would like our office to represent you in this matter, please do the following:"));
    parts.push(`<ol style="margin:0 0 12px;padding-left:22px;line-height:1.7;color:${colors.ink}">
      <li>Complete the Information Sheet and Fee Agreement,</li>
      <li>Send a copy of your Driver License,</li>
      <li>Return the completed signed agreement, and</li>
      <li>Make the payment in full or call the office to set up an auto draft if there is a payment plan (as outlined in the agreement).</li>
    </ol>`);
    parts.push(p("Our office will not be able to represent you in this matter unless all of the above-referenced steps are completed. Our firm must be in receipt of checks/money order or have a photo of such signed check/money order before we can commence any work in this matter."));
    parts.push(p("The Fee Agreement can be signed electronically here:"));
    parts.push(signBtn);
    parts.push(p(`Please review the letter and if you have any questions, please feel free to contact our office at <strong>${esc(phone)}</strong>.`));
    if (o.criminalNote) {
      parts.push(p(`<strong>IMPORTANT REGARDING CRIMINAL CASES:</strong> Please do not discuss your case with anyone. Do Not discuss your case with anyone in person, in writing, or over the telephone. Telephone calls are recorded in the jail and can be used as evidence against you in court. Feel free to contact my office by telephone, email or letter regarding the facts of your case. Upon receipt of this letter, please call me to ensure that I have your updated contact information, including your current address and telephone number.`));
    }
    if (o.debtNote) {
      parts.push(p(`<strong>IMPORTANT REGARDING DEBT CASES:</strong> If you suspect that any credit card or account used for payment has been compromised or is subject to fraudulent activity, please notify our office immediately. In such cases, we require you to provide a copy of the police report documenting the reported fraud before we can proceed with alternative payment arrangements.`));
    }
    parts.push(p(`Checks and money orders may be made payable to:<br/>${addr}`));
    parts.push(p(`<strong>CREDIT CARD PAYMENTS ARE NOT ACCEPTED</strong><br/>For Debit Card Payments: ${pay}`));
    parts.push(p(`If you would like to set up an automatic draft for a payment plan, please contact the office at <strong>${esc(phone)}</strong>.`));
    parts.push(p("Again, if you have any questions or concerns, please do not hesitate to contact our office."));
  }

  parts.push(firmSignatureHtml(colors));

  const html = brandedEmailHtml({
    colors,
    fonts,
    logoLight: globals["global.logoLight"] || undefined,
    logoDark: globals["global.logoDark"] || undefined,
    firmName,
    bodyHtml: parts.join(""),
    // The signature block above already lists every office — the template's
    // own office footer would just repeat it all.
    footer: false,
  });
  return { subject, html };
}
