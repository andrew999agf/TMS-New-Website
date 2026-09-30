import "server-only";
import type { engagementLetters } from "@/db/schema";
import type { EngagementOffice, EngagementSide } from "./config";
import type { LetterData } from "./letter";
import { buildEngagementLetter } from "./letter";
import { appendSignaturePageToPdf, stampSignatureOnPdf, letterPdfFileName, type SignatureRecord } from "./pdf";
import { docxToPdf } from "./docx2pdf";
import { engagementDefaultRates } from "./rates";
import { getOrCreateCaseForMatter } from "@/lib/cases";

type LetterDbRow = typeof engagementLetters.$inferSelect;

/** DB row → the letter builder's input (used by PDF sends and downloads). */
export function letterDataFromDbRow(letter: LetterDbRow, defaultRates?: LetterData["defaultRates"]): LetterData {
  return {
    clientName: letter.clientName, businessName: letter.businessName, officerTitle: letter.officerTitle,
    andIndividually: letter.andIndividually, email: letter.email, street: letter.street, city: letter.city,
    state: letter.state, zip: letter.zip, county: letter.county,
    office: letter.office as EngagementOffice, side: letter.side as EngagementSide,
    generalDescription: letter.generalDescription, caseNumber: letter.caseNumber, caseStyling: letter.caseStyling,
    phase1Custom: letter.phase1Custom, phase2Custom: letter.phase2Custom,
    phase1: letter.phase1, phase2: letter.phase2, fees: letter.fees, openUntil: letter.openUntil,
    defaultRates,
  };
}

/** The signature captured at /engage, when the letter has been signed. */
export function signatureFromDbRow(letter: LetterDbRow): SignatureRecord | null {
  if (letter.status !== "signed" || !letter.signerName) return null;
  return {
    kind: letter.signatureKind === "drawn" && letter.signatureImage ? "drawn" : "typed",
    typedName: letter.signerName,
    imagePngBase64: letter.signatureImage ?? undefined,
    signerName: letter.signerName,
    signerEmail: letter.signerEmail,
    signedAt: letter.signedAt ?? new Date(),
    ip: letter.signerIp || undefined,
  };
}

const isPdf = (b64: string) => b64.startsWith("JVBERi"); // "%PDF"

/** The printed line under the signature — the anchor the e-signature lands on. */
function signerLineText(letter: LetterDbRow): string {
  return letter.clientName.trim() + (letter.businessName.trim() && letter.andIndividually ? ", Individually" : "");
}

/** Signature onto the line where one exists, and the record page always. */
async function applySignature(buf: Buffer, sig: SignatureRecord, anchor: string): Promise<Buffer> {
  const stamped = await stampSignatureOnPdf(buf, sig, anchor);
  return appendSignaturePageToPdf(stamped.buf, sig);
}

/**
 * The letter as the client-facing PDF: the attorney's Word letter printed to
 * PDF (docx-preview + headless Chromium — real letterhead, real layout), or
 * an uploaded edited PDF. Once signed, the signature is drawn on the
 * signature line and the electronic-signature record page is appended.
 */
export async function letterPdf(letter: LetterDbRow): Promise<{ buf: Buffer; fileName: string } | null> {
  // A frozen signed PDF is served byte-for-byte, forever. Nothing — not a
  // template change, not a rendering change, not an edit to the letter's
  // fields — alters the document the client actually signed.
  if (letter.signedPdf) {
    return { buf: Buffer.from(letter.signedPdf, "base64"), fileName: letter.signedPdfName || letterPdfFileName(letter, true) };
  }
  const sig = signatureFromDbRow(letter);
  if (letter.customDocx && isPdf(letter.customDocx)) {
    let buf: Buffer = Buffer.from(letter.customDocx, "base64");
    if (sig) buf = await applySignature(buf, sig, signerLineText(letter));
    const base = (letter.customDocxName || "Engagement Letter.pdf").replace(/\.(docx|pdf)$/i, "");
    const out = { buf, fileName: `${base}${sig ? " (signed)" : ""}.pdf` };
    if (sig) await freezeSignedPdf(letter.id, out);
    return out;
  }
  if (letter.customDocx) return null; // legacy Word upload — no PDF to serve
  const data = letterDataFromDbRow(letter, await engagementDefaultRates());
  // The letter IS the filled Word document, printed. If the print engine is
  // down, callers surface the error — the firm's letter never gets replaced
  // with a re-typeset stand-in.
  let buf = await docxToPdf(await buildEngagementLetter(data));
  if (sig) buf = await applySignature(buf, sig, signerLineText(letter));
  const out = { buf, fileName: letterPdfFileName(letter, !!sig) };
  if (sig) await freezeSignedPdf(letter.id, out); // first successful render after signing becomes THE document
  return out;
}

/** Store the signed PDF on the letter row — once, best-effort, idempotent. */
async function freezeSignedPdf(letterId: number, pdf: { buf: Buffer; fileName: string }): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { engagementLetters } = await import("@/db/schema");
    const { and, eq, isNull } = await import("drizzle-orm");
    if (!db) return;
    await db
      .update(engagementLetters)
      .set({ signedPdf: pdf.buf.toString("base64"), signedPdfName: pdf.fileName, updatedAt: new Date() })
      .where(and(eq(engagementLetters.id, letterId), isNull(engagementLetters.signedPdf)));
  } catch (err) {
    console.error("[engagement] could not freeze the signed PDF (will retry on next render):", err);
  }
}

/**
 * A signed engagement means a real case: it appears in Matters/Cases
 * automatically under a placeholder matter key until the Time Tracker matter
 * number is assigned. Never overwrites an existing record; safe to re-run.
 */
export async function ensureCaseForSignedLetter(letter: LetterDbRow): Promise<void> {
  const client = letter.businessName || letter.clientName || "New client";
  const desc = letter.generalDescription ? ` — ${letter.generalDescription}` : "";
  await getOrCreateCaseForMatter(
    {
      matter: `ENG-${letter.id}`,
      name: `${client}${desc}`,
      causeNumber: letter.caseNumber,
      county: letter.county,
      notes: `Opened automatically when the engagement letter was signed${letter.signedAt ? ` on ${letter.signedAt.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}` : ""}. Replace the ENG-${letter.id} matter key with the Time Tracker matter number once assigned.`,
      plaintiffName: letter.side === "plaintiff" ? client : "",
      defendantName: letter.side === "defendant" ? client : "",
    },
    "engagement-signed",
  );
}
