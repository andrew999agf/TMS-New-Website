import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { caseHub, portalCompanies, portalGroups, portalMatters, timeMatters } from "@/db/schema";
import { canonicalMatter, type CaseSeed } from "@/lib/cases";
import { POSTURES } from "@/lib/portal";

/**
 * Bridges the Client Case Portal and the Matters / Cases hub. A portal matter
 * is tied to the hub by its Clio matter number: the hub key is the full Time
 * Tracker code ("01473-Manuel Auto Group"), so a bare "01473" on a portal
 * matter is resolved against the tracker roster (read-only) before the case
 * is created.
 */

export type PortalMatterCaseStatus = {
  matterId: number; title: string; clioMatter: string; groupId: number; groupName: string; companyName: string | null;
  /** The hub key this matter would file under (empty when it has no Clio number). */
  caseKey: string;
  caseId: number | null;
};

/** Full hub key for a portal matter's Clio value: tracker code when the bare number matches one, else the cleaned value. */
export async function caseKeyForClio(clio: string, roster?: { displayNumber: string }[]): Promise<string> {
  const canon = canonicalMatter(clio);
  if (!canon || !db) return canon;
  if (/^[A-Za-z0-9.]+$/.test(canon)) {
    const list = roster ?? (await db.select({ displayNumber: timeMatters.displayNumber }).from(timeMatters).orderBy(asc(timeMatters.sort)).catch(() => []));
    const hit = list.filter((m) => m.displayNumber.toLowerCase().startsWith(`${canon.toLowerCase()}-`));
    if (hit.length === 1) return hit[0].displayNumber;
  }
  return canon;
}

/** Every open, un-hidden portal matter (one file, or all files) with whether a case record already exists for it. */
export async function portalMatterCaseStatuses(groupId?: number): Promise<PortalMatterCaseStatus[]> {
  if (!db) return [];
  const groups = await db.select().from(portalGroups).where(groupId ? eq(portalGroups.id, groupId) : eq(portalGroups.archived, false)).catch(() => []);
  if (!groups.length) return [];
  const gids = groups.map((g) => g.id);
  const [matters, companies, roster] = await Promise.all([
    db.select().from(portalMatters).where(and(inArray(portalMatters.groupId, gids), eq(portalMatters.status, "open"), eq(portalMatters.hidden, false))).orderBy(asc(portalMatters.title)),
    db.select().from(portalCompanies).where(inArray(portalCompanies.groupId, gids)),
    db.select({ displayNumber: timeMatters.displayNumber }).from(timeMatters).orderBy(asc(timeMatters.sort)).catch(() => [] as { displayNumber: string }[]),
  ]);
  const out: PortalMatterCaseStatus[] = [];
  for (const m of matters) {
    const key = m.clioMatter ? await caseKeyForClio(m.clioMatter, roster) : "";
    out.push({
      matterId: m.id, title: m.title, clioMatter: m.clioMatter, groupId: m.groupId,
      groupName: groups.find((g) => g.id === m.groupId)?.name ?? "", companyName: companies.find((c) => c.id === m.companyId)?.name ?? null,
      caseKey: key, caseId: null,
    });
  }
  const keys = out.map((o) => o.caseKey).filter(Boolean);
  if (keys.length) {
    const rows = await db.select({ id: caseHub.id, matter: caseHub.matter }).from(caseHub).where(sql`lower(${caseHub.matter}) in (${sql.join(keys.map((k) => sql`${k.toLowerCase()}`), sql`, `)})`).catch(() => []);
    for (const o of out) {
      const hit = rows.find((r) => r.matter.toLowerCase() === o.caseKey.toLowerCase());
      if (hit) o.caseId = hit.id;
    }
  }
  return out;
}

/** What the portal knows, shaped for the case hub: style, parties from "A v. B", cause number, court, county, and a note tracing it back. */
export function caseSeedFromPortalMatter(input: { title: string; posture: string; driveFolder?: string | null; notes?: string | null; groupName: string; companyName: string | null; parentName?: string | null }, caseKey: string): CaseSeed {
  const title = input.title.trim();
  const head = title.split(/\s+—\s+/)[0].split(/\s+\(/)[0].trim();
  const vs = /^(.+?)\s+v(?:s)?\.\s+(.+)$/i.exec(head);
  const cause = /Cause\s+No\.?\s*([A-Za-z0-9.\-\/]+)/i.exec(title)?.[1] ?? "";
  const court = /(\d+(?:st|nd|rd|th)\s+(?:Judicial\s+)?District\s+Court|County\s+Court\s+at\s+Law\s+No\.?\s*\d+|Justice\s+Court[^,;]*|Probate\s+Court[^,;]*)/i.exec(title)?.[1]?.trim() ?? "";
  const county = /([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\s+County/.exec(title)?.[1] ?? "";
  const posture = POSTURES.find((p) => p.id === input.posture)?.label ?? input.posture;
  const owner = input.companyName ?? (input.parentName ? `${input.parentName} (personal)` : input.groupName);
  const notes = [
    `From the Client Case Portal — file "${input.groupName}", ${owner}, ${posture}.`,
    input.driveFolder ? `Working folder: ${input.driveFolder}` : "",
    input.notes?.trim() ? input.notes.trim() : "",
  ].filter(Boolean).join("\n");
  return {
    matter: caseKey,
    name: head.slice(0, 255),
    causeNumber: cause,
    court,
    county: county ? `${county} County` : "",
    notes,
    ...(vs ? { plaintiffName: vs[1].trim(), defendantName: vs[2].trim() } : {}),
  };
}
