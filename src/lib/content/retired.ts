/**
 * Content the firm has withdrawn from the public site — kept out of every
 * surface (pages, nav, sitemap, schema, search, llms.txt) even if a row still
 * exists in the database, and redirected at the edge (next.config.ts).
 *
 * Why DTPA is here: AI search engines retrieve pages by meaning and do not
 * honor "we do not take…" sentences. A page about the Deceptive Trade
 * Practices Act that named car lots, truck dealers and RV dealers — to turn
 * those callers away — was exactly what sent them. The subject is withdrawn
 * from the site entirely; nothing on it mentions dealers or vehicle purchases.
 */
export const RETIRED_PRACTICE_SLUGS = new Set<string>(["dtpa"]);
export const RETIRED_POST_SLUGS = new Set<string>(["dtpa-basics-for-consumers", "dtpa-notice-letter", "dtpa-laundry-list-violations"]);
export const RETIRED_GLOSSARY_SLUGS = new Set<string>(["dtpa"]);

export const isRetiredPractice = (slug: string) => RETIRED_PRACTICE_SLUGS.has(slug);
export const isRetiredPost = (p: { slug: string; category?: string | null }) => RETIRED_POST_SLUGS.has(p.slug) || (!!p.category && RETIRED_PRACTICE_SLUGS.has(p.category));
export const isRetiredTerm = (slug: string) => RETIRED_GLOSSARY_SLUGS.has(slug);
/** Strip withdrawn practice slugs from a related-practices list. */
export const liveRelated = (slugs: string[] | null | undefined): string[] => (slugs ?? []).filter((s) => !RETIRED_PRACTICE_SLUGS.has(s));
