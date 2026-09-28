import { notFound } from "next/navigation";

import { Assistant } from "@/components/admin/Assistant";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath, canUseAssistantCode } from "@/lib/admin-sections";
import { aiPublicInfo } from "@/lib/ai/config";
import { db } from "@/db";
import { assistantThreads, caseHub } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { ThreadRow } from "./actions";

export const dynamic = "force-dynamic";

// Browser-tab title for signed-in users; the social-share card for this URL
// lives in /aifred-preview (middleware hands preview bots that stub, since
// they can't get past the login).
export const metadata = { title: "AI.fred — AI Administrative Assistant" };

export default async function AssistantPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/assistant", session.role, session.permissions)) notFound();

  const { configured, label } = aiPublicInfo();

  // Saved conversations (newest first). If the table isn't created yet the tab
  // still works — conversations just aren't saved until Database updates runs.
  let threads: ThreadRow[] = [];
  let saveable = false;
  if (db) {
    try {
      const { ensureDiscoveryTables } = await import("@/db/ensure");
      await ensureDiscoveryTables();
      const rows = await db
        .select({ id: assistantThreads.id, mode: assistantThreads.mode, title: assistantThreads.title, updatedAt: assistantThreads.updatedAt, sharedFrom: assistantThreads.sharedFrom })
        .from(assistantThreads)
        .where(eq(assistantThreads.userEmail, session.email))
        .orderBy(desc(assistantThreads.updatedAt))
        .limit(100);
      threads = rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString(), sharedFrom: r.sharedFrom || undefined }));
      saveable = true;
    } catch {
      saveable = false;
    }
  }

  // Matter numbers for the attach-a-case picker (most recently touched first).
  let matters: string[] = [];
  if (db) {
    try {
      const rows = await db
        .select({ matter: caseHub.matter })
        .from(caseHub)
        .where(eq(caseHub.archived, false))
        .orderBy(desc(caseHub.updatedAt))
        .limit(200);
      matters = rows.map((r) => r.matter).filter(Boolean);
    } catch { /* hub table pending */ }
  }

  // The Coding tool is a separately granted ability (owners always have it;
  // everyone else needs the checkbox in User Management).
  const codeAllowed = canUseAssistantCode(session.role, session.permissions);

  // The lux skin lives ONLY on this tab: a scoped wrapper re-points the
  // admin's CSS variables to the dark/gold palette, so every control inside
  // re-dresses itself while the sidebar and every other tab stay untouched.
  // Phone/tablet (<lg) work like the ChatGPT/Claude apps: the page is exactly
  // one viewport tall (no scrolling), the header shrinks to a slim brand bar,
  // and the chat column flexes to fill whatever is left — composer pinned at
  // the bottom. Desktop keeps the full lockup and tagline.
  return (
    <div className="aifred-lux">
      <div className="aifred-lux-glow" aria-hidden />
      <header className="relative flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-1 pt-2 sm:px-8 lg:pt-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed */}
        <img src="/aifred-logo.webp" alt="AI.fred — AI administrative assistant" className="aifred-logo mx-auto -my-2 h-16 w-auto select-none mix-blend-screen lg:-my-4 lg:-ml-6 lg:mx-0 lg:h-36" draggable={false} />
        <p className="hidden max-w-xl flex-1 basis-72 text-sm leading-relaxed text-[var(--c-ink-muted)] lg:block">
          The firm&apos;s in-house AI — at your service. General questions, document drafting, case lookups, and coding, with saved conversations and voice. Admin-only, kept off the public site.
        </p>
      </header>
      <div className="aifred-divider shrink-0" aria-hidden />
      <div className="relative p-2 sm:p-6 sm:pt-3 max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:pb-2">
        <Assistant configured={configured} label={label} initialThreads={threads} saveable={saveable} codeAllowed={codeAllowed} matters={matters} />
      </div>
    </div>
  );
}
