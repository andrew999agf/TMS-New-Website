import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as schema from "../schema";
import { CONTENT_BLOCKS } from "@/lib/content/defaults/blocks";
import { PRACTICE_AREAS } from "@/lib/content/defaults/practice-areas";
import { CASE_RESULTS } from "@/lib/content/defaults/results";
import { GLOSSARY_TERMS } from "@/lib/content/defaults/glossary";
import { BLOG_POSTS } from "@/lib/content/defaults/posts";
import {
  DEFAULT_COLOR_PALETTE_ID,
  DEFAULT_FONT_PALETTE_ID,
} from "@/lib/theme/palettes";

/**
 * Seed the database with all content defined in the build spec, plus the admin
 * user. Idempotent: re-running updates content in place. Run with `npm run db:seed`
 * after `npm run db:migrate`.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Seeding content blocks…");
  for (const b of CONTENT_BLOCKS) {
    await db
      .insert(schema.contentBlocks)
      .values({
        key: b.key,
        page: b.page,
        section: b.section,
        label: b.label,
        type: b.type,
        value: b.value,
      })
      .onConflictDoUpdate({
        target: schema.contentBlocks.key,
        set: { label: b.label, type: b.type, value: b.value },
      });
  }

  console.log("Seeding practice areas…");
  for (const p of PRACTICE_AREAS) {
    await db
      .insert(schema.practiceAreas)
      .values({
        slug: p.slug,
        title: p.title,
        group: p.group,
        sort: p.sort,
        tagline: p.tagline,
        body: p.body,
        approach: p.approach,
        keywords: p.keywords,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      })
      .onConflictDoUpdate({
        target: schema.practiceAreas.slug,
        set: {
          title: p.title,
          group: p.group,
          sort: p.sort,
          tagline: p.tagline,
          body: p.body,
          approach: p.approach,
          keywords: p.keywords,
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
        },
      });
  }

  console.log("Seeding case results…");
  // Results have no natural unique key beyond content; clear and re-insert.
  await db.delete(schema.caseResults);
  for (const r of CASE_RESULTS) {
    await db.insert(schema.caseResults).values({
      category: r.category,
      title: r.title,
      stat: r.stat,
      statLabel: r.statLabel,
      year: r.year,
      summary: r.summary,
      detail: r.detail,
      cite: r.cite,
      link: r.link,
      practiceSlug: r.practiceSlug,
      featuredHome: r.featuredHome ?? false,
      sort: r.sort,
    });
  }

  console.log("Seeding glossary terms…");
  for (const t of GLOSSARY_TERMS) {
    await db
      .insert(schema.glossaryTerms)
      .values({
        slug: t.slug,
        term: t.term,
        definition: t.definition,
        hypothetical: t.hypothetical,
        relatedPractices: t.relatedPractices,
        aliases: t.aliases ?? [],
      })
      .onConflictDoUpdate({
        target: schema.glossaryTerms.slug,
        set: {
          term: t.term,
          definition: t.definition,
          hypothetical: t.hypothetical,
          relatedPractices: t.relatedPractices,
          aliases: t.aliases ?? [],
        },
      });
  }

  console.log("Seeding blog posts…");
  for (const p of BLOG_POSTS) {
    const publishAt = p.publishAt ? new Date(p.publishAt) : null;
    const publishedAt = p.status === "published" ? publishAt : null;
    await db
      .insert(schema.blogPosts)
      .values({
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        body: p.body,
        bannerImage: p.bannerImage,
        category: p.category,
        tags: p.tags,
        author: p.author ?? "T. Maxwell Smith",
        isFirmNews: p.isFirmNews ?? false,
        status: p.status,
        publishAt,
        publishedAt,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        relatedPractices: p.relatedPractices,
        relatedPosts: p.relatedPosts,
      })
      .onConflictDoUpdate({
        target: schema.blogPosts.slug,
        set: {
          title: p.title,
          excerpt: p.excerpt,
          body: p.body,
          category: p.category,
          status: p.status,
          publishAt,
          publishedAt,
          relatedPractices: p.relatedPractices,
          relatedPosts: p.relatedPosts,
        },
      });
  }

  console.log("Seeding theme setting…");
  await db
    .insert(schema.settings)
    .values({
      key: "theme",
      value: {
        colorPaletteId: DEFAULT_COLOR_PALETTE_ID,
        fontPaletteId: DEFAULT_FONT_PALETTE_ID,
      },
    })
    .onConflictDoNothing();

  // Admin user
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    console.log(`Seeding admin user (${email})…`);
    const hash = await bcrypt.hash(password, 12);
    await db
      .insert(schema.admins)
      .values({ email, name: "Max Smith", passwordHash: hash, role: "owner" })
      .onConflictDoUpdate({
        target: schema.admins.email,
        set: { passwordHash: hash },
      });
  } else {
    console.warn(
      "ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user creation. Set them and re-run to create the login.",
    );
  }

  console.log("Seed complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
