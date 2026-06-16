import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { teamMembers, badges, testimonials, intakeRecipients, timeActivityUsers, timeCategories, admins } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { TEAM } from "@/lib/content/defaults/team";
import { BADGES } from "@/lib/content/defaults/badges";
import { TESTIMONIALS } from "@/lib/content/defaults/testimonials";
import { INTAKE_RECIPIENTS } from "@/lib/content/defaults/intake-recipients";
import { TIME_ACTIVITY_USERS, TIME_CATEGORIES } from "@/lib/content/defaults/time";

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
  `CREATE TABLE IF NOT EXISTS intake_recipients (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL DEFAULT '',
    email varchar(255) NOT NULL,
    branches jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    sort integer NOT NULL DEFAULT 0
  )`,
  // Time tracker.
  `DO $$ BEGIN CREATE TYPE time_entry_status AS ENUM ('active','archived'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE TABLE IF NOT EXISTS time_entries (
    id serial PRIMARY KEY,
    owner_id integer NOT NULL,
    matter text NOT NULL DEFAULT '',
    entry_date varchar(10) NOT NULL,
    activity_description text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',
    price real NOT NULL DEFAULT 0,
    quantity real NOT NULL DEFAULT 0,
    activity_user_name text NOT NULL DEFAULT '',
    non_billable boolean NOT NULL DEFAULT false,
    status time_entry_status NOT NULL DEFAULT 'active',
    exported_at timestamptz,
    exported_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS time_activity_users (
    id serial PRIMARY KEY,
    name varchar(255) NOT NULL,
    rate real NOT NULL DEFAULT 145,
    sort integer NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS time_categories (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL,
    sort integer NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS time_matters (
    id serial PRIMARY KEY,
    display_number text NOT NULL,
    description text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0
  )`,
  `ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'timekeeper'`,
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token varchar(128)`,
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_expires timestamptz`,
  // New columns on existing tables (idempotent).
  `ALTER TABLE banner_items ADD COLUMN IF NOT EXISTS focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE practice_areas ADD COLUMN IF NOT EXISTS hero_focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS banner_focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS referred_to varchar(191)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS fee_expected boolean NOT NULL DEFAULT false`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS fee_amount varchar(64)`,
  `ALTER TYPE intake_status ADD VALUE IF NOT EXISTS 'referred-out'`,
  `CREATE TABLE IF NOT EXISTS referral_attorneys (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Allow the new "focal" content-block type used for page-banner positions.
  `ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'focal'`,
];

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const applied: string[] = [];
  const failed: string[] = [];

  // 1) Ensure tables/columns exist. Run each statement independently so one
  //    problematic statement (e.g. an enum change) can't abort the rest or the
  //    seeding below. All statements are idempotent (IF NOT EXISTS).
  for (const stmt of DDL) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err) {
      // "already exists" style errors are fine and expected on repeat runs.
      const msg = (err as Error).message;
      if (!/already exists/i.test(msg)) failed.push(`${stmt.slice(0, 60)}…: ${msg}`);
    }
  }
  applied.push("Ensured tables & columns (team_members, badges, focal columns)");

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

  // 5) Seed intake notification recipients if empty (the intake team).
  try {
    const rCount = await db.select({ id: intakeRecipients.id }).from(intakeRecipients).limit(1);
    if (rCount.length === 0 && INTAKE_RECIPIENTS.length > 0) {
      for (const r of INTAKE_RECIPIENTS) {
        await db.insert(intakeRecipients).values({
          name: r.name, email: r.email, branches: r.branches, sort: r.sort,
        });
      }
      applied.push(`Seeded ${INTAKE_RECIPIENTS.length} intake recipients`);
    }
  } catch {
    /* non-fatal */
  }

  // 6) Seed time-tracker activity users & categories if empty.
  try {
    const auCount = await db.select({ id: timeActivityUsers.id }).from(timeActivityUsers).limit(1);
    if (auCount.length === 0) {
      for (let i = 0; i < TIME_ACTIVITY_USERS.length; i++) {
        const u = TIME_ACTIVITY_USERS[i];
        await db.insert(timeActivityUsers).values({ name: u.name, rate: u.rate, sort: i });
      }
      applied.push(`Seeded ${TIME_ACTIVITY_USERS.length} time-tracker users`);
    }
    const catCount = await db.select({ id: timeCategories.id }).from(timeCategories).limit(1);
    if (catCount.length === 0) {
      for (let i = 0; i < TIME_CATEGORIES.length; i++) {
        await db.insert(timeCategories).values({ name: TIME_CATEGORIES[i], sort: i });
      }
      applied.push(`Seeded ${TIME_CATEGORIES.length} time-tracker categories`);
    }
  } catch {
    /* non-fatal */
  }

  // 7) Seed the team's time-tracker logins (timekeeper role) if missing. Each
  //    gets an unguessable random password; the admin sends a setup link so the
  //    person chooses their own. Existing accounts are never modified.
  try {
    const SEED_LOGINS = [
      { name: "Max Smith", email: "max@texaslawsmith.com" },
      { name: "Frankie Moreno", email: "frankie@richardsandsmith.com" },
      { name: "Andrew Bergeron", email: "abergeron@texaslawsmith.com" },
      { name: "Linda Smith", email: "probate@texaslawsmith.com" },
      { name: "Jessica Smith", email: "office@texaslawsmith.com" },
    ];
    let created = 0;
    for (const l of SEED_LOGINS) {
      const existing = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, l.email)).limit(1);
      if (existing.length === 0) {
        const hash = await bcrypt.hash(randomUUID() + randomUUID(), 12);
        await db.insert(admins).values({ name: l.name, email: l.email, role: "timekeeper", passwordHash: hash, permissions: [] });
        created++;
      }
    }
    if (created) applied.push(`Created ${created} timekeeper login(s)`);
  } catch (err) {
    failed.push(`Seed logins: ${(err as Error).message}`);
  }

  return NextResponse.json({ ok: true, applied, ...(failed.length ? { warnings: failed } : {}) });
}
