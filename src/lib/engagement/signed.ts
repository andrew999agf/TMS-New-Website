import "server-only";
import type { engagementLetters } from "@/db/schema";
import type { EngagementOffice, EngagementSide } from "./config";
import type { LetterData } from "./letter";
import { buildEngagementLetterPdf, appendSignaturePageToPdf, letterPdfFileName, type SignatureRecord } from "./pdf";
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

/**
 * The letter as the client-facing PDF: an uploaded edited copy (when it's a
 * PDF) or the generated letter, with the signature page appended once signed.
 */
export async function letterPdf(letter: LetterDbRow): Promise<{ buf: Buffer; fileName: string } | null> {
  const sig = signatureFromDbRow(letter);
  if (letter.customDocx && isPdf(letter.customDocx)) {
    let buf: Buffer = Buffer.from(letter.customDocx, "base64");
    if (sig) buf = await appendSignaturePageToPdf(buf, sig);
    const base = (letter.customDocxName || "Engagement Letter.pdf").replace(/\.(docx|pdf)$/i, "");
    return { buf, fileName: `${base}${sig ? " (signed)" : ""}.pdf` };
  }
  if (letter.customDocx) return null; // legacy Word upload — no PDF to serve
  const data = letterDataFromDbRow(letter, await engagementDefaultRates());
  return { buf: await buildEngagementLetterPdf(data, sig ?? undefined), fileName: letterPdfFileName(letter, !!sig) };
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
