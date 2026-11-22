import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { PRACTICE_GROUP_OF, PRACTICE_SORT_OF } from "./defaults/practice-areas";
import { RETIRED_PRACTICE_SLUGS, RETIRED_POST_SLUGS, RETIRED_RESULT_TITLES } from "./retired";
import { encodedVariants } from "./corrections";

/**
 * The November 2026 narrowing of the site to five kinds of work, applied to
 * the copy that lives in the database.
 *
 * The public site is already right without this — withdrawn pages are filtered
 * out in code and the five sections are decided by slug — but the wording of
 * the pages that stay is stored in database rows, and so is what the admin
 * panel shows. This brings those rows into line, once.
 *
 * Every wording change is conditional on the old wording still being there, so
 * a page the firm has rewritten in the admin keeps its rewrite. Nothing is
 * deleted: withdrawn pages, posts and results are switched off (hidden), and
 * can be switched back on in the admin.
 */
type TextField = "title" | "tagline" | "seo_title" | "seo_description";
type PracticeChange = { slug: string; field: TextField; from: string; to: string } | { slug: string; field: "keywords"; from: string[]; to: string[] };

export const PRACTICE_COPY_CHANGES: PracticeChange[] = [
  { slug: "consumer-debt-defense", field: "title", from: "Consumer Debt Defense", to: "Credit Card & Debt-Buyer Lawsuit Defense" },
  { slug: "consumer-debt-defense", field: "tagline", from: "A lawsuit is not a judgment. We hold every collector to its proof.", to: "A lawsuit is not a judgment. We make the card company or the debt buyer prove it." },
  { slug: "consumer-debt-defense", field: "seo_title", from: "Consumer Debt Defense Attorney | Sued by a Debt Buyer in Texas", to: "Credit Card Lawsuit Defense | Texas Consumer Debt Attorney" },
  { slug: "consumer-debt-defense", field: "seo_description", from: "Texas consumer debt defense attorney. Sued by Discover, Capital One, LVNV, or Midland? Make them prove it. We defend and try these cases.", to: "Texas consumer debt attorney for people sued by a credit card company or a debt buyer — Discover, Capital One, LVNV, Midland. Make them prove it. We defend and try these cases." },
  { slug: "consumer-debt-defense", field: "keywords", from: ["being sued", "debt", "credit card", "collection", "debt buyer", "discover", "capital one", "lvnv", "midland", "served papers", "default judgment"], to: ["sued by a credit card company", "credit card lawsuit", "debt buyer lawsuit", "consumer debt attorney", "served with a credit card lawsuit", "default judgment", "Discover", "Capital One", "Bank of America", "Chase", "Barclays", "LVNV Funding", "Midland Credit Management"] },
  { slug: "plaintiffs-litigation", field: "title", from: "Plaintiff's Litigation", to: "Business & Plaintiff's Litigation" },
  { slug: "plaintiffs-litigation", field: "tagline", from: "If you want what you are owed, you have to be willing to sue.", to: "High-stakes claims, prepared so the other side has to take the number seriously." },
  { slug: "plaintiffs-litigation", field: "seo_title", from: "Plaintiff's Litigation Attorney | T. Maxwell Smith, PLLC", to: "Business & Plaintiff's Litigation Attorney | Texas" },
  { slug: "plaintiffs-litigation", field: "keywords", from: ["sue someone", "owed money", "plaintiff", "wronged", "claim", "damages", "recover", "bank fraud", "sue a bank", "partnership dispute", "business partner"], to: ["bank fraud", "sue a bank", "fraud claim against a financial institution", "partnership dispute", "family partnership dispute", "business partner dispute", "business tort", "high-stakes business claim"] },
  { slug: "business-related-matters", field: "title", from: "Business-Related Matters", to: "Business Counsel for Owners" },
  { slug: "business-related-matters", field: "keywords", from: ["business", "company", "contract", "vendor", "employee", "advice", "counsel"], to: ["business attorney", "counsel for business owners", "outside general counsel", "business contracts", "company owner"] },
  { slug: "civil-commercial-litigation", field: "keywords", from: ["sued", "lawsuit", "breach of contract", "business dispute", "partner dispute", "partnership dispute", "owed money", "fraud", "non-compete", "litigation", "private nuisance", "nuisance lawsuit", "compressor station", "pump station", "ranch"], to: ["commercial litigation", "business litigation", "breach of contract", "business dispute", "business divorce", "partnership dispute", "fiduciary dispute", "fraud", "non-compete", "private nuisance", "nuisance lawsuit", "compressor station", "pump station", "ranch"] },
];

/** Home-page text blocks: old wording that said the firm practises everything, and what replaces it. */
export const BLOCK_COPY_CHANGES: { key: string; from: string; to: string }[] = [
  { key: "home.hero.support", from: "Generally trained for your specific legal matter. The law is a seamless web — one matter bleeds into the next. A trial firm with a general practice, ready for whatever your case touches.", to: "Generally trained for your specific legal matter. A Texas trial firm for serious injury and wrongful death, civil and commercial litigation, probate and estate planning, business transactions, and the defense of credit card lawsuits." },
  { key: "home.hero.support", from: "The law is a seamless web — one matter bleeds into the next. A trial firm with a general practice, ready for whatever your case touches.", to: "Generally trained for your specific legal matter. A Texas trial firm for serious injury and wrongful death, civil and commercial litigation, probate and estate planning, business transactions, and the defense of credit card lawsuits." },
  { key: "home.firm.heading", from: "A trial firm with a general practice.", to: "A trial firm with a focused practice." },
  { key: "home.practice.body", from: "A full range of practice areas, one discipline: prepare it for trial.", to: "Five areas of practice, one discipline: prepare it for trial." },
];
/** One paragraph inside the home page's rich-text "The Firm" block. */
export const FIRM_BODY_CHANGE = {
  key: "home.firm.body",
  from: "<p>The law is a seamless web: a business matter can turn on family, probate, criminal, or tort law without warning, and an issue in one area often calls for counsel in another. We practice across the whole of Texas law so your representation is comprehensive — and we bring a born Texan's mindset of no retreat, no surrender to every matter.</p>",
  to: "<p>We concentrate on five kinds of work: serious injury and wrongful death claims, civil and commercial litigation, probate and estate planning, business transactions, and the defense of credit card and debt-buyer lawsuits. Every matter is prepared as if it will be tried — and we bring a born Texan's mindset of no retreat, no surrender to each one.</p>",
};
/** One line in a staff member's list of services. */
export const TEAM_SERVICE_CHANGE = { from: "Drafting and e-filing pleadings and discovery in Texas debt-defense and small-claims matters", to: "Drafting and e-filing pleadings and discovery in Texas credit card and debt-buyer lawsuit defense matters" };

