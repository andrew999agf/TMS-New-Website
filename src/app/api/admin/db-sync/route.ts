import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { teamMembers, badges, testimonials, intakeRecipients, timeActivityUsers, timeCategories, admins, settings } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { TEAM } from "@/lib/content/defaults/team";
import { BADGES } from "@/lib/content/defaults/badges";
import { TESTIMONIALS } from "@/lib/content/defaults/testimonials";
import { INTAKE_RECIPIENTS } from "@/lib/content/defaults/intake-recipients";
import { TIME_ACTIVITY_USERS, TIME_ACTIVITY_USERS_ENSURE, TIME_CATEGORIES } from "@/lib/content/defaults/time";
import { PATRIOT_TEAMS_KEY, DEFAULT_PATRIOT_TEAMS, type PatriotTeam } from "@/lib/patriot/settings";
import { referralAttorneys, trialCases, trialDeadlines, trialWitnesses, trialClaims, trialElements, trialProofs } from "@/db/schema";
import { REFERRAL_ATTORNEYS } from "@/lib/content/defaults/referral-attorneys";
import { CV24_162_CASE, CV24_162_CAUSE, CV24_162_ITEMS } from "@/lib/pretrial/seed-cv24-162";
import { CV24_162_WITNESSES, CV24_162_CLAIMS } from "@/lib/pretrial/seed-cv24-162-proof";

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
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS hourly boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS time_clock_punches (
    id serial PRIMARY KEY,
    admin_id integer NOT NULL,
    clock_in timestamptz NOT NULL DEFAULT now(),
    clock_out timestamptz
  )`,
  `ALTER TABLE time_clock_punches ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false`,
  `ALTER TABLE time_clock_punches ADD COLUMN IF NOT EXISTS auto_open boolean NOT NULL DEFAULT false`,
  `ALTER TABLE time_activity_users ADD COLUMN IF NOT EXISTS email varchar(255) NOT NULL DEFAULT ''`,
  // Secure share folders.
  `CREATE TABLE IF NOT EXISTS share_folders (
    id serial PRIMARY KEY,
    case_number varchar(191) NOT NULL DEFAULT '',
    name varchar(191) NOT NULL,
    type varchar(32) NOT NULL,
    notes text,
    archived boolean NOT NULL DEFAULT false,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS share_folders_archived_idx ON share_folders (archived)`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS matter text NOT NULL DEFAULT ''`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS court varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS require_auth boolean NOT NULL DEFAULT false`,
  `ALTER TABLE share_recipients ADD COLUMN IF NOT EXISTS kind varchar(24) NOT NULL DEFAULT ''`,
  `ALTER TABLE share_recipients ADD COLUMN IF NOT EXISTS require_auth boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS portal_users (
    id serial PRIMARY KEY,
    email varchar(255) NOT NULL UNIQUE,
    name varchar(191) NOT NULL DEFAULT '',
    kind varchar(24) NOT NULL DEFAULT '',
    password_hash text,
    verified boolean NOT NULL DEFAULT false,
    otp_hash varchar(128),
    otp_expires timestamptz,
    otp_attempts integer NOT NULL DEFAULT 0,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS upload_total integer NOT NULL DEFAULT 0`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS upload_done integer NOT NULL DEFAULT 0`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS upload_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS share_files (
    id serial PRIMARY KEY,
    folder_id integer NOT NULL,
    url text NOT NULL,
    pathname text NOT NULL,
    filename varchar(255) NOT NULL,
    content_type varchar(128),
    size_bytes integer,
    uploaded_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS share_files_folder_idx ON share_files (folder_id)`,
  `ALTER TABLE share_files ADD COLUMN IF NOT EXISTS notified boolean NOT NULL DEFAULT false`,
  `ALTER TABLE share_folders ADD COLUMN IF NOT EXISTS notify_due_at timestamptz`,
  // One-time: treat everything already uploaded as already-notified so the first
  // digest only covers genuinely new files (not the whole back catalogue).
  `UPDATE share_files SET notified = true WHERE notified = false AND created_at < now() - interval '1 hour'`,
  `CREATE TABLE IF NOT EXISTS share_recipients (
    id serial PRIMARY KEY,
    folder_id integer NOT NULL,
    email varchar(255) NOT NULL,
    name varchar(191) NOT NULL DEFAULT '',
    token varchar(64) NOT NULL UNIQUE,
    invited_by varchar(255),
    invited_at timestamptz NOT NULL DEFAULT now(),
    last_access_at timestamptz,
    revoked boolean NOT NULL DEFAULT false
  )`,
  `CREATE INDEX IF NOT EXISTS share_recipients_folder_idx ON share_recipients (folder_id)`,
  `ALTER TABLE share_recipients ADD COLUMN IF NOT EXISTS expires_at timestamptz`,
  `ALTER TABLE share_recipients ADD COLUMN IF NOT EXISTS permission varchar(16) NOT NULL DEFAULT 'download'`,
  `CREATE TABLE IF NOT EXISTS share_dirs (
    id serial PRIMARY KEY,
    folder_id integer NOT NULL,
    path varchar(512) NOT NULL,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS share_dirs_folder_idx ON share_dirs (folder_id)`,
  // Widen the file/folder path columns so deep folder trees (a nested folder
  // dropped inside an already-nested sub-folder, with long names) never get
  // silently truncated. Idempotent — re-running just re-asserts the type.
  `ALTER TABLE share_files ALTER COLUMN filename TYPE varchar(1024)`,
  `ALTER TABLE share_dirs ALTER COLUMN path TYPE varchar(1024)`,
  `CREATE TABLE IF NOT EXISTS share_access_log (
    id serial PRIMARY KEY,
    folder_id integer,
    recipient_id integer,
    action varchar(16) NOT NULL,
    file_id integer,
    at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS share_reports (
    id serial PRIMARY KEY,
    kind varchar(24) NOT NULL,
    title text NOT NULL,
    period_start timestamptz,
    period_end timestamptz,
    pdf_url text,
    pdf_pathname text,
    summary jsonb,
    created_by varchar(255),
    archived boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS share_reports_created_idx ON share_reports (created_at)`,
  // New columns on existing tables (idempotent).
  `ALTER TABLE banner_items ADD COLUMN IF NOT EXISTS focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE practice_areas ADD COLUMN IF NOT EXISTS hero_focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS banner_focal varchar(16) NOT NULL DEFAULT 'center'`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS email_status varchar(255)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS incomplete boolean NOT NULL DEFAULT false`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS referral_source varchar(191)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS notify_change varchar(191)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS notify_change_at timestamptz`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS notify_change_by varchar(255)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS resume_token varchar(64)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS referred_to varchar(191)`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS fee_expected boolean NOT NULL DEFAULT false`,
  `ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS fee_amount varchar(64)`,
  `ALTER TYPE intake_status ADD VALUE IF NOT EXISTS 'referred-out'`,
  `ALTER TYPE intake_status ADD VALUE IF NOT EXISTS 'client-declined'`,
  `CREATE TABLE IF NOT EXISTS referral_attorneys (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS firm varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT ''`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS phone varchar(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS email varchar(255) NOT NULL DEFAULT ''`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS website varchar(255) NOT NULL DEFAULT ''`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS practice_area varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE referral_attorneys ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 0`,
  // Allow the new "focal" content-block type used for page-banner positions.
  `ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'focal'`,
  // Voice-entry diagnostics (Time Tracker 3.0). No audio/transcript/PII.
  `CREATE TABLE IF NOT EXISTS voice_diagnostics (
    id serial PRIMARY KEY,
    day varchar(10) NOT NULL,
    platform_label varchar(128),
    os varchar(16),
    browser varchar(16),
    engine_group varchar(16),
    capture varchar(24),
    backend varchar(16),
    permission varchar(16),
    secure boolean,
    standalone boolean,
    stage varchar(24),
    success boolean NOT NULL DEFAULT false,
    reason varchar(32),
    message varchar(256),
    sample_rate integer,
    capture_ms integer,
    transcribe_ms integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Pre-trial deadline checklists (Case & Trial Tools).
  `CREATE TABLE IF NOT EXISTS trial_cases (
    id serial PRIMARY KEY,
    name varchar(191) NOT NULL,
    matter text NOT NULL DEFAULT '',
    cause_number varchar(128) NOT NULL DEFAULT '',
    court varchar(191) NOT NULL DEFAULT '',
    trial_date varchar(10),
    notes text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false,
    created_by varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_cases_archived_idx ON trial_cases (archived)`,
  `CREATE TABLE IF NOT EXISTS trial_deadlines (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    title varchar(255) NOT NULL,
    due_date varchar(10),
    done boolean NOT NULL DEFAULT false,
    done_at timestamptz,
    done_by varchar(255),
    notes text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_deadlines_case_idx ON trial_deadlines (case_id)`,
  `ALTER TABLE trial_deadlines ADD COLUMN IF NOT EXISTS parent_id integer`,
  `ALTER TABLE trial_deadlines ADD COLUMN IF NOT EXISTS assignee varchar(191) NOT NULL DEFAULT ''`,
  `ALTER TABLE trial_cases ADD COLUMN IF NOT EXISTS pretrial_date varchar(10)`,
  // Trial evidence: witnesses, exhibits, causes of action + elements, the proof
  // links between them, and deposition/statement transcripts.
  `CREATE TABLE IF NOT EXISTS trial_witnesses (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    name varchar(191) NOT NULL,
    side varchar(16) NOT NULL DEFAULT 'plaintiff',
    role varchar(191) NOT NULL DEFAULT '',
    phone varchar(64) NOT NULL DEFAULT '',
    email varchar(255) NOT NULL DEFAULT '',
    available varchar(16) NOT NULL DEFAULT 'unknown',
    appearance varchar(16) NOT NULL DEFAULT 'in-person',
    notes text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_witnesses_case_idx ON trial_witnesses (case_id)`,
  `CREATE TABLE IF NOT EXISTS trial_exhibits (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    side varchar(16) NOT NULL DEFAULT 'plaintiff',
    number varchar(32) NOT NULL DEFAULT '',
    title varchar(255) NOT NULL,
    bates varchar(128) NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    status varchar(16) NOT NULL DEFAULT 'listed',
    url text,
    pathname text,
    content_type varchar(128),
    size_bytes integer,
    notes text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_exhibits_case_idx ON trial_exhibits (case_id)`,
  `ALTER TABLE trial_exhibits ADD COLUMN IF NOT EXISTS witness_ids jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE trial_exhibits ADD COLUMN IF NOT EXISTS foundation jsonb NOT NULL DEFAULT '[]'::jsonb`,
  // "deposition" split into written vs video; map the retired value forward so
  // existing rows keep a meaningful appearance instead of silently resetting.
  `UPDATE trial_witnesses SET appearance = 'depo-written' WHERE appearance = 'deposition'`,
  `CREATE TABLE IF NOT EXISTS trial_claims (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    name varchar(255) NOT NULL,
    party varchar(16) NOT NULL DEFAULT 'plaintiff',
    is_lead boolean NOT NULL DEFAULT false,
    notes text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_claims_case_idx ON trial_claims (case_id)`,
  `CREATE TABLE IF NOT EXISTS trial_elements (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    claim_id integer NOT NULL,
    text varchar(500) NOT NULL,
    notes text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_elements_claim_idx ON trial_elements (claim_id)`,
  `CREATE TABLE IF NOT EXISTS trial_proofs (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    element_id integer NOT NULL,
    kind varchar(16) NOT NULL DEFAULT 'exhibit',
    exhibit_id integer,
    witness_id integer,
    citation varchar(500) NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '',
    anticipated boolean NOT NULL DEFAULT false,
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_proofs_element_idx ON trial_proofs (element_id)`,
  `CREATE TABLE IF NOT EXISTS trial_transcripts (
    id serial PRIMARY KEY,
    case_id integer NOT NULL,
    kind varchar(16) NOT NULL DEFAULT 'deposition',
    title varchar(255) NOT NULL,
    witness_id integer,
    taken_on varchar(10),
    url text,
    pathname text,
    content_type varchar(128),
    size_bytes integer,
    notes text NOT NULL DEFAULT '',
    sort integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trial_transcripts_case_idx ON trial_transcripts (case_id)`,
  `CREATE INDEX IF NOT EXISTS voice_diag_day_idx ON voice_diagnostics (day)`,
  `CREATE INDEX IF NOT EXISTS voice_diag_browser_idx ON voice_diagnostics (browser)`,
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
    } else {
      // Table already populated: add any newer activity users that are missing,
      // matched by exact name, placed at the end. Existing users are untouched.
      const existing = await db.select({ name: timeActivityUsers.name, sort: timeActivityUsers.sort }).from(timeActivityUsers);
      const have = new Set(existing.map((r) => r.name));
      let nextSort = existing.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
      let added = 0;
      for (const u of TIME_ACTIVITY_USERS_ENSURE) {
        if (!have.has(u.name)) {
          await db.insert(timeActivityUsers).values({ name: u.name, rate: u.rate, sort: nextSort++ });
          added++;
        }
      }
      if (added) applied.push(`Added ${added} time-tracker user(s)`);
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

  // 8) One-time owner-login bootstrap requested by the owner: ensure the
  //    account exists and set its password exactly once. Only the bcrypt hash
  //    lives in the repo (generated offline), and a settings marker guarantees
  //    repeat syncs never clobber a password changed later.
  try {
    const BOOT_KEY = "auth.bootstrap.maxdev9192";
    const BOOT_EMAIL = "maxdev9192@gmail.com";
    const BOOT_HASH = "$2a$12$ZMFRipEUbx3p/53MnLufo.y27JN0URfYRhx3UhdC2oW2aXVFAIUC6";
    const [done] = await db.select().from(settings).where(eq(settings.key, BOOT_KEY));
    if (!done) {
      const [existing] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, BOOT_EMAIL));
      if (existing) {
        await db
          .update(admins)
          .set({ passwordHash: BOOT_HASH, failedLogins: 0, lockedUntil: null })
          .where(eq(admins.id, existing.id));
        applied.push(`Reset password for ${BOOT_EMAIL}`);
      } else {
        await db.insert(admins).values({ email: BOOT_EMAIL, name: "Max Smith", role: "owner", passwordHash: BOOT_HASH, permissions: [] });
        applied.push(`Created owner login ${BOOT_EMAIL}`);
      }
      await db
        .insert(settings)
        .values({ key: BOOT_KEY, value: { appliedAt: new Date().toISOString() }, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value: { appliedAt: new Date().toISOString() }, updatedAt: new Date() } });
    }
  } catch (err) {
    failed.push(`Owner bootstrap: ${(err as Error).message}`);
  }

  // 9) One-time switchboard-operator login (requested by the owner): username
  //    "123" (stored as 123@patriotseriestexas.com — the login form maps bare
  //    usernames to that domain). Lowest role; the Patriot switchboard accepts
  //    any signed-in account. Exactly-once via a settings marker, so the
  //    password can be changed (or the login deleted) later without it
  //    reappearing. Only the offline-generated bcrypt hash lives in the repo.
  try {
    const OP_KEY = "auth.bootstrap.operator123";
    const OP_EMAIL = "123@patriotseriestexas.com";
    const OP_HASH = "$2a$12$ZZkbFqE/SWROc9iW6XL1YumtsQjr9W1ft9xiCrpjS5OTlqphSDdYe";
    const [opDone] = await db.select().from(settings).where(eq(settings.key, OP_KEY));
    if (!opDone) {
      const [existing] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, OP_EMAIL));
      if (!existing) {
        await db.insert(admins).values({ email: OP_EMAIL, name: "Switchboard Operator", role: "timekeeper", passwordHash: OP_HASH, permissions: [] });
        applied.push(`Created switchboard operator login "123"`);
      }
      await db
        .insert(settings)
        .values({ key: OP_KEY, value: { appliedAt: new Date().toISOString() }, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value: { appliedAt: new Date().toISOString() }, updatedAt: new Date() } });
    }
  } catch (err) {
    failed.push(`Operator bootstrap: ${(err as Error).message}`);
  }

  // 10) Merge newly added default Patriot teams (historical clubs like the
  //     Bears, Celtics, Stihl, and Oilers) into an admin-saved team list.
  //     Matched by name; never touches saved teams or their logos.
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, PATRIOT_TEAMS_KEY));
    const savedTeams = Array.isArray(row?.value) ? (row!.value as PatriotTeam[]) : null;
    if (savedTeams) {
      const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "");
      const have = new Set(savedTeams.map((t) => norm(t.name)));
      const missingTeams = DEFAULT_PATRIOT_TEAMS.filter((t) => !have.has(norm(t.name)));
      if (missingTeams.length) {
        await db
          .update(settings)
          .set({ value: [...savedTeams, ...missingTeams], updatedAt: new Date() })
          .where(eq(settings.key, PATRIOT_TEAMS_KEY));
        applied.push(`Added ${missingTeams.length} Patriot team(s): ${missingTeams.map((t) => t.name).join(", ")}`);
      }
    }
  } catch (err) {
    failed.push(`Patriot teams merge: ${(err as Error).message}`);
  }

  // 11) Seed/enrich the referral-attorney stable. Names are ensured (insert if
  //     missing); contact fields are filled ONLY where the row's field is still
  //     blank, so an admin's edits are never overwritten.
  try {
    const existing = await db.select().from(referralAttorneys);
    const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r]));
    let created = 0;
    let enriched = 0;
    for (let i = 0; i < REFERRAL_ATTORNEYS.length; i++) {
      const s = REFERRAL_ATTORNEYS[i];
      const cur = byName.get(s.name.toLowerCase());
      if (!cur) {
        await db.insert(referralAttorneys).values({
          name: s.name, firm: s.firm ?? "", address: s.address ?? "", phone: s.phone ?? "",
          email: s.email ?? "", website: s.website ?? "", practiceArea: s.practiceArea ?? "", sort: i,
        }).onConflictDoNothing({ target: referralAttorneys.name });
        created++;
      } else {
        const patch: Record<string, string> = {};
        if (!cur.firm && s.firm) patch.firm = s.firm;
        if (!cur.address && s.address) patch.address = s.address;
        if (!cur.phone && s.phone) patch.phone = s.phone;
        if (!cur.email && s.email) patch.email = s.email;
        if (!cur.website && s.website) patch.website = s.website;
        if (!cur.practiceArea && s.practiceArea) patch.practiceArea = s.practiceArea;
        if (Object.keys(patch).length) {
          await db.update(referralAttorneys).set(patch).where(eq(referralAttorneys.id, cur.id));
          enriched++;
        }
      }
    }
    if (created || enriched) applied.push(`Referral attorneys: ${created} added, ${enriched} enriched`);
  } catch (err) {
    failed.push(`Referral attorneys seed: ${(err as Error).message}`);
  }

  // 12) Seed the first pre-trial case (Smith v. Morgan, CV24-162). Each part is
  //     guarded separately — case by cause number, then deadlines / witnesses /
  //     proof matrix by "does this case have any yet" — so re-running never
  //     duplicates anything, and an admin's edits or deletions stay deleted.
  try {
    let [row] = await db.select({ id: trialCases.id }).from(trialCases).where(eq(trialCases.causeNumber, CV24_162_CAUSE)).limit(1);
    if (!row) {
      [row] = await db
        .insert(trialCases)
        .values({
          name: CV24_162_CASE.name,
          causeNumber: CV24_162_CASE.causeNumber,
          court: CV24_162_CASE.court,
          matter: CV24_162_CASE.matter,
          notes: CV24_162_CASE.notes,
          createdBy: session.email,
        })
        .returning({ id: trialCases.id });
      applied.push(`Created pre-trial case ${CV24_162_CAUSE}`);
    }
    const caseId = row.id;

    // Backfill the trial / pretrial dates onto an already-seeded case, but never
    // overwrite a date someone has already set.
    const [dates] = await db.select({ trialDate: trialCases.trialDate, pretrialDate: trialCases.pretrialDate }).from(trialCases).where(eq(trialCases.id, caseId));
    const datePatch: Record<string, string> = {};
    if (!dates?.trialDate && CV24_162_CASE.trialDate) datePatch.trialDate = CV24_162_CASE.trialDate;
    if (!dates?.pretrialDate && CV24_162_CASE.pretrialDate) datePatch.pretrialDate = CV24_162_CASE.pretrialDate;
    if (Object.keys(datePatch).length) {
      await db.update(trialCases).set(datePatch).where(eq(trialCases.id, caseId));
      applied.push(`Set ${CV24_162_CAUSE} trial/pretrial dates`);
    }

    // The checklist was originally seeded as a flat list. If that flat seed is
    // still pristine — nothing checked off, nothing assigned, no sub-tasks — swap
    // it for the grouped parent/sub-task version. Any sign of use and we leave it
    // completely alone, so no one's work is thrown away.
    const existingItems = await db
      .select({ id: trialDeadlines.id, parentId: trialDeadlines.parentId, done: trialDeadlines.done, assignee: trialDeadlines.assignee })
      .from(trialDeadlines)
      .where(eq(trialDeadlines.caseId, caseId));
    const pristineFlat =
      existingItems.length > 0 &&
      existingItems.every((r) => r.parentId == null && !r.done && !(r.assignee ?? "").trim());
    if (pristineFlat) {
      await db.delete(trialDeadlines).where(eq(trialDeadlines.caseId, caseId));
      existingItems.length = 0;
      applied.push("Reorganized the CV24-162 checklist into tasks and sub-tasks");
    }

    if (existingItems.length === 0) {
      let sort = 0;
      let parents = 0;
      let subs = 0;
      for (const item of CV24_162_ITEMS) {
        const [parent] = await db
          .insert(trialDeadlines)
          .values({ caseId, parentId: null, title: item.title.slice(0, 255), notes: item.notes ?? "", sort: sort++ })
          .returning({ id: trialDeadlines.id });
        parents++;
        for (const child of item.children ?? []) {
          await db.insert(trialDeadlines).values({ caseId, parentId: parent.id, title: child.title.slice(0, 255), notes: child.notes ?? "", sort: sort++ });
          subs++;
        }
      }
      applied.push(`Seeded ${parents} pre-trial tasks with ${subs} sub-tasks`);
    }

    // Witnesses first — the proof entries reference them by id.
    const witnessIdByKey = new Map<string, number>();
    const [haveWitness] = await db.select({ id: trialWitnesses.id }).from(trialWitnesses).where(eq(trialWitnesses.caseId, caseId)).limit(1);
    if (!haveWitness) {
      for (let i = 0; i < CV24_162_WITNESSES.length; i++) {
        const w = CV24_162_WITNESSES[i];
        const [ins] = await db
          .insert(trialWitnesses)
          .values({ caseId, name: w.name, side: w.side, role: w.role, notes: w.notes ?? "", available: w.available ?? "unknown", sort: i })
          .returning({ id: trialWitnesses.id });
        witnessIdByKey.set(w.key, ins.id);
      }
      applied.push(`Seeded ${CV24_162_WITNESSES.length} trial witnesses`);
    } else {
      // Already seeded: map keys back by name so a re-run can still link proofs.
      const rows = await db.select({ id: trialWitnesses.id, name: trialWitnesses.name }).from(trialWitnesses).where(eq(trialWitnesses.caseId, caseId));
      const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
      for (const w of CV24_162_WITNESSES) {
        const hit = byName.get(w.name.toLowerCase());
        if (hit) witnessIdByKey.set(w.key, hit);
      }
    }

    const [haveClaim] = await db.select({ id: trialClaims.id }).from(trialClaims).where(eq(trialClaims.caseId, caseId)).limit(1);
    if (!haveClaim) {
      let elementCount = 0;
      let proofCount = 0;
      for (let ci = 0; ci < CV24_162_CLAIMS.length; ci++) {
        const c = CV24_162_CLAIMS[ci];
        const [claim] = await db
          .insert(trialClaims)
          .values({ caseId, name: c.name.slice(0, 255), party: c.party ?? "plaintiff", isLead: !!c.isLead, notes: c.notes ?? "", sort: ci })
          .returning({ id: trialClaims.id });
        for (let ei = 0; ei < c.elements.length; ei++) {
          const el = c.elements[ei];
          const [element] = await db
            .insert(trialElements)
            .values({ caseId, claimId: claim.id, text: el.text.slice(0, 500), sort: ei })
            .returning({ id: trialElements.id });
          elementCount++;
          if (el.proofs.length) {
            await db.insert(trialProofs).values(
              el.proofs.map((p, pi) => ({
                caseId,
                elementId: element.id,
                kind: p.kind,
                witnessId: p.witnessKey ? (witnessIdByKey.get(p.witnessKey) ?? null) : null,
                exhibitId: null,
                citation: (p.citation ?? "").slice(0, 500),
                summary: p.summary ?? "",
                anticipated: !!p.anticipated,
                sort: pi,
              })),
            );
            proofCount += el.proofs.length;
          }
        }
      }
      applied.push(`Seeded proof matrix: ${CV24_162_CLAIMS.length} causes of action, ${elementCount} elements, ${proofCount} proof entries`);
    }
  } catch (err) {
    failed.push(`Pre-trial seed: ${(err as Error).message}`);
  }

  return NextResponse.json({ ok: true, applied, ...(failed.length ? { warnings: failed } : {}) });
}
