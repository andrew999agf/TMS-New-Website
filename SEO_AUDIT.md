# SEO audit — texaslawsmith.com

Run against the local production build with `node scripts/seo-check.mjs <base> https://www.texaslawsmith.com` (crawls every sitemap URL: status, one H1, title and description length, canonical, JSON-LD parses, duplicate titles/descriptions).

## Findings before this pass (what was really true, checked in code)
| Claim from the outside audit | Finding |
|---|---|
| No structured data | Partly true. Practice pages, posts, glossary and team pages had JSON-LD; the site-wide block was a thin LegalService with no phone, offices, founder or search action. Firm ids differed between templates (`#firm` vs none). |
| No canonical tags; www vs non-www inconsistent | True until the previous commit. Canonicals now on every page; the base host is **www** (what Google already lists). Vercel must redirect the apex to www — see OFFPAGE_CHECKLIST. |
| Blog titles duplicate the firm name | Possible when an editor types the firm into an SEO title; now stripped before the template adds it. |
| Blog body not server-rendered | False. The article body is server-rendered HTML (a client component only adds glossary tooltips). |
| Practice pages don't link to posts | False where a post is tagged to the practice (sidebar "Related reading"); posts now also fall back to same-practice/same-tag articles and link to neighbours. |
| No location pages | True. Added `/locations/fort-worth`, `/locations/weatherford`, `/locations/meridian`. |
| Home H1 has no keyword signal | True. The H1 is now the small line "Texas Trial Lawyers — Fort Worth, Weatherford & Bosque County"; the display line is unchanged visually. |
| sitemap.xml / robots.txt unreachable | They exist and render; could not be fetched from the audit's network. `/payment` (a redirect) removed from the sitemap. |
| Results entry "Plaintiff's verdict" wording | Flagged in CONTENT_REVIEW.md for the attorney; not changed. |
| Image proxy caching | Already `public, max-age=31536000, immutable`. |

## seo-check results
| | URLs | rows with a problem |
|---|---|---|
| Before this pass | 131 | 81 (titles up to 102 chars, descriptions 12–312 chars, two duplicate descriptions, a redirecting URL in the sitemap, no H1 on it) |
| After | 130 | 0 by the check's rules (page title ≤ 56 chars + firm suffix; descriptions 50–155; one H1; canonical; JSON-LD parses; no duplicates) |

## What changed
- `src/lib/seo.ts`: one canonical base, shared `@id`s for the firm and the attorney, title/description clamps, firm-suffix stripper.
- Site-wide schema graph: LegalService with three office nodes (phone, address, map link, page URL), Attorney with bar number, practice catalog, counties served, social links when set, WebSite with sitelinks search box, SiteNavigationElements.
- Breadcrumb markup on every inner template; `/search` page behind the search box.
- Blog posts: BlogPosting with publisher/author ids, dateModified, image, word count; author box; "Updated" date; related-post fallback; earlier/later links.
- Office pages with NAP, map, directions, nearby courts, counties, practice list; linked from the footer, contact page and every practice page.
- Every page's title and description sized for the result page; privacy and disclaimer got their own.

## Not done here (needs the attorney's words — see CONTENT_REVIEW.md)
Practice-page FAQs and expansions, city × practice landing pages. The site is structured to take them (FAQ markup via the existing FaqSection, related-post plumbing, location routes).
