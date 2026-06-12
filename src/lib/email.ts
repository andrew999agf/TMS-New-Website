import "server-only";
import { Resend } from "resend";
import { FIRM } from "./firm";

/**
 * Resend wrapper. If RESEND_API_KEY is absent, email sending is skipped and the
 * call resolves successfully (the submission is still persisted). This keeps the
 * intake flow working end-to-end before the human supplies Resend credentials.
 */

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

export const emailConfigured = Boolean(resend);

type Attachment = { filename: string; content: string };

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email] RESEND_API_KEY not set — skipping send:", subject);
    }
    return { sent: false, reason: "not-configured" };
  }
  const from = process.env.RESEND_FROM ?? `${FIRM.name} <intake@${FIRM.domain}>`;
  try {
    await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
      })),
    });
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { sent: false, reason: (err as Error).message };
  }
}

export const INTAKE_NOTIFY_TO = process.env.INTAKE_NOTIFY_EMAIL ?? FIRM.email;
