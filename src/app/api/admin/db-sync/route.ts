import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, badges, testimonials } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { TEAM } from "@/lib/content/defaults/team";
import { BADGES } from "@/lib/content/defaults/badges";
import { TESTIMONIALS } from "@/lib/content/defaults/testimonials";

export const runtime = "nodejs";

/**
 * Idempotent schema sync for the newer tables, so the owner can apply database
 * updates from the admin UI without running CLI migrations. Uses
 * CREATE TABLE IF NOT EXISTS (safe to run repeatedly) and seeds defaults only
 * when a table is empty.
 */
const DDL = [
  `CREATE TABLE IF NOT EXISTS team_members (
    id serial PRIMARY KEY,
    slug varchar(128) NOT NULL UNIQUE,
    name varchar(191) NOT NULL,
    role varchar(191) NOT NULL,
    is_attorney boolean NOT NULL DEFAULT false,
    is_lead boolean NOT NULL DEFAULT false,
    team_label varchar(64) NOT NULL DEFAULT 'Texas Team',
    office varchar(128),
    email varchar(255),
    direct_phone varchar(64),
    bar_number varchar(64),
    languages varchar(191),
    photo text,
    bio_professional text,
    bio_beyond text,
    bio_personal text,
    experience jsonb,
    education jsonb,
    representative_matters jsonb,
    services jsonb,
    practice_areas jsonb,
    memberships jsonb,
    bar_admissions jsonb,
    court_admissions jsonb,
    visible boolean NOT NULL DEFAULT true,
    sort integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS badges (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL,
    logo text,
    url text,
    visible boolean NOT NULL DEFAULT true,
    sort integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // New columns on existing tables (idempotent).
  `ALTER TABLE banner_items ADD COLUMN IF NOT EXISTS focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE practice_areas ADD COLUMN IF NOT EXISTS hero_focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS banner_focal varchar(16) NOT NULL DEFAULT 'center'`,
  // Allow the new "focal" content-block type used for page-banner positions.
  `ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'focal'`,
];

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const applied: string[] = [];

  // 1) Ensure tables exist (this is the critical part).
  try {
    for (const stmt of DDL) {
      await db.execute(sql.raw(stmt));
    }
    applied.push("Ensured tables: team_members, badges");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // 2) Seed team if empty (best-effort; failures don't abort).
  try {
    const teamCount = await db.select({ id: teamMembers.id }).from(teamMembers).limit(1);
    if (teamCount.length === 0) {
      for (const m of TEAM) {
        await db.insert(teamMembers).values({
          slug: m.slug, name: m.name, role: m.role, isAttorney: m.isAttorney, isLead: m.isLead,
          teamLabel: m.teamLabel, office: m.office, email: m.email, directPhone: m.directPhone,
          barNumber: m.barNumber, languages: m.languages, photo: m.photo,
          bioProfessional: m.bioProfessional, bioBeyond: m.bioBeyond, bioPersonal: m.bioPersonal,
          experience: m.experience, education: m.education, representativeMatters: m.representativeMatters,
          services: m.services, practiceAreas: m.practiceAreas, memberships: m.memberships,
          barAdmissions: m.barAdmissions, courtAdmissions: m.courtAdmissions, sort: m.sort,
        }).onConflictDoNothing();
      }
      applied.push(`Seeded ${TEAM.length} team members`);
    }
  } catch {
    /* non-fatal */
  }

  // 3) Seed badges if empty (BADGES is empty by default — no presets).
  try {
    const badgeCount = await db.select({ id: badges.id }).from(badges).limit(1);
    if (badgeCount.length === 0 && BADGES.length > 0) {
      for (const b of BADGES) {
        await db.insert(badges).values({ name: b.name, logo: b.logo, url: b.url, sort: b.sort });
      }
      applied.push(`Seeded ${BADGES.length} badges`);
    }
  } catch {
    /* non-fatal */
  }

  // 4) Seed testimonials if empty (Google reviews).
  try {
    const tCount = await db.select({ id: testimonials.id }).from(testimonials).limit(1);
    if (tCount.length === 0 && TESTIMONIALS.length > 0) {
      for (const t of TESTIMONIALS) {
        await db.insert(testimonials).values({
          quote: t.quote, attribution: t.attribution, context: t.context, sort: t.sort,
        });
      }
      applied.push(`Seeded ${TESTIMONIALS.length} testimonials`);
    }
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ ok: true, applied });
}
