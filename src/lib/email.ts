import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { FIRM } from "./firm";

/**
 * Email delivery for intake notifications.
 *
 * Primary path: the firm's own Google Workspace (Gmail) account over secure
 * SMTP — privileged intake data leaves over TLS and stays inside the firm's
 * Google environment (no third-party email processor). Configure with:
 *   SMTP_USER  e.g. intake@texaslawsmith.com  (a Workspace mailbox)
 *   SMTP_PASS  a Google "App Password" for that mailbox
 *   SMTP_HOST  optional, defaults to smtp.gmail.com
 *   SMTP_PORT  optional, defaults to 465 (implicit TLS)
 *   SMTP_FROM  optional display From, defaults to "<FIRM.name> <SMTP_USER>"
 *
 * Optional fallback: RESEND_API_KEY (a third-party service — only used if no
 * SMTP credentials are present). If neither is configured, sending is skipped
 * and the submission is still persisted, so the intake flow never loses data.
 */

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const smtpConfigured = Boolean(SMTP_USER && SMTP_PASS);

const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;

export const emailConfigured = smtpConfigured || Boolean(resend);

let transporter: nodemailer.Transporter | null = null;
function getTransport() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

const SENDER_ADDRESS = SMTP_USER ?? process.env.RESEND_FROM ?? `intake@${FIRM.domain}`;

/** Build the From header. A per-email `fromName` keeps the sender line logical
 *  for what the message is about (e.g. an intake notice vs. a login link),
 *  instead of one fixed label on everything. */
function fromAddress(fromName?: string) {
  if (fromName) return `${fromName} <${SENDER_ADDRESS}>`;
  return process.env.SMTP_FROM || process.env.RESEND_FROM || `${FIRM.name} <${SENDER_ADDRESS}>`;
}

type Attachment = { filename: string; content: string | Buffer; contentType?: string };

export async function sendEmail({
  to,
  cc,
  subject,
  html,
  attachments,
  fromName,
  headers,
}: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
  fromName?: string;
  /** Extra MIME headers (e.g. a unique X-Entity-Ref-ID to stop Gmail threading). */
  headers?: Record<string, string>;
}): Promise<{ sent: boolean; reason?: string }> {
  const recipients = (Array.isArray(to) ? to : [to]).map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) return { sent: false, reason: "no-recipients" };
  const ccList = (Array.isArray(cc) ? cc : cc ? [cc] : []).map((s) => s.trim()).filter(Boolean);

  // 1) Google Workspace SMTP (preferred).
  const tx = getTransport();
  if (tx) {
    try {
      await tx.sendMail({
        from: fromAddress(fromName),
        to: recipients,
        cc: ccList.length ? ccList : undefined,
        subject,
        html,
        headers,
        attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      return { sent: true };
    } catch (err) {
      console.error("[email] SMTP send failed:", err);
      return { sent: false, reason: (err as Error).message };
    }
  }

  // 2) Resend fallback (only if SMTP not configured).
  if (resend) {
    try {
      await resend.emails.send({
        from: fromAddress(fromName),
        to: recipients,
        cc: ccList.length ? ccList : undefined,
        subject,
        html,
        headers,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString("base64"),
        })),
      });
      return { sent: true };
    } catch (err) {
      console.error("[email] Resend send failed:", err);
      return { sent: false, reason: (err as Error).message };
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[email] No SMTP/Resend configured — skipping send:", subject);
  }
  return { sent: false, reason: "not-configured" };
}

/** Default fallback recipient when no admin-managed recipients match. */
export const INTAKE_NOTIFY_TO = process.env.INTAKE_NOTIFY_EMAIL ?? FIRM.email;
