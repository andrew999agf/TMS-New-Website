import { NextResponse } from "next/server";
import { notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contentBlocks, caseResults, practiceAreas, glossaryTerms, teamMembers } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { CONTENT_BLOCKS } from "@/lib/content/defaults/blocks";
import { PRACTICE_AREAS } from "@/lib/content/defaults/practice-areas";
import { CASE_RESULTS } from "@/lib/content/defaults/results";
import { GLOSSARY_TERMS } from "@/lib/content/defaults/glossary";
import { TEAM } from "@/lib/content/defaults/team";

export const runtime = "nodejs";

/**
 * Re-apply the latest TEXT content (copy, results, counties, glossary, team
 * bios) from the codebase to the database — WITHOUT touching any uploaded media
 * (logos, photos, banners, badges, social/favicon images are all preserved).
 * Lets the owner pull in copy changes with one click instead of editing each
 * field by hand.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const applied: string[] = [];

  try {
    // 1) Content blocks — text only (skip image/video/focal so uploads and
    //    chosen banner crop positions are kept).
    let blockCount = 0;
    for (const b of CONTENT_BLOCKS) {
      if (b.type === "image" || b.type === "video" || b.type === "focal") continue;
      await db
        .insert(contentBlocks)
        .values({ key: b.key, page: b.page, section: b.section, label: b.label, type: b.type, value: b.value })
        .onConflictDoUpdate({
          target: contentBlocks.key,
          set: { label: b.label, type: b.type, value: b.value, updatedAt: new Date() },
        });
      blockCount++;
    }
    applied.push(`Refreshed ${blockCount} text fields`);

    // 2) Case results — full replace (no media involved).
    await db.delete(caseResults);
    for (const r of CASE_RESULTS) {
      await db.insert(caseResults).values({
        category: r.category, title: r.title, stat: r.stat, statLabel: r.statLabel, year: r.year,
        summary: r.summary, detail: r.detail, cite: r.cite, link: r.link,
        practiceSlug: r.practiceSlug, featuredHome: r.featuredHome ?? false, sort: r.sort,
      });
    }
    applied.push(`Refreshed ${CASE_RESULTS.length} results`);

    // 3) Practice areas — upsert text (preserve uploaded heroImage + visibility),
    //    and remove any areas no longer in the defaults (e.g. Foreclosures).
    const slugs = PRACTICE_AREAS.map((p) => p.slug);
    for (const p of PRACTICE_AREAS) {
      await db
        .insert(practiceAreas)
        .values({
          slug: p.slug, title: p.title, group: p.group, sort: p.sort, tagline: p.tagline,
          body: p.body, approach: p.approach, keywords: p.keywords, seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
        })
        .onConflictDoUpdate({
          target: practiceAreas.slug,
          set: {
            title: p.title, group: p.group, sort: p.sort, tagline: p.tagline, body: p.body,
            approach: p.approach, keywords: p.keywords, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
            // NOTE: heroImage + visible intentionally not overwritten.
          },
        });
    }
    if (slugs.length) {
      const removed = await db.delete(practiceAreas).where(notInArray(practiceAreas.slug, slugs)).returning({ slug: practiceAreas.slug });
      applied.push(`Practice areas synced${removed.length ? ` (removed ${removed.length})` : ""}`);
    }

    // 4) Glossary — upsert (no media).
    for (const t of GLOSSARY_TERMS) {
      await db
        .insert(glossaryTerms)
        .values({ slug: t.slug, term: t.term, definition: t.definition, hypothetical: t.hypothetical, relatedPractices: t.relatedPractices, aliases: t.aliases ?? [] })
        .onConflictDoUpdate({ target: glossaryTerms.slug, set: { term: t.term, definition: t.definition, hypothetical: t.hypothetical, relatedPractices: t.relatedPractices, aliases: t.aliases ?? [] } });
    }
    applied.push(`Refreshed ${GLOSSARY_TERMS.length} glossary terms`);

    // 5) Team bios — upsert text (preserve uploaded photo).
    try {
      for (const m of TEAM) {
        await db
          .insert(teamMembers)
          .values({
            slug: m.slug, name: m.name, role: m.role, isAttorney: m.isAttorney, isLead: m.isLead,
            teamLabel: m.teamLabel, office: m.office, email: m.email, directPhone: m.directPhone,
            barNumber: m.barNumber, languages: m.languages, bioProfessional: m.bioProfessional,
            bioBeyond: m.bioBeyond, bioPersonal: m.bioPersonal, experience: m.experience, education: m.education,
            representativeMatters: m.representativeMatters, services: m.services, practiceAreas: m.practiceAreas,
            memberships: m.memberships, barAdmissions: m.barAdmissions, courtAdmissions: m.courtAdmissions, sort: m.sort,
          })
          .onConflictDoUpdate({
            target: teamMembers.slug,
            set: {
              name: m.name, role: m.role, isAttorney: m.isAttorney, isLead: m.isLead, office: m.office,
              email: m.email, directPhone: m.directPhone, barNumber: m.barNumber, languages: m.languages,
              bioProfessional: m.bioProfessional, bioBeyond: m.bioBeyond, bioPersonal: m.bioPersonal,
              experience: m.experience, education: m.education, representativeMatters: m.representativeMatters,
              services: m.services, practiceAreas: m.practiceAreas, memberships: m.memberships,
              barAdmissions: m.barAdmissions, courtAdmissions: m.courtAdmissions,
              // NOTE: photo intentionally not overwritten.
            },
          });
      }
      applied.push("Refreshed team bios");
    } catch {
      /* team table may not exist yet — non-fatal */
    }

    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
