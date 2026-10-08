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
      // Fail fast with a real error instead of hanging until the serverless
      // function is killed (which looked like "email not connected").
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }
  return transporter;
}

const SENDER_ADDRESS = SMTP_USER ?? process.env.RESEND_FROM ?? `intake@${FIRM.domain}`;

/** How email is set up on this server, for the Settings page — no secrets. */
export function emailStatus(): { method: "smtp" | "resend" | "none"; from: string; host: string; port: number } {
  const port = Number(process.env.SMTP_PORT || 465);
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  if (smtpConfigured) return { method: "smtp", from: SENDER_ADDRESS, host, port };
  if (resend) return { method: "resend", from: SENDER_ADDRESS, host: "api.resend.com", port: 443 };
  return { method: "none", from: "", host: "", port: 0 };
}

/**
 * Turn a failed send's reason into what the firm should actually do about
 * it. Google's SMTP errors are precise; this translates the common ones.
 */
export function describeSendFailure(reason: string | undefined): string {
  const r = reason ?? "";
  if (r === "not-configured") return "No email account is connected on this server: SMTP_USER / SMTP_PASS (Google Workspace) aren't set in the hosting environment.";
  if (r === "no-recipients") return "There was no email address to send to.";
  if (/535|Username and Password not accepted|Invalid login|BadCredentials|authentication failed/i.test(r)) {
    return `Google rejected the mailbox sign-in (${r.slice(0, 90)}). The App Password for ${SENDER_ADDRESS} is no longer valid — this happens after the mailbox password is changed, 2-Step Verification is reset, or the App Password is deleted. Create a new App Password in that Google account and update SMTP_PASS in the hosting environment.`;
  }
  if (/534|application-specific password|Please log in via your web browser|less secure/i.test(r)) {
    return `Google wants an App Password, not the regular mailbox password (${r.slice(0, 90)}). Turn on 2-Step Verification for ${SENDER_ADDRESS}, create an App Password, and set it as SMTP_PASS.`;
  }
  if (/550|5\.7\.1|Daily user sending (quota|limit)|quota exceeded|rate limit/i.test(r)) {
    return `Google refused the message (${r.slice(0, 120)}) — usually the mailbox's daily sending limit or a blocked recipient. Wait and retry, or check the mailbox for a security alert.`;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Greeting never received|Connection timeout|socket/i.test(r)) {
    return `Couldn't reach the mail server (${r.slice(0, 90)}). Check SMTP_HOST / SMTP_PORT in the hosting environment (Google Workspace is smtp.gmail.com, port 465).`;
  }
  if (/self.signed|certificate/i.test(r)) return `The mail server's TLS certificate was rejected (${r.slice(0, 90)}). Check SMTP_HOST and SMTP_PORT.`;
  return `The mail server returned: ${r.slice(0, 200) || "unknown error"}.`;
}

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