const MARKER = "practice-focus:2026-11:v1";
let run: Promise<void> | null = null;
export function ensurePracticeFocus(): Promise<void> {
  if (!db) return Promise.resolve();
  run ??= (async () => {
    const done = await db!.select({ key: settings.key }).from(settings).where(eq(settings.key, MARKER)).limit(1);
    if (done.length) return;
    const step = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (err) { console.error(`[content] practice focus (${label}):`, (err as Error).message); } };

    // Withdrawn subjects: switched off, not deleted.
    const practices = [...RETIRED_PRACTICE_SLUGS], posts = [...RETIRED_POST_SLUGS], results = [...RETIRED_RESULT_TITLES];
    const list = (v: string[]) => sql.join(v.map((x) => sql`${x}`), sql`, `);
    await step("pages off", () => db!.execute(sql`UPDATE practice_areas SET visible = false, updated_at = now() WHERE slug IN (${list(practices)}) AND visible = true`));
    await step("posts off", () => db!.execute(sql`UPDATE blog_posts SET status = 'hidden', updated_at = now() WHERE (slug IN (${list(posts)}) OR category IN (${list(practices)})) AND status::text IN ('published', 'scheduled')`));
    await step("results off", () => db!.execute(sql`UPDATE case_results SET visible = false WHERE (title IN (${list(results)}) OR practice_slug IN (${list(practices)})) AND visible = true`));

    // The five sections and the order inside them. The column began life as a three-value enum; widen it first.
    await step("widen group", () => db!.execute(sql`ALTER TABLE practice_areas ALTER COLUMN "group" TYPE varchar(32) USING "group"::text`));
    for (const [slug, group] of Object.entries(PRACTICE_GROUP_OF)) {
      await step(`section ${slug}`, () => db!.execute(sql`UPDATE practice_areas SET "group" = ${group}, sort = ${PRACTICE_SORT_OF[slug] ?? 99} WHERE slug = ${slug}`));
    }

    // Wording on the pages that stay, only where the old wording is still there.
    for (const c of PRACTICE_COPY_CHANGES) {
      if (c.field === "keywords") {
        await step(`${c.slug} keywords`, () => db!.execute(sql`UPDATE practice_areas SET keywords = ${JSON.stringify(c.to)}::jsonb, updated_at = now() WHERE slug = ${c.slug} AND keywords = ${JSON.stringify(c.from)}::jsonb`));
      } else {
        const col = sql.raw(c.field);
        for (const from of encodedVariants(c.from)) await step(`${c.slug} ${c.field}`, () => db!.execute(sql`UPDATE practice_areas SET ${col} = ${c.to}, updated_at = now() WHERE slug = ${c.slug} AND ${col} = ${from}`));
      }
    }
    for (const b of BLOCK_COPY_CHANGES) {
      for (const from of encodedVariants(b.from)) {
        await step(b.key, () => db!.execute(sql`UPDATE content_blocks SET value = to_jsonb(${b.to}::text), updated_at = now() WHERE key = ${b.key} AND value = to_jsonb(${from}::text)`));
        // A parked draft holding the old wording would bring it back on its next publish.
        await step(`${b.key} draft`, () => db!.execute(sql`UPDATE content_blocks SET draft = to_jsonb(${b.to}::text) WHERE key = ${b.key} AND draft = to_jsonb(${from}::text)`));
      }
    }
    for (const from of encodedVariants(FIRM_BODY_CHANGE.from)) {
      await step("firm body", () => db!.execute(sql`UPDATE content_blocks SET value = to_jsonb(replace(value #>> '{}', ${from}, ${FIRM_BODY_CHANGE.to})), updated_at = now() WHERE key = ${FIRM_BODY_CHANGE.key} AND position(${from} in value #>> '{}') > 0`));
      await step("firm body draft", () => db!.execute(sql`UPDATE content_blocks SET draft = to_jsonb(replace(draft #>> '{}', ${from}, ${FIRM_BODY_CHANGE.to})) WHERE key = ${FIRM_BODY_CHANGE.key} AND draft IS NOT NULL AND position(${from} in draft #>> '{}') > 0`));
    }
    await step("team services", () => db!.execute(sql`UPDATE team_members SET services = replace(services::text, ${TEAM_SERVICE_CHANGE.from}, ${TEAM_SERVICE_CHANGE.to})::jsonb WHERE position(${TEAM_SERVICE_CHANGE.from} in services::text) > 0`));

    await db!.insert(settings).values({ key: MARKER, value: { at: new Date().toISOString() } }).onConflictDoNothing();
  })().catch((err) => { console.error("[content] practice focus:", err); run = null; });
  return run;
}
