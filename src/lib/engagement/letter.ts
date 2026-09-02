import "server-only";
import JSZip from "jszip";
import { ENGAGEMENT_TEMPLATE_B64 } from "./template-docx";
import {
  OFFICE_INFO, PHASE1_STANDARD, PHASE2_STANDARD,
  type EngagementOffice, type EngagementSide,
} from "./config";
import type { EngagementFees } from "@/db/schema";

/**
 * Fills the firm's engagement-letter template (.docx). The template is the
 * attorney's own Word letter with its fill-in fields swapped for {{TOKENS}} —
 * we only ever replace token text inside word/document.xml, so the letterhead,
 * footers, numbering, and formatting stay exactly as the attorney built them.
 */

export type LetterData = {
  clientName: string;
  businessName: string;
  officerTitle: string;
  andIndividually: boolean;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  office: EngagementOffice;
  side: EngagementSide;
  generalDescription: string;
  caseNumber: string;
  caseStyling: string;
  phase1Custom: string;
  phase2Custom: string;
  /** Whether the engagement includes the pre-litigation phase / the lawsuit
   *  phase. At least one must be true; a single phase renders as plain
   *  "REPRESENTATION" with no phase numbering. */
  phase1: boolean;
  phase2: boolean;
  fees: EngagementFees;
  openUntil: Date | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CT = { timeZone: "America/Chicago" } as const;
const longDate = (d: Date) => d.toLocaleDateString("en-US", { ...CT, month: "long", day: "numeric", year: "numeric" });
const deadlineText = (d: Date) => {
  const day = d.toLocaleDateString("en-US", { ...CT, weekday: "long" });
  const time = d
    .toLocaleTimeString("en-US", { ...CT, hour: "numeric", minute: "2-digit" })
    .toLowerCase().replace(" am", " a.m.").replace(" pm", " p.m.");
  return `${day}, ${longDate(d)} at ${time}`;
};

/** "Bosque" or "Bosque County" → "Bosque County". */
const countyLabel = (c: string) => {
  const t = c.trim();
  if (!t) return "";
  return /county$/i.test(t) ? t : `${t} County`;
};

/** Locate the whole <w:p>…</w:p> containing `idx` (paragraphs never nest). */
function paragraphAt(xml: string, idx: number): { start: number; end: number } {
  const start = xml.lastIndexOf("<w:p ", idx) >= 0
    ? Math.max(xml.lastIndexOf("<w:p ", idx), xml.lastIndexOf("<w:p>", idx))
    : xml.lastIndexOf("<w:p>", idx);
  const end = xml.indexOf("</w:p>", idx) + "</w:p>".length;
  if (start < 0 || end < "</w:p>".length) throw new Error("engagement template: paragraph not found");
  return { start, end };
}

/** Remove the paragraph containing the token (used for optional lines). */
function dropParagraph(xml: string, token: string): string {
  const idx = xml.indexOf(token);
  if (idx < 0) return xml;
  const { start, end } = paragraphAt(xml, idx);
  return xml.slice(0, start) + xml.slice(end);
}

/** Swap the text of one uniquely-identified run. Throws if the template drifted. */
function swapRun(xml: string, from: string, to: string): string {
  const needle = `>${from}</w:t>`;
  if (!xml.includes(needle)) throw new Error(`engagement template: run not found: ${from.slice(0, 40)}`);
  return xml.replace(needle, `>${esc(to)}</w:t>`);
}

/** Remove a whole scope section: its heading paragraph, the scope-item
 *  paragraph, and the "Assisting and otherwise counsel…" closer that follows. */
function dropScopeSection(xml: string, headingNeedle: string, itemToken: string): string {
  const h = xml.indexOf(headingNeedle);
  if (h >= 0) {
    const p = paragraphAt(xml, h);
    xml = xml.slice(0, p.start) + xml.slice(p.end);
  }
  const i = xml.indexOf(itemToken);
  if (i < 0) return xml;
  const p = paragraphAt(xml, i);
  let end = p.end;
  const nextEnd = xml.indexOf("</w:p>", p.end);
  if (nextEnd >= 0 && xml.slice(p.end, nextEnd).includes("Assisting and otherwise")) end = nextEnd + "</w:p>".length;
  return xml.slice(0, p.start) + xml.slice(end);
}

/**
 * Shape the letter's phase structure. Both phases keep the Phase 1 / Phase 2
 * framing (with a defendant getting "PRE-LITIGATION" instead of "DEMAND
 * LETTER"); a single phase drops the numbering entirely — the scope heading
 * becomes "REPRESENTATION" and the fee paragraph opens "RETAINER:". A letter
 * without the lawsuit phase also drops the trial-retainer paragraphs.
 */
function applyPhases(xml: string, d: Pick<LetterData, "phase1" | "phase2" | "side">): string {
  const both = d.phase1 && d.phase2;
  const defendant = d.side === "defendant";

  if (d.phase1) {
    xml = swapRun(xml, "PHASE 1: DEMAND LETTER ",
      both ? (defendant ? "PHASE 1: PRE-LITIGATION " : "PHASE 1: DEMAND LETTER ") : "REPRESENTATION");
    if (!both) {
      xml = swapRun(xml, "PHASE 1:", "RETAINER:");
      xml = swapRun(xml, "Phase 1 of this representation will require an Initial Retainer of ",
        "This representation will require an Initial Retainer of ");
    }
    if (defendant) {
      xml = xml.replace("prepare a demand letter, and correspond", "respond to any demand received, and correspond");
    }
  } else {
    xml = dropScopeSection(xml, ">PHASE 1: DEMAND LETTER </w:t>", "{{PHASE1_ITEM}}");
    xml = dropParagraph(xml, ">PHASE 1:</w:t>"); // the Phase 1 fee paragraph
  }

  if (d.phase2) {
    if (!both) {
      xml = swapRun(xml, "PHASE 2: LAWSUIT ", "REPRESENTATION");
      xml = swapRun(xml, "PHASE 2 ", "RETAINER");
      xml = swapRun(xml, "Phase 2 of this representation will require that the client bring its retainer to an amount of ",
        "This representation will require a retainer of ");
      // Both "(this phase is optional)" runs — the scope heading's and the fee
      // paragraph's — go away when this is the only phase.
      xml = xml.replaceAll(">(this phase is optional)</w:t>", "></w:t>");
    }
  } else {
    xml = dropScopeSection(xml, ">PHASE 2: LAWSUIT </w:t>", "{{PHASE2_ITEM}}");
    xml = dropParagraph(xml, ">PHASE 2 </w:t>"); // the Phase 2 fee paragraph
    // No lawsuit phase → the trial-retainer language doesn't belong.
    xml = dropParagraph(xml, ">TRIAL RETAINER: </w:t>");
    xml = dropParagraph(xml, "{{TRIAL_RETAINER}}");
  }
  return xml;
}

/**
 * Expand a scope-item token into one cloned paragraph per bullet, keeping the
 * template paragraph's indentation/formatting. All but the last end with ";",
 * the last with "; and" (the template's closing "Assisting and otherwise
 * counsel…" item follows).
 */
function expandItems(xml: string, token: string, bullets: string[]): string {
  const idx = xml.indexOf(token);
  if (idx < 0) throw new Error(`engagement template: ${token} missing`);
  const { start, end } = paragraphAt(xml, idx);
  const proto = xml.slice(start, end);
  const list = bullets.length ? bullets : ["Representing the Client in this matter"];
  const paras = list
    .map((b, i) => proto.replace(token, esc(b) + (i === list.length - 1 ? "; and" : ";")))
    .join("");
  return xml.slice(0, start) + paras + xml.slice(end);
}

/** Custom scope text → clean bullet lines (one per line, tidy punctuation). */
function customLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").replace(/[;.\s]+$/, "").trim())
    .filter(Boolean);
}

