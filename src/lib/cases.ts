import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { caseHub, type CaseParty } from "@/db/schema";

/** Every tool's default starting lineup until real party names are entered. */
export const DEFAULT_PARTIES: CaseParty[] = [
  { name: "Plaintiff", role: "Plaintiff" },
  { name: "Defendant", role: "Defendant" },
];

const fstr = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function cleanParties(v: unknown): CaseParty[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const p = raw as CaseParty;
      const out: CaseParty = { name: fstr(p?.name, 191), role: fstr(p?.role, 96) };
      // Contact details ride along untouched by name/role edits.
      if (p?.email) out.email = fstr(p.email, 255);
      if (p?.phone) out.phone = fstr(p.phone, 64);
      if (p?.address) out.address = fstr(p.address, 500);
      if (p?.ours) out.ours = true;
      if (p?.proSe) out.proSe = true;
      if (Array.isArray(p?.cc)) {
        const cc = p.cc
          .map((c) => ({
            name: fstr(c?.name, 191),
            role: fstr(c?.role, 32) || "other",
            ...(c?.firm ? { firm: fstr(c.firm, 191) } : {}),
            ...(c?.email ? { email: fstr(c.email, 255) } : {}),
            ...(c?.phone ? { phone: fstr(c.phone, 64) } : {}),
          }))
          .filter((c) => c.name || c.email)
          .slice(0, 25);
        if (cc.length) out.cc = cc;
      }
      if (p?.attorney?.name) {
        out.attorney = { name: fstr(p.attorney.name, 191) };
        if (p.attorney.firm) out.attorney.firm = fstr(p.attorney.firm, 191);
        if (p.attorney.email) out.attorney.email = fstr(p.attorney.email, 255);
        if (p.attorney.phone) out.attorney.phone = fstr(p.attorney.phone, 64);
        if (p.attorney.address) out.attorney.address = fstr(p.attorney.address, 500);
      }
      return out;
    })
    .filter((p) => p.name)
    .slice(0, 50);
}

/**
 * The key every tool files a case under is the Clio matter code alone,
 * e.g. "01319-Holocron Toy Store, LLC". Some pickers used to hand back
 * "CODE — description"; strip that so one case never splits in two.
 */
export function canonicalMatter(v: unknown): string {
  const s = (typeof v === "string" ? v : "").trim().slice(0, 500);
  return s.split(" — ")[0].trim();
}

/** The client's name as it appears in the matter code ("01319-Holocron Toy Store, LLC" → "Holocron Toy Store, LLC"). */
export function clientFromMatter(matter: string): string {
  const m = matter.match(/^\s*[A-Za-z0-9.]+\s*-\s*(.+)$/);
  return m ? m[1].trim() : "";
}

/**
 * Find the central case record for whatever a user typed: the exact key,
 * the key with a " — description" tail, a different letter case, or just
 * the matter number ("01319") when exactly one case starts with it.
 */
export async function findCaseForMatter(matterIn: unknown) {
  if (!db) return null;
  const raw = (typeof matterIn === "string" ? matterIn : "").trim().slice(0, 500);
  if (!raw) return null;
  const canon = canonicalMatter(raw);
  for (const key of [...new Set([raw, canon])]) {
    const [row] = await db.select().from(caseHub).where(eq(caseHub.matter, key));
    if (row) return row;
  }
  const ci = await db.select().from(caseHub).where(sql`lower(${caseHub.matter}) = ${canon.toLowerCase()}`).limit(2);
  if (ci.length === 1) return ci[0];
  // A bare number: "01319" → the one case whose code starts with "01319-".
  if (/^[A-Za-z0-9.]+$/.test(canon)) {
    const like = canon.toLowerCase().replace(/[%_]/g, "") + "-%";
    const rows = await db.select().from(caseHub).where(sql`lower(${caseHub.matter}) LIKE ${like}`).limit(2);
    if (rows.length === 1) return rows[0];
  }
  return null;
}

/** The key to store for a typed matter: the existing case's exact key when we have one, else the cleaned code. */
export async function resolveMatterKey(matterIn: unknown): Promise<string> {
  try {
    const existing = await findCaseForMatter(matterIn);
    if (existing) return existing.matter;
  } catch (err) {
    console.error("[cases] resolveMatterKey lookup failed; storing the cleaned code:", err);
  }
  return canonicalMatter(matterIn);
}

export type CaseSeed = { matter: string; name?: string; causeNumber?: string; court?: string; county?: string; notes?: string; plaintiffName?: string; defendantName?: string };

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * The one write path every tool shares: find the case record for a matter or
 * create it. Existing case info is never overwritten by a seed — the hub is
 * the source of truth, the tools only fill gaps. NOT a server action: callers
 * are responsible for their own auth guard.
 */
export async function getOrCreateCaseForMatter(seed: CaseSeed, createdBy?: string) {
  if (!db) return null;
  const matter = canonicalMatter(seed.matter);
  if (!matter) return null;
  const existing = await findCaseForMatter(matter);
  if (existing) {
    // Fill blanks only, so the hub accumulates information without clobbering.
    const patch: Partial<typeof existing> = {};
    if (!existing.name && seed.name) patch.name = str(seed.name, 255);
    if (!existing.causeNumber && seed.causeNumber) patch.causeNumber = str(seed.causeNumber, 128);
    if (!existing.court && seed.court) patch.court = str(seed.court);
    if (!existing.county && seed.county) patch.county = str(seed.county, 96);
    // Upgrade placeholder parties ("Plaintiff"/"Defendant") to real names when
    // a tool learns them, without touching real names already on file.
    const upgraded = cleanParties(existing.parties).map((party) => {
      const real = party.role === "Plaintiff" ? str(seed.plaintiffName, 191) : party.role === "Defendant" ? str(seed.defendantName, 191) : "";
      return real && party.name === party.role ? { ...party, name: real } : party;
    });
    if (JSON.stringify(upgraded) !== JSON.stringify(cleanParties(existing.parties))) patch.parties = upgraded;
    if (Object.keys(patch).length) {
      await db.update(caseHub).set({ ...patch, updatedAt: new Date() }).where(eq(caseHub.id, existing.id));
      return { ...existing, ...patch };
    }
    return existing;
  }
  const [row] = await db
    .insert(caseHub)
    .values({
      matter,
      name: str(seed.name, 255),
      causeNumber: str(seed.causeNumber, 128),
      court: str(seed.court),
      county: str(seed.county, 96),
      notes: str(seed.notes, 4000),
      parties: [
        { name: str(seed.plaintiffName, 191) || "Plaintiff", role: "Plaintiff" },
        { name: str(seed.defendantName, 191) || "Defendant", role: "Defendant" },
      ],
      createdBy,
    })
    .onConflictDoNothing({ target: caseHub.matter })
    .returning();
  if (row) return row;
  const [raced] = await db.select().from(caseHub).where(eq(caseHub.matter, matter));
  return raced ?? null;
}
