# LAUNCH CHECKLIST — T. Maxwell Smith, PLLC

Single source of truth for getting the site from "deployed privately" to "public."
Check items off as they're done. Items marked **[MAX]** require the attorney.

---

## Status at a glance

| Phase | What it unlocks | Status |
|---|---|---|
| 1. Online (Vercel) | View the full site | ✅ DONE |
| 2. CMS (Neon DB) | Log in + edit everything | ✅ DONE |
| 3. Images (Vercel Blob) | Uploads + image editor + real banner | 🔄 IN PROGRESS |
| 4. Intake email (Resend) | Get emailed every lead | ⬜ TODO |
| 5. Go-live polish | Public launch | ⬜ TODO (several [MAX]) |

Admin login: `/admin` — user `tmswebsite2026@gmail.com`.

---

## Phase 3 — Images / Vercel Blob  🔄

- [ ] Vercel → Storage → Create → **Blob** → connect to the `TMS-New-Website` project (Production). This auto-sets `BLOB_READ_WRITE_TOKEN`.
- [ ] **Redeploy** (Deployments → ⋯ → Redeploy) so the token takes effect.
- [ ] Confirm it works: **Admin → Media → upload an image** (no "storage not configured" error).
- [ ] **Admin → Banner →** add 2–3 items, pasting each Media URL, to replace the placeholder hero.

## Phase 4 — Intake email / Resend  ⬜

- [ ] Create a **resend.com** account (free tier).
- [ ] **Domains → Add** `texaslawsmith.com` → add the DNS records Resend shows → **Verify**.
- [ ] **API Keys → Create** → copy the `re_...` key.
- [ ] Add 3 env vars in Vercel (Production), then **redeploy**:
  - `RESEND_API_KEY` = your `re_...` key
  - `RESEND_FROM` = `T. Maxwell Smith, PLLC <intake@texaslawsmith.com>`
  - `INTAKE_NOTIFY_EMAIL` = `tmswebsite2026@gmail.com`
- [ ] Test: submit `/consultation` → confirm the lead email + CSV arrives at `tmswebsite2026@gmail.com` and the row shows in **Admin → Intake**.

## Phase 5 — Go-live polish  ⬜

- [ ] Set `NEXT_PUBLIC_SITE_URL` to the stable production URL (then to `https://texaslawsmith.com` once the domain is live), redeploy.
- [ ] Connect the **domain** in Vercel → Settings → Domains → add `texaslawsmith.com` → set the DNS records Vercel gives you. **[MAX: confirm the domain.]**
- [ ] **[MAX]** Add the **Clio payment link** in Admin → Pages → Payment (the `/payment` page is empty until then; see `FIRM.paymentUrlPlaceholder` in `src/lib/firm.ts`).
- [ ] (Optional) `NEXT_PUBLIC_GA4_ID` for Google Analytics.
- [ ] (Optional) `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for extra intake spam protection.
- [ ] Supply **real media**: attorney portrait, office photos, the edited Nelson clip → upload via Admin → Media → wire into Banner/About.
- [ ] **[MAX]** Verify the facts below.
- [ ] **[MAX]** Confirm whether any of the site needs a **Texas attorney-advertising** filing/exemption (State Bar Advertising Review).
- [ ] **[MAX]** After review, flip the **9 hidden firm-news posts** to Published (Admin → Blog).
- [ ] Decide on **Vercel Pro (~$20/mo)** before commercial launch (Hobby restricts commercial use; Pro also allows more frequent cron).
- [ ] When ready for the public: Vercel → Settings → **Deployment Protection → turn off Vercel Authentication**.

---

## [MAX] Facts to verify — exact locations

All firm facts live in `src/lib/firm.ts` (the single source of truth). Confirm:

| Fact | Current value | Where | Note |
|---|---|---|---|
| **Bar number** | `24110379` | `firm.ts:17` | A signature block shows **`24110371`** — confirm which is correct. |
| **Fort Worth suite** | `Suite 200`, `1612 Summit Ave.` | `firm.ts:51` | Confirm suite #. |
| **Fort Worth phone** | `(817) 348-8325` | `firm.ts:55` | Confirm. |
| **Domain** | `texaslawsmith.com` | `firm.ts:25` | Confirm. |
| **Jury-trial count/labels** | "numerous jury trials" (no number) | results content | If a specific count (>10) or acquittal/hung-jury labels are to be published, confirm. See `COMPLIANCE.md`. |

Other facts encoded (confirm if any are wrong): admitted 2018; Fifth Circuit 2025; Meridian principal office `115 W. River St., PO Box 123`; Weatherford `100 Austin Ave., Suite 101`; fax `(817) 532-3419`; email `max@texaslawsmith.com`.

Once Max confirms, the fixes are one-line edits in `src/lib/firm.ts` — send them over and they take ~2 minutes.

---

## Reference — all environment variables

| Var | Status | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ set | Neon connection string. |
| `AUTH_SECRET` | ✅ set | Session signing. |
| `CRON_SECRET` | ✅ set | Scheduled-post publishing. |
| `BLOB_READ_WRITE_TOKEN` | 🔄 Phase 3 | Auto-set when Blob store is connected. |
| `NEXT_PUBLIC_SITE_URL` | ⬜ Phase 5 | Stable prod URL, no trailing slash. |
| `RESEND_API_KEY` | ⬜ Phase 4 | Secret — add in Vercel, never commit. |
| `RESEND_FROM` | ⬜ Phase 4 | `T. Maxwell Smith, PLLC <intake@texaslawsmith.com>` |
| `INTAKE_NOTIFY_EMAIL` | ⬜ Phase 4 | `tmswebsite2026@gmail.com` |
| `NEXT_PUBLIC_GA4_ID` | ⬜ optional | Google Analytics. |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ⬜ optional | Spam protection. |
