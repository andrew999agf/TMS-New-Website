import "server-only";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, type PDFFont, type PDFPage } from "pdf-lib";

export type LinkTreeFile = { filename: string; url: string; contentType: string | null };

const MAROON = rgb(0.478, 0.122, 0.169);
const INK = rgb(0.12, 0.12, 0.12);
const GRAY = rgb(0.42, 0.42, 0.42);
const WHITE = rgb(1, 1, 1);
const RULE = rgb(0.75, 0.75, 0.75);

const baseName = (p: string) => p.split("/").pop() || p;
const clean = (s: string) => s.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
function fit(text: string, maxW: number, size: number, font: PDFFont): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t + "…";
}

function addLink(doc: PDFDocument, page: PDFPage, x: number, y: number, w: number, h: number, url: string) {
  try {
    const annot = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(url) } });
    const ref = doc.context.register(annot);
    const annots = page.node.Annots();
    if (annots) annots.push(ref); else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
  } catch { /* stamping a link is best-effort */ }
}

/** Stamp a bottom-of-page citation footer: file name, page-in-file, and the
 *  clickable link to that document — like a Bates stamp. */
function stampFooter(doc: PDFDocument, page: PDFPage, font: PDFFont, name: string, pageInFile: number, fileTotal: number, url: string) {
  const w = page.getWidth();
  const M = 24;
  // A white bar so the stamp stays legible over page content.
  page.drawRectangle({ x: 0, y: 0, width: w, height: 30, color: WHITE });
  page.drawLine({ start: { x: M, y: 30 }, end: { x: w - M, y: 30 }, thickness: 0.5, color: RULE });
  const label = `${clean(baseName(name))}  ·  p. ${pageInFile} of ${fileTotal}`;
  page.drawText(fit(label, w - 2 * M, 7.5, font), { x: M, y: 18, size: 7.5, font, color: INK });
  const link = clean(url);
  const linkText = fit(link, w - 2 * M, 6.5, font);
  page.drawText(linkText, { x: M, y: 7, size: 6.5, font, color: MAROON });
  addLink(doc, page, M, 4, font.widthOfTextAtSize(linkText, 6.5), 12, url);
}

/** Build combined, footer-stamped PDF part(s) from a folder's documents.
 *  PDFs are merged page-by-page; images become one page; other types get a
 *  placeholder page with the link. Parts are split at `cap` pages. */
export async function buildLinkTreePdfs(files: LinkTreeFile[], cap: number): Promise<Buffer[]> {
  const parts: Buffer[] = [];
  let part = await PDFDocument.create();
  let font = await part.embedFont(StandardFonts.Helvetica);
  let count = 0;

  const rollIfFull = async () => {
    if (count >= cap) { parts.push(Buffer.from(await part.save())); part = await PDFDocument.create(); font = await part.embedFont(StandardFonts.Helvetica); count = 0; }
  };

  const placeholder = async (name: string, url: string, note: string) => {
    const pg = part.addPage([612, 792]);
    const bold = await part.embedFont(StandardFonts.HelveticaBold);
    pg.drawText(clean(baseName(name)), { x: 54, y: 700, size: 16, font: bold, color: INK });
    pg.drawText(note, { x: 54, y: 672, size: 11, font, color: GRAY });
    stampFooter(part, pg, font, name, 1, 1, url);
    count++;
    await rollIfFull();
  };

  for (const f of files) {
    const name = f.filename;
    let bytes: Uint8Array | null = null;
    try { const res = await fetch(f.url); if (res.ok) bytes = new Uint8Array(await res.arrayBuffer()); } catch { bytes = null; }
    if (!bytes) { await placeholder(name, f.url, "This document could not be loaded. Open it via the link below."); continue; }

    const ext = (baseName(name).split(".").pop() || "").toLowerCase();
    const isPdf = ext === "pdf" || (f.contentType ?? "").includes("pdf");
    const isJpg = ext === "jpg" || ext === "jpeg" || (f.contentType ?? "").includes("jpeg");
    const isPng = ext === "png" || (f.contentType ?? "").includes("png");

    if (isPdf) {
      try {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const total = src.getPageCount();
        for (let i = 0; i < total; i++) {
          const [pg] = await part.copyPages(src, [i]);
          part.addPage(pg);
          stampFooter(part, pg, font, name, i + 1, total, f.url);
          count++;
          await rollIfFull();
        }
      } catch {
        await placeholder(name, f.url, "This PDF couldn't be merged (it may be secured). Open it via the link below.");
      }
    } else if (isJpg || isPng) {
      try {
        const img = isPng ? await part.embedPng(bytes) : await part.embedJpg(bytes);
        const maxW = 612 - 100, maxH = 792 - 130;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const pg = part.addPage([612, 792]);
        pg.drawImage(img, { x: (612 - img.width * scale) / 2, y: 792 - 50 - img.height * scale, width: img.width * scale, height: img.height * scale });
        stampFooter(part, pg, font, name, 1, 1, f.url);
        count++;
        await rollIfFull();
      } catch {
        await placeholder(name, f.url, "This image couldn't be embedded. Open it via the link below.");
      }
    } else {
      await placeholder(name, f.url, "This file type isn't a PDF or image. Open it via the link below.");
    }
  }

  if (count > 0 || parts.length === 0) parts.push(Buffer.from(await part.save()));
  return parts;
}
