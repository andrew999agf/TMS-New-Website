import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles } from "@/db/schema";
import { FIRM } from "@/lib/firm";
import { getBlocks } from "@/lib/content";
import { resolveDirLink, fileInDir, relToDir } from "@/lib/share/dir-link";
import { isVideoFile, isPdfFile } from "@/lib/exhibit-review/media";
import { SharedDirView, type DirFile } from "@/components/site/SharedDirView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Shared Documents — ${FIRM.name}`, robots: { index: false, follow: false } };

function classify(filename: string, contentType: string | null): DirFile["kind"] {
  if (isPdfFile(filename, contentType)) return "pdf";
  if (contentType?.toLowerCase().startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(filename)) return "image";
  if (isVideoFile(filename, contentType)) return "video";
  return "other";
}

function Shell({ children, logo }: { children: React.ReactNode; logo?: string }) {
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-6 border-b border-[var(--c-border)] pb-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={FIRM.name} className="mb-2 h-9 w-auto max-w-[240px] object-contain" />
          ) : (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{FIRM.name}</p>
          )}
          <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">Shared documents</p>
        </div>
        {children}
        <p className="mt-10 border-t border-[var(--c-border)] pt-4 text-[11px] text-[var(--c-ink-muted)]">
          Questions? Contact {FIRM.name} at <a href={`mailto:${FIRM.email}`} className="text-[var(--c-accent)]">{FIRM.email}</a>.
        </p>
      </div>
    </main>
  );
}

export default async function SharedDirPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const logo = db ? (await getBlocks("global").catch(() => ({}) as Record<string, string>))["global.logoDark"] || "" : "";
  if (!db) {
    return (
      <Shell logo={logo}>
        <h1 className="text-lg font-semibold">Temporarily unavailable</h1>
        <p className="mt-2 text-sm text-[var(--c-ink-muted)]">These documents can&apos;t be opened right now. Please try again shortly.</p>
      </Shell>
    );
  }

  const link = await resolveDirLink(token);
  if (!link) {
    return (
      <Shell logo={logo}>
        <h1 className="text-lg font-semibold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-[var(--c-ink-muted)]">
          Access has been closed or the link is invalid. To have it re-issued, contact{" "}
          <a href={`mailto:${FIRM.email}`} className="text-[var(--c-accent)]">{FIRM.email}</a>.
        </p>
      </Shell>
    );
  }

  const rows = (await db.select().from(shareFiles).where(eq(shareFiles.folderId, link.folderId)))
    .filter((f) => fileInDir(f.filename, link.dirPath));
  const files: DirFile[] = rows
    .map((f) => ({
      id: f.id,
      rel: relToDir(f.filename, link.dirPath),
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt.toISOString(),
      kind: classify(f.filename, f.contentType),
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: "base" }));

  const dirName = link.dirPath ? link.dirPath.split("/").pop()! : "";

  return (
    <Shell logo={logo}>
      <h1 className="text-xl font-semibold">{dirName || link.folderName}</h1>
      {dirName && <p className="mt-0.5 text-sm text-[var(--c-ink-muted)]">From {link.folderName}</p>}
      <p className="mt-1 text-xs text-[var(--c-ink-muted)]">
        {files.length} document{files.length === 1 ? "" : "s"} shared by {FIRM.name}
      </p>
      <SharedDirView files={files} fileBase={`/share/d/${token}/file`} zipBase={`/share/d/${token}/zip`} />
    </Shell>
  );
}
