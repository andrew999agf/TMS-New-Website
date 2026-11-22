/**
 * Content the firm has withdrawn from the public site — kept out of every
 * surface (pages, nav, sitemap, schema, search, llms.txt) even if a row still
 * exists in the database, and redirected at the edge (next.config.ts).
 *
 * Why withdrawn rather than "we do not take…": AI search engines retrieve
 * pages by meaning and do not honor exclusion sentences. A page that names a
 * kind of matter in order to turn those callers away is exactly what sends
 * them. So a subject the firm does not want is removed from the site
 * entirely, and nothing on the site says it is declined.
 *
 * DTPA (2026): a page about the Deceptive Trade Practices Act that named car
 * lots, truck dealers and RV dealers drew those callers.
 *
 * Debt-collection subjects (Nov. 2026): garnishments, receiverships,
 * foreclosures and commercial debt collection drew post-judgment and
 * small-dollar callers. The one debt subject the site keeps is the defense of
 * credit card and debt-buyer lawsuits (/practice-areas/consumer-debt-defense).
 */
export const RETIRED_PRACTICE_SLUGS = new Set<string>([
  "dtpa",
  "garnishments", "receivership-matters", "foreclosures", "commercial-debt-collection-defense",
]);
/** Posts withdrawn by slug. A post whose category is a withdrawn practice is withdrawn too, without being listed here. */
export const RETIRED_POST_SLUGS = new Set<string>([
  "dtpa-basics-for-consumers", "dtpa-notice-letter", "dtpa-laundry-list-violations",
  "garnishment-dissolved-bill-of-review", "your-rights-when-an-account-is-garnished", "the-texas-foreclosure-timeline",
  "post-judgment-collection-tools", "the-fair-debt-collection-practices-act",
]);
export const RETIRED_GLOSSARY_SLUGS = new Set<string>([
  "dtpa",
  "writ-of-garnishment", "receivership", "turnover-order", "abstract-of-judgment", "exempt-property",
  "wrongful-foreclosure", "deed-of-trust", "forcible-detainer", "tenant-at-sufferance",
]);
/** Case results withdrawn by their exact title (results have no slug). A result filed under a withdrawn practice is withdrawn too. */
export const RETIRED_RESULT_TITLES = new Set<string>(["Return of Garnished Funds"]);

export const isRetiredPractice = (slug: string) => RETIRED_PRACTICE_SLUGS.has(slug);
export const isRetiredPost = (p: { slug: string; category?: string | null }) => RETIRED_POST_SLUGS.has(p.slug) || (!!p.category && RETIRED_PRACTICE_SLUGS.has(p.category));
export const isRetiredTerm = (slug: string) => RETIRED_GLOSSARY_SLUGS.has(slug);
export const isRetiredResult = (r: { title: string; practiceSlug?: string | null }) => RETIRED_RESULT_TITLES.has(r.title.trim()) || (!!r.practiceSlug && RETIRED_PRACTICE_SLUGS.has(r.practiceSlug));
/** Strip withdrawn practice slugs from a related-practices list. */
export const liveRelated = (slugs: string[] | null | undefined): string[] => (slugs ?? []).filter((s) => !RETIRED_PRACTICE_SLUGS.has(s));
