import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { intakeContracts, intakeSubmissions } from "@/db/schema";
import { cleanContract, emptyContract, letterNotes, type ContractData } from "@/lib/engagement/tml-fields";
import { engagementDefaultRates } from "@/lib/engagement/rates";
import { PARTNER_AREAS, partnerOfAnswers } from "./partners";

/**
 * Engagement letters for partner-office leads: what has been filled in so far
 * is saved per lead, and starts from what the person entered on the intake
 * form so the intake team only fills in what is left.
 */
export const CONTRACT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS intake_contracts (id serial PRIMARY KEY, intake_id integer NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_by varchar(255) NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS intake_contracts_intake_uq ON intake_contracts (intake_id)`,
];
let ensured: Promise<void> | null = null;
export async function ensureContracts(): Promise<void> {
  if (!db) return;
  if (!ensured) ensured = (async () => { for (const stmt of CONTRACT_DDL) await db!.execute(sql.raw(stmt)); })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

const centralToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
const plusDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export type LeadForContract = { id: number; name: string; email: string; phone: string; county: string; branch: string; answers: Record<string, unknown>; partnerName: string; partnerSlug: string };

export async function leadForContract(id: number): Promise<LeadForContract | null> {
  if (!db || !Number.isFinite(id)) return null;
  const [l] = await db.select().from(intakeSubmissions).where(eq(intakeSubmissions.id, id)).limit(1);
  if (!l) return null;
  const answers = (l.answers ?? {}) as Record<string, unknown>;
  const partner = partnerOfAnswers(answers);
  if (!partner) return null; // this letter is the one drafted for partner-office cases
  return { id: l.id, name: l.name ?? "", email: l.email ?? "", phone: l.phone ?? "", county: l.county ?? "", branch: l.branch, answers, partnerName: partner.name, partnerSlug: partner.slug };
}

/** The starting point: everything the intake form already told us. Nothing here is saved until the team saves it. */
export async function prefillContract(lead: LeadForContract): Promise<ContractData> {
  const a = lead.answers, d = emptyContract(), today = centralToday();
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const addr = (a.address && typeof a.address === "object" ? a.address : {}) as Record<string, unknown>;
  const rates = await engagementDefaultRates().catch(() => null);
  const area = PARTNER_AREAS.find((x) => x.label === s("practiceArea"));
  const other = s("opposingParty"), name = lead.name.trim();
  d.date = today; d.openUntil = plusDays(today, 14);
  d.clientName = name; d.clientEmail = lead.email.trim(); d.lastName = name.split(/\s+/).filter(Boolean).slice(-1)[0] ?? "";
  d.street = String(addr.street ?? "").trim(); d.city = String(addr.city ?? "").trim(); d.state = String(addr.state ?? "").trim() || "TX"; d.zip = String(addr.zip ?? "").trim();
  d.county = lead.county.replace(/\s+county$/i, "").trim();
  // A first guess at the case style from who is on the other side; the team corrects it.
  if (other && name) d.caseStyle = lead.branch === "sued" ? `${other} v. ${name}` : lead.branch === "sue" ? `${name} v. ${other}` : "";
  d.court = s("caseFiled") === "Yes" ? s("caseInfo") : "";
  d.noCourt = s("caseFiled") === "No";
  if (area && area.id !== "other") { d.matterTypeEn = area.label; d.matterTypeEs = area.labelEs.replace(/\s*\(probate\)/i, ""); }
  if (rates) { d.standardAttorneyRate = String(rates.attorneyRate); d.standardAssociateRate = String(rates.associateRate); d.staffRate = String(rates.staffRate); }
  return d;
}

export async function loadContract(lead: LeadForContract): Promise<{ data: ContractData; saved: boolean; updatedAt: string | null; updatedBy: string }> {
  await ensureContracts();
  const [row] = db ? await db.select().from(intakeContracts).where(eq(intakeContracts.intakeId, lead.id)).limit(1) : [];
  if (row) return { data: cleanContract(row.data), saved: true, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
  return { data: await prefillContract(lead), saved: false, updatedAt: null, updatedBy: "" };
}

export async function saveContractData(leadId: number, data: ContractData, by: string): Promise<void> {
  if (!db) throw new Error("Database not configured.");
  await ensureContracts();
  await db.insert(intakeContracts).values({ intakeId: leadId, data, updatedBy: by }).onConflictDoUpdate({ target: intakeContracts.intakeId, set: { data, updatedBy: by, updatedAt: new Date() } });
}

/** For the list on the partner's tab: how far along each lead's letter is. */
export async function contractProgress(leadIds: number[]): Promise<Map<number, { blanks: number; updatedAt: string }>> {
  const out = new Map<number, { blanks: number; updatedAt: string }>();
  if (!db || leadIds.length === 0) return out;
  await ensureContracts();
  const rows = await db.select().from(intakeContracts).where(inArray(intakeContracts.intakeId, leadIds));
  for (const r of rows) out.set(r.intakeId, { blanks: letterNotes(cleanContract(r.data)).blank.length, updatedAt: r.updatedAt.toISOString() });
  return out;
}
