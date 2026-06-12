# BUILD LOG — T. Maxwell Smith, PLLC

Living record of what is done, what is pending, and what needs the human.

## Stack decisions

- **Next.js 16** (App Router, RSC, TypeScript) + **Tailwind v4** (CSS-variable theming).
- **Drizzle ORM** on **Postgres** (Vercel/Neon). Chosen over Prisma for: no
  separate engine binary (lighter serverless cold starts), SQL-first schema that
  lives in one TS file, and first-class `postgres-js` driver. Migrations via
  `drizzle-kit`.
- **Auth:** hand-rolled sessions (bcryptjs hashing + `jose` JWT in httpOnly
  cookies + middleware). Avoids next-auth version friction on brand-new Next 16.
  _(In progress — see Pending.)_
- **Media:** Vercel Blob. **Email:** Resend. **Cron:** Vercel Cron.
- **Graceful degradation:** the entire site renders with NO env vars. The content
  layer (`src/lib/content`) reads the DB when `DATABASE_URL` is set and falls
  back to typed seed defaults otherwise. This let the site build and run before
  any infrastructure is provisioned.

## Done

- [x] Project scaffold, TypeScript, Tailwind v4, fonts, build pipeline (builds clean — 86 pages).
- [x] **Theme engine:** 5 color palettes + 5 font palettes as full token sets,
      rendered to CSS variables for instant, no-flash, site-wide switching.
      Custom-palette tokens + WCAG contrast checker utilities in place.
- [x] **Database schema** (full): admins, audit log, settings, content blocks,
      revisions, pages, practice areas, case results, blog posts, glossary,
      media, banner items, testimonials, intake submissions, page views.
- [x] **Content layer** with DB→seed fallback for every content type.
- [x] **Verified firm facts** (Section 6) encoded as the single source of truth,
      with `[VERIFY]` items tagged inline.
- [x] **Public site, fully data-driven (no hard-coded copy):**
      Home (hero banner system, firm strip, results band, practice grid,
      counties band, quote, offices), About, Practice Areas index + **15**
      detail pages, Results, Blog index + post template, Glossary index + term
      pages, Contact, Consultation (intake wizard), Payment, Privacy, Disclaimer,
      branded 404 + error.
- [x] **Hero banner system:** ordered media sequence, crossfade, Ken Burns on
      stills, video support, reduced-motion + placeholder fallbacks.
- [x] **Practice-area content:** all 15 written in the firm voice with
      "How we approach it" trial-readiness blocks + intake deep-links.
- [x] **Results:** all Section 6.4 data (marquee $11.2M card, appellate record,
      settlements, jury record, counties/courts, banks list) + disclaimers.
- [x] **Blog seed:** 9 firm-news posts (HIDDEN) + 40 educational posts
      (10 Published, backdated Jan–Mar 2026; 30 Scheduled with irregular gaps
      across 2026). Internal links to practice areas + related posts.
- [x] **Glossary:** 46 terms with original definitions + flashcard hypotheticals;
      auto-highlight + accessible tooltip in post bodies; auto-index page.
- [x] **Intake wizard:** entry screen with fuzzy keyword bubble matching (Fuse.js),
      all 10 branches + common final steps, progress/back, practice deep-linking.
- [x] **Intake API:** zod validation, honeypot + rate limit, DB persistence,
      Resend email with **CSV attachment**, urgency flagging. Degrades gracefully
      with no DB/Resend.
- [x] **SEO:** per-page metadata, dynamic `sitemap.xml`, `robots.txt`.
- [x] DB tooling: `drizzle.config.ts`, migrate script, idempotent seed script.

## Pending (next increments, not blocked on human)

- [ ] **Auth + middleware** (`/admin` protection, login, sessions, rate limit, audit).
- [ ] **Admin CMS UI:** Dashboard, Pages (live preview), Practice Areas, Results,
      Blog (+ calendar), Glossary, Media, Intake table, Appearance (palette pickers),
      Settings. Server actions with zod + revision log.
- [ ] **Media library + in-browser image editor** (crop/adjust/branded filters/
      background removal/headshot canvas) + Vercel Blob upload routes.
- [ ] **Structured data** (LegalService/Attorney, BlogPosting, DefinedTerm, FAQ).
- [ ] **Vercel Cron** route to publish scheduled posts; `vercel.json` cron config.
- [ ] **Analytics:** page-view capture + internal dashboard; GA4 slot; Vercel Analytics.
- [ ] **Testimonials** public section (CRUD scaffolded in schema).
- [ ] Accessibility + performance passes (Lighthouse 90+ verification).
- [ ] Turnstile wiring (env-gated).

## Needs the human (collect; not blocking)

See `PUNCH-LIST` section at the bottom and `COMPLIANCE.md`. Summary:
Vercel project + env vars; Postgres URL; Blob token; Resend account + verified
domain; `AUTH_SECRET`; Clio payment link; GA4 ID; domain/DNS; real photography +
edited Nelson banner clip; every `[VERIFY WITH MAX]` fact; Texas advertising review.
