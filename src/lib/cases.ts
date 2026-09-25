import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { caseHub, type CaseParty } from "@/db/schema";

/** Every tool's default starting lineup until real party names are entered. */
export const DEFAULT_PARTIES: CaseParty[] = [
  { name: "Plaintiff", role: "Plaintiff" },
  { name: "Defendant", role: "Defendant" },
];

export function cleanParties(v: unknown): CaseParty[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => ({
      name: typeof (p as CaseParty)?.name === "string" ? (p as CaseParty).name.trim().slice(0, 191) : "",
      role: typeof (p as CaseParty)?.role === "string" ? (p as CaseParty).role.trim().slice(0, 96) : "",
    }))
    .filter((p) => p.name)
    .slice(0, 50);
}

export type CaseSeed = { matter: string; name?: string; causeNumber?: string; court?: string; county?: string; notes?: string };

const str = (v: unknown, max = 191) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * The one write path every tool shares: find the case record for a matter or
 * create it. Existing case info is never overwritten by a seed — the hub is
 * the source of truth, the tools only fill gaps. NOT a server action: callers
 * are responsible for their own auth guard.
 */
export async function getOrCreateCaseForMatter(seed: CaseSeed, createdBy?: string) {
  if (!db) return null;
  const matter = str(seed.matter, 500);
  if (!matter) return null;
  const [existing] = await db.select().from(caseHub).where(eq(caseHub.matter, matter));
  if (existing) {
    // Fill blanks only, so the hub accumulates information without clobbering.
    const patch: Partial<typeof existing> = {};
    if (!existing.name && seed.name) patch.name = str(seed.name, 255);
    if (!existing.causeNumber && seed.causeNumber) patch.causeNumber = str(seed.causeNumber, 128);
    if (!existing.court && seed.court) patch.court = str(seed.court);
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
      parties: DEFAULT_PARTIES,
      createdBy,
    })
    .onConflictDoNothing({ target: caseHub.matter })
    .returning();
  if (row) return row;
  const [raced] = await db.select().from(caseHub).where(eq(caseHub.matter, matter));
  return raced ?? null;
}
