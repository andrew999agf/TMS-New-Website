import type { Metadata } from "next";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareAccessLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FIRM } from "@/lib/firm";
import { ShareFileTree } from "@/components/admin/ShareFileTree";
import { ShieldCheck, Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Secure Share — ${FIRM.name}`, robots: { index: false, follow: false } };

const REISSUE = "max@texaslawsmith.com";
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-6 border-b border-[var(--c-border)] pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{FIRM.name}</p>
          <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">Secure document share</p>
        </div>
        {children}
        <p className="mt-10 border-t border-[var(--c-border)] pt-4 text-[11px] text-[var(--c-ink-muted)]">
          This is a private link intended only for you. Please don&apos;t forward it. Questions? Contact {FIRM.name} at{" "}
          <a href={`mailto:${FIRM.email}`} className="text-[var(--c-accent)]">{FIRM.email}</a>.
        </p>
      </div>
    </main>
  );
}

function Closed({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-[var(--c-ink-muted)]">{body}</p>
    </Shell>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db) return <Closed title="Temporarily unavailable" body="This share can't be opened right now. Please try again shortly." />;

  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) {
    return <Closed title="This link is no longer active" body={<>Access to this folder has been closed or the link is invalid. To have it re-issued, contact <a href={`mailto:${REISSUE}`} className="text-[var(--c-accent)]">{REISSUE}</a>.</>} />;
  }
  if (rec.expiresAt && rec.expiresAt < new Date()) {
    return <Closed title="This link has expired" body={<>For security, share links expire after a set period. To have this one re-issued, contact <a href={`mailto:${REISSUE}`} className="text-[var(--c-accent)]">{REISSUE}</a>.</>} />;
  }

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (!folder) return <Closed title="Unavailable" body="This folder is no longer available." />;
  const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, folder.id));

  try {
    await db.update(shareRecipients).set({ lastAccessAt: new Date() }).where(eq(shareRecipients.id, rec.id));
    await db.insert(shareAccessLog).values({ folderId: folder.id, recipientId: rec.id, action: "view" });
  } catch {
    /* logging is best-effort */
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
        <ShieldCheck size={14} /> Shared securely with {rec.email}
      </div>
      <h1 className="mt-2 text-xl font-semibold">{folder.name}</h1>
      {folder.caseNumber && <p className="mt-0.5 text-sm text-[var(--c-ink-muted)]">Case {folder.caseNumber}</p>}
      {folder.court && <p className="text-sm text-[var(--c-ink-muted)]">{folder.court}</p>}
      <p className="mt-1 text-xs text-[var(--c-ink-muted)]">Documents shared by {FIRM.name}</p>

      {rec.expiresAt && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-xs text-[var(--c-ink-muted)]">
          <Clock size={13} /> Access expires {fmtDate(rec.expiresAt)}. Need more time? Email <a href={`mailto:${REISSUE}`} className="text-[var(--c-accent)]">{REISSUE}</a>.
        </p>
      )}

      <div className="mt-5">
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--c-border)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
            No documents have been added yet. You&apos;ll keep access with this same link — please check back.
          </div>
        ) : (
          <ShareFileTree files={files.map((f) => ({ id: f.id, path: f.filename, sizeBytes: f.sizeBytes }))} mode="share" token={token} />
        )}
      </div>
    </Shell>
  );
}
