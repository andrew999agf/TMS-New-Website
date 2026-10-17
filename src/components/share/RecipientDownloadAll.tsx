"use client";

import { useZipDownloader, ZipButton } from "./ZipDownloader";

/** The recipient page's "Download all (ZIP)": built in their browser from
 *  per-file downloads that resume if cut off — never a half-written ZIP. */
export function RecipientDownloadAll({ token, folderName, files }: { token: string; folderName: string; files: { id: number; name: string; size: number | null }[] }) {
  const zip = useZipDownloader();
  const start = () => zip.start({
    files: files.map((f) => ({ id: f.id, name: f.name, size: f.size, url: `/share/${token}/file/${f.id}?bulk=1` })),
    zipName: `${(folderName || "documents").replace(/[\\/:*?"<>|]/g, "-")}.zip`,
    log: () => { void fetch(`/share/${token}/zip-log`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "all", files: files.length, bytes: files.reduce((n, f) => n + (f.size ?? 0), 0), ids: files.map((f) => f.id) }) }); },
  });
  return (
    <>
      <ZipButton onStart={start} disabled={zip.busy || files.length === 0} label="Download all (ZIP)" className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1f2b] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50" />
      {zip.panel}
    </>
  );
}
