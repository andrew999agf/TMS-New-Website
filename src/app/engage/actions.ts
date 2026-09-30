"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters, intakeSubmissions } from "@/db/schema";
import { audit } from "@/lib/auth";
import { sendEmail, emailConfigured } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { getIntakeRecipients } from "@/lib/content";

/**
 * Client-side e-signature for an engagement letter, reached only through the
 * unguessable /engage/<token> link. The signature record is the typed name +
 * consent, with the signer's email, IP, and user agent captured server-side
 * and the timestamp set here — then the letter flips to "signed" and the firm
 * gets an email. No login: the token IS the authorization, like the firm's
 * other client-facing links.
 */
export async function signEngagement(token: string, input: { name: string; email: string; agree: boolean }) {
  if (!db) return { ok: false as const, error: "Temporarily unavailable — please call the office." };
  const t = String(token ?? "").slice(0, 64);
  const name = String(input.name ?? "").trim().slice(0, 191);
  const email = String(input.email ?? "").trim().slice(0, 255);
  if (!t) return { ok: false as const, error: "This link is not valid." };
  if (!input.agree) return { ok: false as const, error: "Please check the agreement box to sign." };
  if (name.length < 3) return { ok: false as const, error: "Please type your full legal name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false as const, error: "Please enter a valid email address." };

  try {
    const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.signToken, t));
    if (!letter) return { ok: false as const, error: "This link is not valid." };
    if (letter.status === "signed") return { ok: true as const, already: true };
    if (letter.status === "declined") return { ok: false as const, error: "This engagement letter is no longer open. Please call the office." };
    if (letter.openUntil && new Date() > letter.openUntil) {
      return { ok: false as const, error: "This offer of representation has expired. Please call the office to discuss next steps." };
    }

    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
    const ua = (h.get("user-agent") ?? "").slice(0, 500);

    await db.update(engagementLetters).set({
      status: "signed", signedAt: new Date(),
      signerName: name, signerEmail: email, signerIp: ip, signerUserAgent: ua,
      updatedAt: new Date(),
    }).where(eq(engagementLetters.id, letter.id));
    if (letter.intakeId) {
      try { await db.update(intakeSubmissions).set({ status: "converted" }).where(eq(intakeSubmissions.id, letter.intakeId)); } catch { /* lead may be gone */ }
    }
    try { await audit(email, "update", "engagement-letter", String(letter.id), `E-signed by ${name} (${ip})`); } catch { /* never block the signature */ }

    if (emailConfigured) {
      try {
        // The whole intake team hears about a signature, not just the inbox.
        let team: string[] = [];
        try {
          team = [...new Set((await getIntakeRecipients(true)).map((r) => r.email.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
        } catch { /* fall back to the firm inbox */ }
        await sendEmail({
          to: team.length ? team : FIRM.email,
          subject: `Engagement letter SIGNED — ${letter.businessName || letter.clientName}`,
          fromName: "Engagement e-sign",
          html: `<p><strong>${letter.businessName || letter.clientName}</strong>'s engagement letter was just signed electronically.</p>
<p>Signed by: <strong>${name.replace(/</g, "&lt;")}</strong> &lt;${email.replace(/</g, "&lt;")}&gt;<br/>
When: ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} (Central)<br/>
IP: ${ip || "unknown"}</p>
<p>Letter #${letter.id}${letter.intakeId ? ` — intake lead #${letter.intakeId} moved to Converted` : ""}. Open the Intake tab to see it.</p>`,
        });
      } catch { /* notification is best-effort */ }
    }

    return { ok: true as const };
  } catch (err) {
    console.error("[engage] signEngagement failed:", err);
    return { ok: false as const, error: "Something went wrong — please call the office." };
  }
}
