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

- [x] **Auth + middleware:** bcrypt + `jose` JWT sessions, httpOnly cookies,
      login lockout, audit log, middleware-protected `/admin`, login page.
- [x] **Admin CMS UI:** Dashboard (stats), Pages (content-block editor,
      draft→publish), Appearance (live 5×5 palette switcher + custom tokens +
      AA contrast checker + real-time preview), Intake (filter/status/CSV),
      Blog (list + publish/hide toggle), Practice Areas / Results / Glossary
      list views, Media library + upload, Settings. Server actions persist to DB.
- [x] **Media upload** route (Vercel Blob), graceful without token.
- [x] **Structured data:** LegalService/Attorney (site-wide), BlogPosting,
      DefinedTerm.
- [x] **Vercel Cron** publish route + `vercel.json`.
- [x] **Drizzle migration** generated (`drizzle/0000_*.sql`).

## Pending (next increments, not blocked on human)

- [ ] **In-browser image editor** (crop/adjust/branded filters "Courtroom/
      Headshot/Authority/Archive"/background removal/headshot canvas). The Media
      library + upload pipeline are in place; the canvas editor is the remaining
      piece.
- [ ] **Per-record rich editors** for practice areas, results, glossary, and a
      full blog post editor (Tiptap) with the inline "mark as glossary term"
      flow and content-calendar drag-to-reschedule. (List views + visibility/
      status controls are done; copy currently edited via DB/seed + Pages.)
- [ ] **Analytics:** page-view capture middleware + internal dashboard charts;
      GA4 script injection from the saved setting; Vercel Analytics.
- [ ] **Testimonials** public section (schema + admin CRUD; none at launch).
- [ ] **Revision restore UI** (schema in place).
- [ ] Accessibility + performance verification passes (Lighthouse 90+).
- [ ] Turnstile wiring (env-gated) on the intake form.
- [ ] FAQPage schema where natural.

> Note: most "pending" admin editors require a live `DATABASE_URL` to exercise
> end-to-end. The data model, server actions, and read paths are built; they
> light up the moment the database is provisioned and seeded.

## Needs the human (collect; not blocking)

See `PUNCH-LIST` section at the bottom and `COMPLIANCE.md`. Summary:
Vercel project + env vars; Postgres URL; Blob token; Resend account + verified
domain; `AUTH_SECRET`; Clio payment link; GA4 ID; domain/DNS; real photography +
edited Nelson banner clip; every `[VERIFY WITH MAX]` fact; Texas advertising review.
