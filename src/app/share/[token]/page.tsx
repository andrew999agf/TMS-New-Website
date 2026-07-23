import type { Metadata } from "next";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareAccessLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FIRM } from "@/lib/firm";
import { shareType } from "@/lib/share/types";
import { FileText, Download, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Secure Share — ${FIRM.name}`, robots: { index: false, follow: false } };

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <div className="mb-6 border-b border-black/10 pb-4 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a1f2b]">{FIRM.name}</p>
        <p className="mt-0.5 text-xs text-neutral-500">Secure document share</p>
      </div>
      {children}
      <p className="mt-10 border-t border-black/10 pt-4 text-[11px] text-neutral-400 dark:border-white/10">
        This is a private link intended only for you. Please don&apos;t forward it. Questions? Contact {FIRM.name} at {FIRM.email}.
      </p>
    </main>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!db) {
    return <Shell><p className="text-sm text-neutral-600">This share is temporarily unavailable.</p></Shell>;
  }

  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">Access to this folder has been closed or the link is invalid. If you believe this is a mistake, contact {FIRM.name} at {FIRM.email}.</p>
      </Shell>
    );
  }

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (!folder) {
    return <Shell><p className="text-sm text-neutral-600">This folder is no longer available.</p></Shell>;
  }
  const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, folder.id));

  // Record the view (best-effort).
  try {
    await db.update(shareRecipients).set({ lastAccessAt: new Date() }).where(eq(shareRecipients.id, rec.id));
    await db.insert(shareAccessLog).values({ folderId: folder.id, recipientId: rec.id, action: "view" });
  } catch {
    /* logging is best-effort */
  }

  const t = shareType(folder.type);

  return (
    <Shell>
      <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
        <ShieldCheck size={14} /> Shared securely with {rec.email}
      </div>
      <h1 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-50">{folder.name}</h1>
      {folder.caseNumber && <p className="mt-0.5 text-sm text-neutral-500">Case {folder.caseNumber}</p>}
      {folder.court && <p className="text-sm text-neutral-500">{folder.court}</p>}
      <p className="mt-1 text-xs text-neutral-400">{t.audience === "adversary" ? "Documents produced by" : "Documents shared by"} {FIRM.name}</p>

      <div className="mt-6">
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-neutral-500 dark:border-white/15">
            No documents have been added yet. Please check back — you&apos;ll keep access with this same link.
          </div>
        ) : (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 p-3">
                <FileText size={17} className="shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-800 dark:text-neutral-100">{f.filename}</span>
                <span className="shrink-0 text-xs text-neutral-400">{fmtSize(f.sizeBytes)}</span>
                <a
                  href={`/share/${token}/file/${f.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  <Download size={13} /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
