import type { Metadata } from "next";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareDirs, shareAccessLog, portalUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FIRM } from "@/lib/firm";
import { ShareRecipientPanel } from "@/components/admin/ShareRecipientPanel";
import { ShareUploadStatus } from "@/components/admin/ShareUploadStatus";
import { FolderWorkspaceView } from "@/components/admin/ShareWorkspace";
import { shareCan, rolePhrase, normalizeMeta, folderSupportsWorkspace } from "@/lib/share/types";
import { isBlobConfigured } from "@/lib/blob";
import { getBlocks } from "@/lib/content";
import { portalEmail } from "@/lib/share/portal-session";
import { getSession, isFullAdmin } from "@/lib/auth";
import { ShareAuthGate } from "@/components/admin/ShareAuthGate";
import { ShieldCheck, Clock, Download, Eye } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Secure Share — ${FIRM.name}`, robots: { index: false, follow: false } };

const REISSUE = "max@texaslawsmith.com";
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function Shell({ children, logo }: { children: React.ReactNode; logo?: string }) {
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-6 border-b border-[var(--c-border)] pb-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={FIRM.name} className="mb-2 h-9 w-auto max-w-[240px] object-contain" />
          ) : (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{FIRM.name}</p>
          )}
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

function Closed({ title, body, logo }: { title: string; body: React.ReactNode; logo?: string }) {
  return (
    <Shell logo={logo}>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-[var(--c-ink-muted)]">{body}</p>
    </Shell>
  );
}

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  // An admin can preview exactly what a recipient sees via ?admin=1 — this
  // bypasses the sign-in gate (admins are already authenticated) but never
  // records the recipient's access, so a preview doesn't look like they opened it.
  const wantsPreview = sp.admin != null;
  const adminSession = wantsPreview ? await getSession() : null;
  const adminPreview = wantsPreview && !!adminSession && isFullAdmin(adminSession.role);
  if (!db) return <Closed title="Temporarily unavailable" body="This share can't be opened right now. Please try again shortly." />;

  const logo = (await getBlocks("global").catch(() => ({}) as Record<string, string>))["global.logoDark"] || "";

  const [rec] = await db.select().from(shareRecipients).where(eq(shareRecipients.token, token));
  if (!rec || rec.revoked) {
    return <Closed logo={logo} title="This link is no longer active" body={<>Access to this folder has been closed or the link is invalid. To have it re-issued, contact <a href={`mailto:${REISSUE}`} className="text-[var(--c-accent)]">{REISSUE}</a>.</>} />;
  }
  if (rec.expiresAt && rec.expiresAt < new Date()) {
    return <Closed logo={logo} title="This link has expired" body={<>For security, share links expire after a set period. To have this one re-issued, contact <a href={`mailto:${REISSUE}`} className="text-[var(--c-accent)]">{REISSUE}</a>.</>} />;
  }

  const [folder] = await db.select().from(shareFolders).where(eq(shareFolders.id, rec.folderId));
  if (!folder) return <Closed logo={logo} title="Unavailable" body="This folder is no longer available." />;

  // Sensitive folders — or recipients whose type requires it — must authenticate.
  if ((folder.requireAuth || rec.requireAuth) && !adminPreview) {
    const who = await portalEmail();
    if (!who || who !== rec.email.toLowerCase()) {
      const [pu] = await db.select({ passwordHash: portalUsers.passwordHash }).from(portalUsers).where(eq(portalUsers.email, rec.email.toLowerCase()));
      return (
        <Shell logo={logo}>
          <ShareAuthGate token={token} email={rec.email} hasPassword={!!pu?.passwordHash} />
        </Shell>
      );
    }
  }

  const files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, folder.id));
  const recentCutoff = new Date(Date.now() - 7 * 86_400_000);
  const recentCount = files.filter((f) => f.createdAt >= recentCutoff).length;
  const dirs = (await db.select({ path: shareDirs.path }).from(shareDirs).where(eq(shareDirs.folderId, folder.id))).map((d) => d.path);
  const caps = { download: shareCan(rec.permission, "download"), upload: shareCan(rec.permission, "upload"), delete: shareCan(rec.permission, "delete") };

  if (!adminPreview) {
    try {
      await db.update(shareRecipients).set({ lastAccessAt: new Date() }).where(eq(shareRecipients.id, rec.id));
      await db.insert(shareAccessLog).values({ folderId: folder.id, recipientId: rec.id, action: "view" });
    } catch {
      /* logging is best-effort */
    }
  }

  return (
    <Shell logo={logo}>
      {adminPreview && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Eye size={14} /> Admin preview — this is exactly what <strong>{rec.email}</strong> sees. Their access isn&apos;t recorded, and the sign-in step is skipped for you.
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
        <ShieldCheck size={14} /> Shared securely with {rec.email}
      </div>
      <h1 className="mt-2 text-xl font-semibold">{folder.name}</h1>
      {folder.caseNumber && <p className="mt-0.5 text-sm text-[var(--c-ink-muted)]">Case {folder.caseNumber}</p>}
      {folder.court && <p className="text-sm text-[var(--c-ink-muted)]">{folder.court}</p>}
      <p className="mt-1 text-xs text-[var(--c-ink-muted)]">Shared with you as {rolePhrase(folder.type)} by {FIRM.name}</p>

      {rec.expiresAt && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-xs text-[var(--c-ink-muted)]">
          <Clock size={13} /> Access expires {fmtDate(rec.expiresAt)}. Need more time? Email <a href={`mailto:${REISSUE}`} className="text-[var(--c-accent)]">{REISSUE}</a>.
        </p>
      )}

      {caps.upload && (
        <p className="mt-3 text-xs text-[var(--c-ink-muted)]">You can add documents and create folders here{caps.delete ? ", and remove files or folders you no longer need" : ""}.</p>
      )}

      <ShareUploadStatus token={token} />

      {folderSupportsWorkspace(folder.type) && (
        <FolderWorkspaceView token={token} meta={normalizeMeta(folder.meta)} canCheck={caps.upload} blobReady={isBlobConfigured()} />
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--c-ink)]">{files.length} document{files.length === 1 ? "" : "s"}</p>
        {caps.download && files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {recentCount > 0 && (
              <a href={`/share/${token}/zip?days=7`} title="Everything uploaded in the last 7 days, in one ZIP" className="inline-flex items-center gap-1.5 rounded-md border border-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-[#7a1f2b] hover:bg-[#7a1f2b]/10">
                <Download size={14} /> Download recent uploads ({recentCount})
              </a>
            )}
            <a href={`/share/${token}/zip`} className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
              <Download size={14} /> Download all (ZIP)
            </a>
          </div>
        )}
      </div>

      <div className="mt-3">
        <ShareRecipientPanel
          token={token}
          files={files.map((f) => ({ id: f.id, path: f.filename, sizeBytes: f.sizeBytes }))}
          dirs={dirs}
          caps={caps}
          blobReady={isBlobConfigured()}
        />
      </div>
    </Shell>
  );
}
