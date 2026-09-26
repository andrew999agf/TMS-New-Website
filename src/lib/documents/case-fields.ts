import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { caseHub, type CaseParty } from "@/db/schema";
import { FIRM, PRINCIPAL_OFFICE } from "@/lib/firm";

/**
 * The standard merge-field vocabulary: the field names firm templates use
 * ({{client_name}}, {{cause_number}}, …) and how each auto-fills from the
 * case hub and firm constants. Both the form builder and AI.fred draw from
 * this, so a matter number fills the same blanks everywhere.
 */

export const STANDARD_FIELDS: { name: string; label: string }[] = [
  { name: "matter", label: "Matter number" },
  { name: "case_name", label: "Case style / name" },
  { name: "cause_number", label: "Cause number" },
  { name: "court", label: "Court" },
  { name: "county", label: "County" },
  { name: "client_name", label: "Client name" },
  { name: "client_address", label: "Client address" },
  { name: "client_phone", label: "Client phone" },
  { name: "client_email", label: "Client email" },
  { name: "plaintiffs", label: "All plaintiffs" },
  { name: "defendants", label: "All defendants" },
  { name: "opposing_party", label: "Opposing party" },
  { name: "opposing_counsel", label: "Opposing counsel" },
  { name: "opposing_counsel_firm", label: "Opposing counsel's firm" },
  { name: "opposing_counsel_address", label: "Opposing counsel's address" },
  { name: "opposing_counsel_email", label: "Opposing counsel's email" },
  { name: "today", label: "Today's date" },
  { name: "firm_name", label: "Firm name" },
  { name: "firm_address", label: "Firm address" },
  { name: "firm_phone", label: "Firm phone" },
  { name: "firm_fax", label: "Firm fax" },
  { name: "firm_email", label: "Firm email" },
  { name: "attorney_name", label: "Attorney" },
  { name: "bar_number", label: "State Bar number" },
];

const plaintiffish = (role: string) => /plaintiff|petitioner|client|applicant/i.test(role);
const defendantish = (role: string) => /defendant|respondent/i.test(role);

/** Values for the standard fields, from the case hub (fill what we know,
 *  leave the rest blank for the person or AI.fred to supply). */
export async function caseFieldValues(matter: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {
    today: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    firm_name: FIRM.name,
    firm_address: `${PRINCIPAL_OFFICE.street}, ${PRINCIPAL_OFFICE.city}, ${PRINCIPAL_OFFICE.state} ${PRINCIPAL_OFFICE.zip}`,
    firm_phone: PRINCIPAL_OFFICE.phone,
    firm_fax: FIRM.fax,
    firm_email: FIRM.email,
    attorney_name: FIRM.attorney.displayName,
    bar_number: FIRM.attorney.barNumber,
  };
  const m = matter.trim();
  if (!m || !db) return out;
  try {
    const [hub] = await db.select().from(caseHub).where(eq(caseHub.matter, m));
    if (!hub) return out;
    out.matter = hub.matter;
    if (hub.name) out.case_name = hub.name;
    if (hub.causeNumber) out.cause_number = hub.causeNumber;
    if (hub.court) out.court = hub.court;
    if (hub.county) out.county = hub.county;
    const parties = ((hub.parties as CaseParty[]) ?? []).filter((p) => p?.name);
    const ours = parties.filter((p) => plaintiffish(p.role));
    const theirs = parties.filter((p) => defendantish(p.role));
    if (ours.length) {
      const c = ours[0];
      out.client_name = c.name;
      if (c.address) out.client_address = c.address;
      if (c.phone) out.client_phone = c.phone;
      if (c.email) out.client_email = c.email;
      out.plaintiffs = ours.map((p) => p.name).join("; ");
    }
    if (theirs.length) {
      out.defendants = theirs.map((p) => p.name).join("; ");
      out.opposing_party = theirs[0].name;
      const atty = theirs.find((p) => p.attorney?.name)?.attorney;
      if (atty?.name) out.opposing_counsel = atty.name;
      if (atty?.firm) out.opposing_counsel_firm = atty.firm;
      if (atty?.address) out.opposing_counsel_address = atty.address;
      if (atty?.email) out.opposing_counsel_email = atty.email;
    }
  } catch {
    /* hub optional */
  }
  return out;
}