export function letterFileName(d: Pick<LetterData, "clientName" | "businessName">, when = new Date()): string {
  const who = (d.businessName || d.clientName || "Client").replace(/[\\/:*?"<>|]+/g, "").trim();
  const mmddyyyy = when.toLocaleDateString("en-US", { ...CT, month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".");
  return `Engagement Letter - ${who} - ${mmddyyyy}.docx`;
}

export async function buildEngagementLetter(d: LetterData): Promise<Buffer> {
  if (!d.phase1 && !d.phase2) throw new Error("engagement letter needs at least one phase");
  const zip = await JSZip.loadAsync(Buffer.from(ENGAGEMENT_TEMPLATE_B64, "base64"));
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("engagement template: word/document.xml missing");
  let xml = await doc.async("string");

  xml = applyPhases(xml, d);

  // RE: line — skip empty pieces so there's no "; ;" litter.
  const reTail = [
    d.generalDescription.trim(),
    d.caseNumber.trim() ? `Cause No. ${d.caseNumber.trim()}` : "",
    d.caseStyling.trim(),
    countyLabel(d.county) ? `${countyLabel(d.county)}, ${d.state.trim() || "Texas"}` : "",
  ].filter(Boolean).map((p) => `; ${p}`).join("");

  // Optional lines vanish entirely when they don't apply.
  xml = d.businessName.trim() ? xml : dropParagraph(xml, "{{BUSINESS_NAME}}");
  const signer2 = d.businessName.trim()
    ? `and as ${d.officerTitle.trim() || "____________________"} of ${d.businessName.trim()}`
    : "";
  xml = signer2 ? xml : dropParagraph(xml, "{{SIGNER_LINE2}}");
  const signer1 = d.clientName.trim() + (d.businessName.trim() && d.andIndividually ? ", Individually" : "");

  // Phase scope items: standard language for the side + case-specific lines.
  if (d.phase1) xml = expandItems(xml, "{{PHASE1_ITEM}}", [...PHASE1_STANDARD[d.side], ...customLines(d.phase1Custom)]);
  if (d.phase2) xml = expandItems(xml, "{{PHASE2_ITEM}}", [...PHASE2_STANDARD[d.side], ...customLines(d.phase2Custom)]);

  const values: Record<string, string> = {
    TODAY: longDate(new Date()),
    CLIENT_EMAIL: d.email.trim() || "____________________",
    BUSINESS_NAME: d.businessName.trim(),
    CLIENT_NAME: d.clientName.trim() || "____________________",
    STREET: d.street.trim() || "____________________",
    CITY: d.city.trim() || "____________",
    STATE: d.state.trim() || "Texas",
    ZIP: d.zip.trim() || "______",
    RE_TAIL: reTail,
    PHASE1_RETAINER: money(d.fees.phase1Retainer),
    LITIGATION_RETAINER: money(d.fees.litigationRetainer),
    MIN_TRUST: money(d.fees.minTrustBalance),
    TRIAL_RETAINER: money(d.fees.trialRetainer),
    ATTORNEY_RATE: money(d.fees.attorneyRate),
    ASSOCIATE_RATE: money(d.fees.associateRate),
    STAFF_RATE: money(d.fees.staffRate),
    DEADLINE: d.openUntil ? deadlineText(d.openUntil) : "____________________",
    OFFICE_PHONE: OFFICE_INFO[d.office].phone,
    SIGNER_LINE1: signer1 || "____________________",
    SIGNER_LINE2: signer2,
  };
  xml = xml.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key: string) =>
    key in values ? esc(values[key]) : m,
  );

  zip.file("word/document.xml", xml);
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
