import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { ensureConsults } from "./consults";
import { ensureContracts } from "./contracts";

/**
 * Keeping the partner-office lists short.
 *
 * A lead's outcome is its ordinary status (Converted, Declined, Client
 * Declined, Referred Out) and "archived" is the ordinary archive flag — the
 * same ones the main intake table uses — so there is one record, not two.
 *
 * Partner-office leads are archived automatically:
 *   - a set number of days after an outcome was recorded (default 14), and
 *   - after a set number of days with no outcome and nothing happening on the
 *     lead (default 90) — unless a consultation is still ahead.
 * Either can be turned off by setting it to 0. Archiving never deletes
 * anything; an archived lead can be restored.
 */
export const FINAL_STATUSES = ["converted", "declined", "referred-out", "client-declined"] as const;
export type AutoArchiveRules = { afterOutcomeDays: number; idleDays: number };
export const DEFAULT_RULES: AutoArchiveRules = { afterOutcomeDays: 14, idleDays: 90 };
const KEY = "intake-partner-auto-archive";

export const META_DDL: string[] = [
  // outcome_seen_at: when the lead was first seen with an outcome. active_at: the last time someone changed its status or restored it.
  `CREATE TABLE IF NOT EXISTS intake_lead_meta (intake_id integer PRIMARY KEY, outcome_seen_at timestamptz, active_at timestamptz)`,
];
let ensured: Promise<void> | null = null;
async function ensureMeta(): Promise<void> {
  if (!db) return;
  if (!ensured) ensured = (async () => { for (const stmt of META_DDL) await db!.execute(sql.raw(stmt)); await ensureConsults(); await ensureContracts(); })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

/** Someone just worked on this lead (changed its status, or restored it): start its clocks over. Never fails the caller. */
export async function noteLeadActivity(id: number): Promise<void> {
  if (!db) return;
  try {
    await ensureMeta();
    await db.execute(sql`insert into intake_lead_meta (intake_id, active_at) values (${id}, now()) on conflict (intake_id) do update set active_at = now()`);
  } catch { /* housekeeping only */ }
}

const days = (v: unknown, d: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 3650 ? n : d; };

export async function getAutoArchiveRules(): Promise<AutoArchiveRules> {
  if (!db) return DEFAULT_RULES;
  try {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
    const v = (row?.value ?? {}) as Record<string, unknown>;
    return { afterOutcomeDays: days(v.afterOutcomeDays, DEFAULT_RULES.afterOutcomeDays), idleDays: days(v.idleDays, DEFAULT_RULES.idleDays) };
  } catch { return DEFAULT_RULES; }
}

export async function saveAutoArchiveRules(input: { afterOutcomeDays: unknown; idleDays: unknown }): Promise<AutoArchiveRules> {
  if (!db) throw new Error("Database not configured.");
  const value = { afterOutcomeDays: days(input.afterOutcomeDays, DEFAULT_RULES.afterOutcomeDays), idleDays: days(input.idleDays, DEFAULT_RULES.idleDays) };
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return value;
}

/** Run often (it is cheap): archive the partner-office leads whose time has come. Returns how many of each kind. */
export async function autoArchivePartnerLeads(): Promise<{ afterOutcome: number; idle: number }> {
  if (!db) return { afterOutcome: 0, idle: 0 };
  await ensureMeta();
  const rules = await getAutoArchiveRules();
  const finals = sql.join(FINAL_STATUSES.map((s) => sql`${s}`), sql`, `);
  const partner = sql`coalesce(s.answers->>'partnerSlug', '') <> ''`;
  // Note when each lead was first seen with an outcome; forget it if the lead was reopened.
  await db.execute(sql`insert into intake_lead_meta (intake_id, outcome_seen_at) select s.id, now() from intake_submissions s where ${partner} and s.status::text in (${finals})
    on conflict (intake_id) do update set outcome_seen_at = coalesce(intake_lead_meta.outcome_seen_at, now())`);
  await db.execute(sql`update intake_lead_meta m set outcome_seen_at = null from intake_submissions s where s.id = m.intake_id and m.outcome_seen_at is not null and s.status::text not in (${finals})`);
  const log = async (ids: { id: number }[], why: string) => {
    for (const r of ids) await db!.execute(sql`insert into audit_log (admin_email, action, entity, entity_id, summary) values ('automatic', 'update', 'intake', ${String(r.id)}, ${why})`).catch(() => {});
  };
  let afterOutcome = 0, idle = 0;
  if (rules.afterOutcomeDays > 0) {
    const done = await db.execute(sql`
      update intake_submissions s set archived = true from intake_lead_meta m
      where m.intake_id = s.id and ${partner} and s.archived = false and s.status::text in (${finals})
        and greatest(m.outcome_seen_at, coalesce(m.active_at, m.outcome_seen_at)) < now() - make_interval(days => ${rules.afterOutcomeDays})
      returning s.id`) as unknown as { id: number }[];
    afterOutcome = done.length;
    await log(done, `Archived automatically: ${rules.afterOutcomeDays} days after its outcome was recorded`);
  }
  if (rules.idleDays > 0) {
    // "Nothing happening": no status change, letter work or consultation step in that many days, and no consultation still ahead.
    const done = await db.execute(sql`
      update intake_submissions s set archived = true
      where ${partner} and s.archived = false and s.status::text not in (${finals})
        and greatest(s.created_at,
              coalesce((select m.active_at from intake_lead_meta m where m.intake_id = s.id), s.created_at),
              coalesce((select max(c.updated_at) from intake_contracts c where c.intake_id = s.id), s.created_at),
              coalesce((select max(greatest(k.created_at, coalesce(k.proposed_at, k.created_at), coalesce(k.confirmed_at, k.created_at))) from intake_consults k where k.intake_id = s.id), s.created_at)
            ) < now() - make_interval(days => ${rules.idleDays})
        and not exists (select 1 from intake_consults k where k.intake_id = s.id and k.status in ('proposed', 'confirmed') and k.start_at > now() - interval '1 day')
      returning s.id`) as unknown as { id: number }[];
    idle = done.length;
    await log(done, `Archived automatically: no outcome and nothing happening for ${rules.idleDays} days`);
  }
  return { afterOutcome, idle };
}
