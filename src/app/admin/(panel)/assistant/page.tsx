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
  return (
    <div className="aifred-lux">
      <div className="aifred-lux-glow" aria-hidden />
      <header className="relative flex flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-1 pt-3 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed */}
        <img src="/aifred-logo.webp" alt="AI.fred — AI administrative assistant" className="aifred-logo -my-4 -ml-6 h-32 w-auto select-none mix-blend-screen sm:h-36" draggable={false} />
        <p className="max-w-xl flex-1 basis-72 text-sm leading-relaxed text-[var(--c-ink-muted)]">
          The firm&apos;s in-house AI — at your service. General questions, document drafting, case lookups, and coding, with saved conversations and voice. Admin-only, kept off the public site.
        </p>
      </header>
      <div className="aifred-divider" aria-hidden />
      <div className="relative p-2 sm:p-6 sm:pt-3">
        <Assistant configured={configured} label={label} initialThreads={threads} saveable={saveable} codeAllowed={codeAllowed} matters={matters} />
      </div>
    </div>
  );
}
