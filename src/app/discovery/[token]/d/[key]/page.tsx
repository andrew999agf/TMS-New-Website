import Link from "next/link";
import type { Metadata } from "next";
import { List } from "lucide-react";
import { getSharedDiscoveryCase, resolveSharedFile } from "@/lib/discovery/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string; key: string }> }): Promise<Metadata> {
  const { token, key } = await params;
  const f = await resolveSharedFile(token, key);
  return { title: f ? f.name : "Document", robots: { index: false, follow: false } };
}

/**
 * One shared document in the browser's native PDF viewer — selectable text,
 * zoom, and its own page navigation; `#page=N` in the URL opens page N.
 * Documents only: internal notes and labels never render here.
 */
export default async function SharedDiscoveryDoc({ params }: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await params;
  const [f, c] = await Promise.all([resolveSharedFile(token, key), getSharedDiscoveryCase(token)]);
  if (!f || !c) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--c-ink)]">This link isn&apos;t available</h1>
        <p className="mt-3 text-sm text-[var(--c-ink-muted)]">The document share link is turned off or no longer exists.</p>
      </main>
    );
  }
  const isPdf = (f.contentType ?? "").includes("pdf") || /\.pdf$/i.test(f.pathname ?? f.name);
  const isImage = /^image\//.test(f.contentType ?? "") || /\.(jpe?g|png)$/i.test(f.pathname ?? f.name);
  return (
    <main className="flex h-screen flex-col bg-[var(--c-bg)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5">
        <Link href={`/discovery/${token}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
          <List size={14} /> All documents
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--c-ink)]">{f.name}</span>
        <span className="truncate text-xs text-[var(--c-ink-muted)]">{c.name}</span>
      </header>
      {isPdf ? (
        <PdfFrame token={token} docKey={key} />
      ) : isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4"><img src={`/discovery/${token}/file/${key}`} alt={f.name} className="max-w-full" /></div>
      ) : (
        <p className="p-10 text-center text-sm text-[var(--c-ink-muted)]">
          No preview for this file type — <a href={`/discovery/${token}/file/${key}`} className="text-[var(--c-accent)] underline">download it</a>.
        </p>
      )}
    </main>
  );
}

/** The iframe keeps the browser viewer; the page fragment (#page=N) must ride
 *  on the iframe src, which a server component can't read — a tiny inline
 *  script forwards it once at load. */
function PdfFrame({ token, docKey }: { token: string; docKey: string }) {
  const src = `/discovery/${token}/file/${docKey}`;
  return (
    <>
      <iframe id="doc-frame" src={src} title="Document" className="min-h-0 w-full flex-1 border-0 bg-white" />
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var h=window.location.hash;if(/^#page=\\d+$/.test(h)){var f=document.getElementById("doc-frame");if(f)f.src=${JSON.stringify(src)}+h;}})();`,
        }}
      />
    </>
  );
}
