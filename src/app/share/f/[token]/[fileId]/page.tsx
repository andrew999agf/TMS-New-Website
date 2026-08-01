import type { Metadata } from "next";
import { db } from "@/db";
import { shareFiles, shareAccessLog } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { FIRM } from "@/lib/firm";
import { getBlocks } from "@/lib/content";
import { resolvePublicFolder, recipientOfFolder } from "@/lib/share/public-file";
import { portalEmail } from "@/lib/share/portal-session";
import { PublicFileAuthGate } from "@/components/admin/PublicFileAuthGate";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Shared document — ${FIRM.name}`, robots: { index: false, follow: false } };

const IMG = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"]);
const VIDEO = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const AUDIO = new Set(["mp3", "m4a", "wav", "aac", "ogg", "oga"]);
const MIME: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg" };

function Shell({ children, logo }: { children: React.ReactNode; logo?: string }) {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--c-bg)] text-[var(--c-ink)]">
      <div className="border-b border-[var(--c-border)] px-5 py-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={FIRM.name} className="h-8 w-auto max-w-[220px] object-contain" />
        ) : (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{FIRM.name}</p>
        )}
      </div>
      {children}
    </main>
  );
}

export default async function PublicFilePage({ params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const logo = (await getBlocks("global").catch(() => ({}) as Record<string, string>))["global.logoDark"] || "";
  const closed = (msg: string) => (
    <Shell logo={logo}>
      <div className="flex flex-1 items-center justify-center p-10 text-center">
        <p className="text-sm text-[var(--c-ink-muted)]">{msg}</p>
      </div>
    </Shell>
  );

  if (!db) return closed("This document can't be opened right now.");

  const ctx = await resolvePublicFolder(token);
  if (!ctx) return closed("This link is no longer active.");
  const { folder } = ctx;

  // Secure folders: the viewer must sign in (password or one-time code) as an
  // invited recipient. Once signed in, the portal session lasts ~12 hours.
  if (folder.requireAuth) {
    const who = await portalEmail();
    const authed = who ? await recipientOfFolder(folder.id, who) : null;
    if (!authed) {
      return (
        <Shell logo={logo}>
          <div className="flex flex-1 items-start justify-center p-4"><PublicFileAuthGate token={token} /></div>
        </Shell>
      );
    }
  }

  const id = Number(fileId);
  if (!Number.isFinite(id)) return closed("Document not found.");
  const [file] = await db.select().from(shareFiles).where(and(eq(shareFiles.id, id), eq(shareFiles.folderId, folder.id)));
  if (!file) return closed("This document is no longer available.");

  try { await db.insert(shareAccessLog).values({ folderId: folder.id, action: "view", fileId: file.id }); } catch { /* best-effort */ }

  const base = (file.filename.split("/").pop() || file.filename);
  const ext = (base.split(".").pop() || "").toLowerCase();

  return (
    <Shell logo={logo}>
      <div className="flex items-center gap-3 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--c-ink)]">{base}</p>
          <p className="truncate text-xs text-[var(--c-ink-muted)]">{folder.name}</p>
        </div>
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
          <Download size={14} /> Download
        </a>
      </div>

      <div className="min-h-0 flex-1 bg-[var(--c-surface2)]">
        {ext === "pdf" ? (
          <iframe src={file.url} title={base} className="h-[calc(100vh-116px)] w-full border-0" />
        ) : IMG.has(ext) ? (
          <div className="flex h-[calc(100vh-116px)] items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.url} alt={base} className="max-h-full max-w-full object-contain" />
          </div>
        ) : VIDEO.has(ext) ? (
          <div className="flex h-[calc(100vh-116px)] items-center justify-center bg-black p-2">
            <video controls playsInline className="max-h-full max-w-full"><source src={file.url} type={MIME[ext]} /></video>
          </div>
        ) : AUDIO.has(ext) ? (
          <div className="flex h-[calc(100vh-116px)] flex-col items-center justify-center gap-3 p-6">
            <audio controls className="w-full max-w-md"><source src={file.url} type={MIME[ext]} /></audio>
          </div>
        ) : (
          <div className="flex h-[calc(100vh-116px)] flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-[var(--c-ink-muted)]">This file type can&apos;t be previewed in the browser.</p>
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-white"><Download size={14} /> Download to open</a>
          </div>
        )}
      </div>
    </Shell>
  );
}
