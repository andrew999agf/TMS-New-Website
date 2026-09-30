"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters, intakeSubmissions } from "@/db/schema";
import { audit } from "@/lib/auth";
import { sendEmail, emailConfigured } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { getIntakeRecipients } from "@/lib/content";
import { letterPdf, ensureCaseForSignedLetter } from "@/lib/engagement/signed";
import { buildSignedCopyEmail } from "@/lib/engagement/email";

/**
 * Client-side e-signature for an engagement letter, reached only through the
 * unguessable /engage/<token> link. The signature is the typed name (rendered
 * in script) or a drawn mark, plus consent; the signer's email, IP, and user
 * agent are captured server-side. On signing, the letter flips to "signed",
 * a signed PDF goes to the client and the intake team, and the matter appears
 * in Matters/Cases automatically. No login: the token IS the authorization.
 */
export async function signEngagement(
  token: string,
  input: { name: string; email: string; agree: boolean; initials?: string; signature?: { kind: "typed" | "drawn"; image?: string } },
) {
  if (!db) return { ok: false as const, error: "Temporarily unavailable — please call the office." };
  const t = String(token ?? "").slice(0, 64);
  const name = String(input.name ?? "").trim().slice(0, 191);
  const email = String(input.email ?? "").trim().slice(0, 255);
  if (!t) return { ok: false as const, error: "This link is not valid." };
  if (!input.agree) return { ok: false as const, error: "Please check the agreement box to sign." };
  if (name.length < 3) return { ok: false as const, error: "Please type your full legal name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false as const, error: "Please enter a valid email address." };
  // Initials fill the letter's "Client Initials:" blanks; default from the name.
  let initials = String(input.initials ?? "").replace(/[^A-Za-z.]/g, "").slice(0, 8).toUpperCase();
  if (!initials) initials = name.split(/\s+/).map((w) => w[0] ?? "").join("").replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase();

  // The drawn signature arrives as a small PNG data URL from the canvas.
  let signatureKind: "typed" | "drawn" = "typed";
  let signatureImage: string | null = null;
  if (input.signature?.kind === "drawn") {
    const img = String(input.signature.image ?? "");
    if (!img.startsWith("data:image/png;base64,")) return { ok: false as const, error: "Please draw your signature, or switch to typing it." };
    const b64 = img.slice("data:image/png;base64,".length);
    if (b64.length < 500 || b64.length > 800_000) return { ok: false as const, error: "Please draw your signature, or switch to typing it." };
    signatureKind = "drawn";
    signatureImage = b64;
  }

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
    const signedAt = new Date();

    await db.update(engagementLetters).set({
      status: "signed", signedAt,
      signerName: name, signerEmail: email, signerIp: ip, signerUserAgent: ua,
      signatureKind, signatureImage, signatureInitials: initials,
      updatedAt: new Date(),
    }).where(eq(engagementLetters.id, letter.id));
    if (letter.intakeId) {
      try { await db.update(intakeSubmissions).set({ status: "converted" }).where(eq(intakeSubmissions.id, letter.intakeId)); } catch { /* lead may be gone */ }
    }
    try { await audit(email, "update", "engagement-letter", String(letter.id), `E-signed by ${name} (${ip}, ${signatureKind})`); } catch { /* never block the signature */ }

    const signedRow = { ...letter, status: "signed" as const, signedAt, signerName: name, signerEmail: email, signerIp: ip, signatureKind, signatureImage, signatureInitials: initials };

    // A signed engagement is a real case — it appears in Matters/Cases now.
    try { await ensureCaseForSignedLetter(signedRow); } catch { /* best-effort; the letter record stands */ }

    if (emailConfigured) {
      // The signed PDF (letter + signature page) rides on both emails.
      let attachment: { filename: string; content: Buffer; contentType: string } | null = null;
      try {
        const pdf = await letterPdf(signedRow);
        if (pdf) attachment = { filename: pdf.fileName, content: pdf.buf, contentType: "application/pdf" };
      } catch { /* the notification still goes without it */ }

      // Client's copy.
      try {
        const { subject, html } = await buildSignedCopyEmail({
          clientName: letter.clientName,
          office: (letter.office === "meridian" ? "meridian" : "fort-worth"),
        });
        await sendEmail({ to: email, subject, html, fromName: FIRM.name, attachments: attachment ? [attachment] : undefined });
      } catch { /* best-effort */ }

      // The whole intake team hears about a signature, with the signed PDF.
      try {
        let team: string[] = [];
        try {
          team = [...new Set((await getIntakeRecipients(true)).map((r) => r.email.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
        } catch { /* fall back to the firm inbox */ }
        await sendEmail({
          to: team.length ? team : FIRM.email,
          subject: `Engagement letter SIGNED — ${letter.businessName || letter.clientName}`,
          fromName: "Engagement e-sign",
          html: `<p><strong>${letter.businessName || letter.clientName}</strong>'s engagement letter was just signed electronically.${attachment ? " The signed PDF is attached." : ""}</p>
<p>Signed by: <strong>${name.replace(/</g, "&lt;")}</strong> &lt;${email.replace(/</g, "&lt;")}&gt; (${signatureKind} signature)<br/>
When: ${signedAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} (Central)<br/>
IP: ${ip || "unknown"}</p>
<p>Letter #${letter.id}${letter.intakeId ? ` — intake lead #${letter.intakeId} moved to Converted` : ""}. The matter was added to Matters/Cases automatically. Open the Intake tab to see the letter.</p>`,
          attachments: attachment ? [attachment] : undefined,
        });
      } catch { /* notification is best-effort */ }
    }

    return { ok: true as const };
  } catch (err) {
    console.error("[engage] signEngagement failed:", err);
    return { ok: false as const, error: "Something went wrong — please call the office." };
  }
}
