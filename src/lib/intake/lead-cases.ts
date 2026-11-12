import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { caseHub, intakeCases, intakeContracts, intakeSubmissions, shareFiles, shareFolders, shareRecipients } from "@/db/schema";
import { canonicalMatter, cleanParties, findCaseForMatter, getOrCreateCaseForMatter } from "@/lib/cases";
import { upsertContact } from "@/lib/contacts";
import { cleanContract } from "@/lib/engagement/tml-fields";
import { noteLeadActivity } from "./lead-archive";

/**
 * From a converted lead to a case record.
 *
 * "Send to Cases" files the lead under its matter number in the Matters /
 * Cases hub (the same record every other tool finds), with the client added
 * as the firm's own party. Nothing here depends on where the lead came from,
 * so the main intake list can use it later; for now only a partner office's
 * tab offers it.
 *
 * A lead from a partner office can also get a two-way document folder shared
 * with that office. The folder is an ordinary share folder (type "referring")
 * filed under the same matter, so it is in Share Folders and one click from
 * the case.
 */
export const LEAD_CASE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS intake_cases (intake_id integer PRIMARY KEY, case_id integer, matter text NOT NULL DEFAULT '', share_folder_id integer, skipped boolean NOT NULL DEFAULT false,
    created_by varchar(255) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS intake_cases_case_idx ON intake_cases (case_id)`,
];
let ensured: Promise<void> | null = null;
export async function ensureLeadCases(): Promise<void> {
  if (!db) return;
  if (!ensured) ensured = (async () => { for (const stmt of LEAD_CASE_DDL) await db!.execute(sql.raw(stmt)); })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

export class LeadCaseError extends Error {}
const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const centralDate = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago" });

/** The role our client most likely has, from the kind of matter. Only a starting point: the form lets it be changed. */
export function likelyRole(practiceArea: string): string {
  const a = practiceArea.toLowerCase();
  if (/defen[sc]e/.test(a)) return "Defendant";
  if (/injury|wrongful|collection/.test(a)) return "Plaintiff";
  return "Other";
}

export type CasePrefill = { name: string; county: string; court: string; causeNumber: string; role: string };
/** What the "Send to Cases" form starts with: the engagement letter's case details where it has them, else the lead's. */
export async function casePrefills(leads: { id: number; name: string | null; county: string | null; answers: Record<string, unknown> }[]): Promise<Map<number, CasePrefill>> {
  const out = new Map<number, CasePrefill>();
  if (!leads.length) return out;
  const letters = new Map<number, ReturnType<typeof cleanContract>>();
  if (db) {
    try { for (const r of await db.select().from(intakeContracts).where(inArray(intakeContracts.intakeId, leads.map((l) => l.id)))) letters.set(r.intakeId, cleanContract(r.data)); } catch { /* no letters yet */ }
  }
  for (const l of leads) {
    const letter = letters.get(l.id);
    const area = str(l.answers.practiceArea);
    const client = str(letter?.clientName) || str(l.name);
    out.set(l.id, {
      name: str(letter?.caseStyle, 255) || [client, area].filter(Boolean).join(" — "),
      county: str(letter?.county, 96) || str(l.county, 96),
      court: letter && !letter.noCourt ? str(letter.court) : "",
      causeNumber: "",
      role: likelyRole(area),
    });
  }
  return out;
}

export type SendToCasesInput = { matter: string; name?: string; county?: string; court?: string; causeNumber?: string; role?: string };

/** File a lead under a matter in the case hub (creating the record if the matter has none) and link the two. */
export async function sendLeadToCases(leadId: number, input: SendToCasesInput, by: string): Promise<{ caseId: number; matter: string; existed: boolean }> {
  if (!db) throw new LeadCaseError("Database not configured.");
  await ensureLeadCases();
  const matterIn = canonicalMatter(input.matter);
  if (!matterIn) throw new LeadCaseError("Pick or type the matter number. It is how every tool finds this case.");
  const [lead] = await db.select().from(intakeSubmissions).where(eq(intakeSubmissions.id, leadId)).limit(1);
  if (!lead) throw new LeadCaseError("That lead no longer exists.");
  const answers = (lead.answers as Record<string, unknown>) ?? {};
  const partnerName = str(answers.partnerName);
  const area = str(answers.practiceArea) || str(lead.branch);
  let letter: ReturnType<typeof cleanContract> | null = null;
  try { const [c] = await db.select().from(intakeContracts).where(eq(intakeContracts.intakeId, leadId)).limit(1); if (c) letter = cleanContract(c.data); } catch { /* no letter */ }
  const client = str(letter?.clientName) || str(lead.name);
  const told = str(answers.description, 1500) || str(lead.message, 1500);
  const notes = [
    `From intake: ${partnerName ? `came in through ${partnerName}` : "website inquiry"} on ${centralDate(lead.createdAt)} (lead #${lead.id}).${area ? ` Matter type: ${area}.` : ""}${str(answers.helpedBy) ? ` Their contact there: ${str(answers.helpedBy)}.` : ""}`,
    told ? `What the client wrote: ${told}` : "",
  ].filter(Boolean).join("\n");

  const existed = !!(await findCaseForMatter(matterIn));
  const row = await getOrCreateCaseForMatter({ matter: matterIn, name: str(input.name, 255), county: str(input.county, 96), court: str(input.court), causeNumber: str(input.causeNumber, 128), notes }, by);
  if (!row) throw new LeadCaseError("Couldn't create the case record.");

  // The client goes on the case as the firm's own party. A placeholder ("Plaintiff" named "Plaintiff") in that role is
  // replaced; a real name already there is left alone.
  if (client) {
    const role = str(input.role, 96) || "Other";
    const address = letter ? [letter.street, [letter.city, [letter.state, letter.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") : "";
    const mine = { name: client, role, ours: true as const, ...(str(lead.email, 255) ? { email: str(lead.email, 255) } : {}), ...(str(lead.phone, 64) ? { phone: str(lead.phone, 64) } : {}), ...(address ? { address: address.slice(0, 500) } : {}) };
    const parties = cleanParties(row.parties);
    const has = parties.some((p) => p.name.toLowerCase() === client.toLowerCase());
    if (!has) {
      const slot = parties.findIndex((p) => p.role === role && p.name === p.role);
      const next = slot >= 0 ? parties.map((p, i) => (i === slot ? mine : p)) : [...parties, mine];
      await db.update(caseHub).set({ parties: next, updatedAt: new Date() }).where(eq(caseHub.id, row.id));
    }
    await upsertContact({ kind: "client-current", side: "ours", name: client, email: str(lead.email, 255), phone: str(lead.phone, 64), address }, by).catch(() => {});
  }

  await db.insert(intakeCases).values({ intakeId: leadId, caseId: row.id, matter: row.matter, createdBy: by })
    .onConflictDoUpdate({ target: intakeCases.intakeId, set: { caseId: row.id, matter: row.matter, skipped: false, updatedAt: new Date() } });
  // Sending a lead to Cases means it converted, whatever its status said.
  if (lead.status !== "converted") await db.update(intakeSubmissions).set({ status: "converted", referredTo: null, feeExpected: false, feeAmount: null }).where(eq(intakeSubmissions.id, leadId));
  await noteLeadActivity(leadId);
  return { caseId: row.id, matter: row.matter, existed };
}

/** "This one needs no case record": takes a converted lead off the to-do list (and back). */
export async function setLeadCaseSkipped(leadId: number, skipped: boolean, by: string): Promise<void> {
  if (!db) throw new LeadCaseError("Database not configured.");
  await ensureLeadCases();
  await db.insert(intakeCases).values({ intakeId: leadId, skipped, createdBy: by }).onConflictDoUpdate({ target: intakeCases.intakeId, set: { skipped, updatedAt: new Date() } });
}

export async function setLeadShareFolder(leadId: number, folderId: number | null): Promise<void> {
  if (!db) return;
  await db.update(intakeCases).set({ shareFolderId: folderId, updatedAt: new Date() }).where(eq(intakeCases.intakeId, leadId));
}

export type SharedFolderView = { id: number; name: string; files: number; lastFileAt: string | null; lastFileBy: string; people: { name: string; email: string; openedAt: string | null; off: boolean }[] };
export type LeadCaseView = { intakeId: number; caseId: number | null; matter: string; caseName: string; caseClosed: boolean; skipped: boolean; folder: SharedFolderView | null };

async function foldersById(ids: number[]): Promise<Map<number, SharedFolderView>> {
  const out = new Map<number, SharedFolderView>();
  if (!db || !ids.length) return out;
  const folders = await db.select({ id: shareFolders.id, name: shareFolders.name }).from(shareFolders).where(inArray(shareFolders.id, ids));
  for (const f of folders) out.set(f.id, { id: f.id, name: f.name, files: 0, lastFileAt: null, lastFileBy: "", people: [] });
  if (!out.size) return out;
  const live = [...out.keys()];
  const files = await db.select({ folderId: shareFiles.folderId, createdAt: shareFiles.createdAt, uploadedBy: shareFiles.uploadedBy }).from(shareFiles).where(inArray(shareFiles.folderId, live));
  for (const f of files) {
    const v = out.get(f.folderId)!; v.files++;
    if (!v.lastFileAt || f.createdAt.toISOString() > v.lastFileAt) { v.lastFileAt = f.createdAt.toISOString(); v.lastFileBy = f.uploadedBy ?? ""; }
  }
  const now = Date.now();
  const people = await db.select().from(shareRecipients).where(inArray(shareRecipients.folderId, live));
  for (const r of people) {
    if (r.aiReader) continue;
    out.get(r.folderId)!.people.push({ name: r.name || r.email, email: r.email, openedAt: r.lastAccessAt?.toISOString() ?? null, off: r.revoked || (!!r.expiresAt && r.expiresAt.getTime() < now) });
  }
  return out;
}

/** For a list of leads: which are in Cases, under what matter, and the folder shared with the referring office. */
export async function leadCaseViews(leadIds: number[]): Promise<Map<number, LeadCaseView>> {
  const out = new Map<number, LeadCaseView>();
  if (!db || !leadIds.length) return out;
  await ensureLeadCases();
  const links = await db.select().from(intakeCases).where(inArray(intakeCases.intakeId, leadIds));
  if (!links.length) return out;
  const caseIds = links.map((l) => l.caseId).filter((n): n is number => n != null);
  const cases = caseIds.length ? await db.select({ id: caseHub.id, matter: caseHub.matter, name: caseHub.name, archived: caseHub.archived }).from(caseHub).where(inArray(caseHub.id, caseIds)) : [];
  const folders = await foldersById(links.map((l) => l.shareFolderId).filter((n): n is number => n != null)).catch(() => new Map<number, SharedFolderView>());
  for (const l of links) {
    const c = l.caseId != null ? cases.find((x) => x.id === l.caseId) : undefined;
    // A case record that was deleted since: the lead goes back to "not in Cases yet".
    out.set(l.intakeId, { intakeId: l.intakeId, caseId: c ? c.id : null, matter: c?.matter ?? "", caseName: c?.name ?? "", caseClosed: !!c?.archived, skipped: l.skipped && !c, folder: (c && l.shareFolderId != null && folders.get(l.shareFolderId)) || null });
  }
  return out;
}

export type CaseIntakeView = { intakeId: number; client: string; received: string; partnerName: string; partnerSlug: string; folder: SharedFolderView | null };
/** For the case page: the lead(s) this case came from and any folder shared with the referring office. */
export async function intakeForCase(caseId: number): Promise<CaseIntakeView[]> {
  if (!db) return [];
  await ensureLeadCases();
  const rows = await db.select({ link: intakeCases, name: intakeSubmissions.name, createdAt: intakeSubmissions.createdAt, answers: intakeSubmissions.answers })
    .from(intakeCases).innerJoin(intakeSubmissions, eq(intakeSubmissions.id, intakeCases.intakeId)).where(eq(intakeCases.caseId, caseId));
  const folders = await foldersById(rows.map((r) => r.link.shareFolderId).filter((n): n is number => n != null)).catch(() => new Map<number, SharedFolderView>());
  return rows.map((r) => {
    const a = (r.answers as Record<string, unknown>) ?? {};
    return { intakeId: r.link.intakeId, client: r.name ?? "", received: centralDate(r.createdAt), partnerName: str(a.partnerName), partnerSlug: str(a.partnerSlug, 64), folder: (r.link.shareFolderId != null && folders.get(r.link.shareFolderId)) || null };
  });
}
