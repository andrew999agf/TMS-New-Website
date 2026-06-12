# T. Maxwell Smith, PLLC — Firm Website + CMS

A custom, production-grade website and full content-management system for a Texas
trial firm. Built with Next.js 16 (App Router, RSC, TypeScript), Tailwind v4,
Drizzle ORM on Postgres, Vercel Blob, and Resend.

> The entire public site renders **without any environment variables** — it falls
> back to typed seed content. Provisioning the database and seeding it makes every
> piece of copy editable through the admin CMS.

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # optional — site runs without it
npm run dev                  # http://localhost:3000
```

### With a database (enables the CMS + intake persistence)

```bash
# 1. Set DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD in .env.local
npm run db:generate          # generate SQL migrations from the schema
npm run db:migrate           # apply migrations
npm run db:seed              # load all content + create the admin user
npm run dev
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed content + admin user (idempotent) |
| `npm run db:studio` | Drizzle Studio |

## Architecture

```
src/
  app/
    (public)/        Public site (route group) — layout with nav + footer
    api/             Route handlers (intake, …)
    layout.tsx       Root layout — injects active theme CSS + fonts
    sitemap.ts robots.ts
  components/        UI (site/, intake/)
  db/                schema.ts, index.ts (connection), migrate.ts, seed/
  lib/
    content/         Data-access layer (DB → seed fallback) + defaults/
    theme/           Palettes, CSS-var generation, contrast utils
    intake/          Wizard branches + keyword map + CSV
    firm.ts          VERIFIED FIRM FACTS (single source of truth)
```

### Theming

Five color palettes × five font palettes, all open-source and mutually
compatible. The active selection is stored in the `settings` table and rendered
to CSS custom properties in `<head>` on every request, so switching in the admin
Appearance tab is instant and site-wide with no rebuild and no flash.

## Deployment (Vercel)

1. Import the repo into Vercel.
2. Add the environment variables from `.env.example`.
3. Provision Vercel Postgres and Vercel Blob; set `DATABASE_URL` and
   `BLOB_READ_WRITE_TOKEN`.
4. Run migrations + seed (locally against the prod `DATABASE_URL`, or via a
   one-off job).
5. Connect the domain.

See `BUILD-LOG.md` for status and the human punch list, and `COMPLIANCE.md` for
attorney-advertising notes and `[VERIFY WITH MAX]` items.

> **Vercel tier:** Hobby is fine to start, but its terms restrict commercial use.
> Plan to upgrade to Pro (~$20/mo) before the firm relies on the site.
