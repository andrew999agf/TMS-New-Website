# Content needing the attorney's eye

Nothing below was changed. Each item needs Max's decision before it ships.

## Wording to confirm
- **Results → "Plaintiff's verdict after a four-day jury trial" (Smith v. Morgan, Cause No. CV24-162, 220th District Court, Bosque County).** The heading and stat label say *plaintiff's* verdict; the summary says the jury found for "our client" and the road to be public. If the firm represented the plaintiff, it reads fine. If the firm represented the defense, the heading should say "Defense verdict" or "Jury verdict for our client." File: `src/lib/content/defaults/results.ts` (and the same entry in the admin Results list if it was edited there).

## Drafts proposed, not written (legal content; attorney authorship required)
1. **Practice-area FAQs** — 5 to 8 plain-English questions per practice page, shown on the page and marked up as FAQPage. Candidate questions are easy to list; the answers are legal statements and should be Max's words. When ready, add an `faq` list to each practice area in the admin and the page will render and mark it up.
2. **Practice-area expansions** — "What this covers" (case types), "Texas law you should know" (linking to /texas-rules and /glossary entries the site already has). Same rule: drafts come from the firm, the site gives them structure.
3. **City × practice pages** (Fort Worth personal injury lawyer, Fort Worth appellate attorney, Parker County probate attorney, Texas data-center easement attorney, …). Each needs 600+ words of genuinely local content. The three office pages at /locations/* are live and factual; these would be the next layer.

## Rules applied to everything the site generates
- No "best", "expert", "specialist" or "specializes" anywhere (Texas Disciplinary Rules 7.01–7.05). Existing disclaimers untouched.
- No results marked up as reviews or ratings; no AggregateRating from third-party reviews.
- Nothing invented: no geo coordinates, courthouse addresses, profile URLs or admission dates that aren't already in the firm's verified constants.
