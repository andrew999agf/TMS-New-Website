import "server-only";
import { and, gte, lte, desc, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/db";
import { shareFolders, shareFiles, shareRecipients, shareReports } from "@/db/schema";
import { FIRM, PRINCIPAL_OFFICE } from "@/lib/firm";
import { normalizeMeta, taskDueStatus } from "@/lib/share/types";
import { loadLogoBytes } from "@/lib/billing/report";
import { isBlobConfigured } from "@/lib/blob";
import { REPORT_ARCHIVE_DAYS, type ShareReportKind } from "@/lib/share/reports-config";
import { CT } from "@/lib/ct-time";

/* -------------------------------- data model ------------------------------- */

export type TodoRow = {
  folderId: number;
  folder: string;
  caseNumber: string;
  text: string;
  assignees: string[];
  due?: string;
  uploadDir?: string;
  status: "overdue" | "open" | "done";
  doneBy?: string;
};
export type TodoReportData = {
  generatedAt: string;
  rows: TodoRow[];
  overdue: number;
  open: number;
  done: number;
  folderCount: number;
};

export type DocRow = { folder: string; caseNumber: string; filename: string; by: string; at: string };
export type DocReportData = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  rows: DocRow[];
  count: number;
  folderCount: number;
};

/* ------------------------------ period helpers ----------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** The previous full calendar month in Central Time. */
export function prevMonthPeriod(now: Date): { start: Date; end: Date; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit" }).format(now);
  const [y, m] = parts.split("-").map(Number);
  // First day of this month, then step back into the previous month.
  const firstOfThis = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(firstOfThis.getTime() - 1); // last moment of prev month (approx, UTC)
  const py = end.getUTCFullYear();
  const pm = end.getUTCMonth(); // 0-based
  const start = new Date(Date.UTC(py, pm, 1));
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(start);
  return { start, end: new Date(Date.UTC(py, pm + 1, 1) - 1), label };
}

/* ------------------------------- data builders ----------------------------- */

/** Resolve an uploader email to a display name within a folder. Recipients show
 *  their own name (or email); anyone else — firm staff — shows as "admin". */
function makeResolver(recips: { folderId: number; email: string; name: string }[]) {
  const byFolder = new Map<number, Map<string, string>>();
  for (const r of recips) {
    if (!byFolder.has(r.folderId)) byFolder.set(r.folderId, new Map());
    byFolder.get(r.folderId)!.set(r.email.toLowerCase(), r.name?.trim() || r.email);
  }
  return (folderId: number, email?: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return "—";
    return byFolder.get(folderId)?.get(e) ?? "admin";
  };
}

/** A snapshot of every open (and recently-completed) to-do across active folders. */
export async function buildTodoReport(now: Date = new Date()): Promise<TodoReportData> {
  const data: TodoReportData = { generatedAt: now.toISOString(), rows: [], overdue: 0, open: 0, done: 0, folderCount: 0 };
  if (!db) return data;
  const folders = await db.select().from(shareFolders).where(eq(shareFolders.archived, false));
  const seen = new Set<number>();
  for (const f of folders) {
    const meta = normalizeMeta(f.meta);
    const todos = (meta.todos ?? []).filter((t) => !t.archived);
    if (todos.length === 0) continue;
    seen.add(f.id);
    for (const t of todos) {
      const done = !!t.doneBy;
      const status: TodoRow["status"] = done ? "done" : taskDueStatus(t.due, t.dueSet, now.getTime()) === "overdue" ? "overdue" : "open";
      if (status === "overdue") data.overdue += 1;
      else if (status === "open") data.open += 1;
      else data.done += 1;
      data.rows.push({ folderId: f.id, folder: f.name, caseNumber: f.caseNumber, text: t.text, assignees: t.assignees ?? [], due: t.due, uploadDir: t.uploadDir, status, doneBy: t.doneBy });
    }
  }
  data.folderCount = seen.size;
  // Overdue first, then open, then done; within a group by soonest due date.
  const rank = { overdue: 0, open: 1, done: 2 } as const;
  data.rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.folder.localeCompare(b.folder));
  return data;
}

/** Every document uploaded into a share folder during the period. */
export async function buildDocumentReport(now: Date = new Date()): Promise<DocReportData> {
  const { start, end, label } = prevMonthPeriod(now);
  const data: DocReportData = { periodStart: start.toISOString(), periodEnd: end.toISOString(), periodLabel: label, rows: [], count: 0, folderCount: 0 };
  if (!db) return data;
  const files = await db.select().from(shareFiles).where(and(gte(shareFiles.createdAt, start), lte(shareFiles.createdAt, end))).orderBy(desc(shareFiles.createdAt));
  if (files.length === 0) return data;
  const folders = await db.select({ id: shareFolders.id, name: shareFolders.name, caseNumber: shareFolders.caseNumber }).from(shareFolders);
  const fmap = new Map(folders.map((f) => [f.id, f]));
  const recips = await db.select({ folderId: shareRecipients.folderId, email: shareRecipients.email, name: shareRecipients.name }).from(shareRecipients);
  const who = makeResolver(recips);
  const folderSet = new Set<number>();
  for (const f of files) {
    const fo = fmap.get(f.folderId);
    folderSet.add(f.folderId);
    data.rows.push({
      folder: fo?.name ?? `Folder #${f.folderId}`,
      caseNumber: fo?.caseNumber ?? "",
      filename: (f.filename.split("/").pop() as string) || f.filename,
      by: who(f.folderId, f.uploadedBy),
      at: f.createdAt.toISOString(),
    });
  }
  data.count = files.length;
  data.folderCount = folderSet.size;
  return data;
}

/* ------------------------------ PDF rendering ------------------------------ */

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;
const MAROON = rgb(0.478, 0.122, 0.169);
const INK = rgb(0.09, 0.09, 0.09);
const GRAY = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.8, 0.8, 0.8);
const RED = rgb(0.7, 0.15, 0.15);
const AMBER = rgb(0.7, 0.45, 0.05);

function safe(s: string): string {
  return s.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}
function truncate(text: string, maxW: number, size: number, font: PDFFont): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t + "…";
}
const fmtDue = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const fmtAt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtStamp = (d: Date) => `${new Intl.DateTimeFormat("en-US", { timeZone: CT, dateStyle: "long", timeStyle: "short" }).format(d)} CT`;

/** A clear "June 1 – 30, 2026" style range from two UTC month-boundary dates. */
function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso);
  const opt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o });
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `${opt({ month: "long", day: "numeric" }).format(s)} – ${opt({ day: "numeric", year: "numeric" }).format(e)}`;
  }
  return `${opt({ month: "long", day: "numeric", year: "numeric" }).format(s)} – ${opt({ month: "long", day: "numeric", year: "numeric" }).format(e)}`;
}

/** Add an (invisible) clickable link over a rectangle. */
function addLink(doc: PDFDocument, page: PDFPage, x: number, yBottom: number, w: number, h: number, url: string) {
  const annot = doc.context.obj({
    Type: "Annot", Subtype: "Link",
    Rect: [x, yBottom, x + w, yBottom + h],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  const ref = doc.context.register(annot);
  const annots = page.node.Annots();
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

/** Footer on every page: firm name, generated timestamp, and "Page X of Y". */
function drawFooters(doc: PDFDocument, font: PDFFont, generatedAt: Date) {
  const pages = doc.getPages();
  const total = pages.length;
  const gen = `Generated ${fmtStamp(generatedAt)}`;
  pages.forEach((pg, i) => {
    const y = 34;
    pg.drawLine({ start: { x: MARGIN, y: y + 12 }, end: { x: RIGHT, y: y + 12 }, thickness: 0.5, color: RULE });
    pg.drawText(FIRM.name, { x: MARGIN, y, size: 7.5, font, color: GRAY });
    const gw = font.widthOfTextAtSize(gen, 7.5);
    pg.drawText(gen, { x: (PAGE_W - gw) / 2, y, size: 7.5, font, color: GRAY });
    const pageStr = `Page ${i + 1} of ${total}`;
    const pw = font.widthOfTextAtSize(pageStr, 7.5);
    pg.drawText(pageStr, { x: RIGHT - pw, y, size: 7.5, font, color: GRAY });
  });
}

/** Letterhead: centered logo (or firm name), office line, maroon rule, title,
 *  and a prominent, clearly-labeled reporting period. */
async function letterhead(doc: PDFDocument, page: PDFPage, font: PDFFont, bold: PDFFont, logo: { bytes: Uint8Array; type: "png" | "jpg" } | null, title: string, periodLabel: string, yStart: number): Promise<number> {
  let y = yStart;
  let img: PDFImage | null = null;
  if (logo) { try { img = logo.type === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes); } catch { img = null; } }
  if (img) {
    const scale = Math.min(200 / img.width, 78 / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    y -= h;
    page.drawImage(img, { x: (PAGE_W - w) / 2, y, width: w, height: h });
    y -= 15;
  } else {
    y -= 22;
    const w = bold.widthOfTextAtSize(FIRM.name, 19);
    page.drawText(FIRM.name, { x: (PAGE_W - w) / 2, y, size: 19, font: bold, color: MAROON });
    y -= 18;
  }
  const officeLine = `${PRINCIPAL_OFFICE.city} · Fort Worth · Weatherford, Texas`;
  const olW = font.widthOfTextAtSize(officeLine, 9);
  page.drawText(officeLine, { x: (PAGE_W - olW) / 2, y, size: 9, font, color: GRAY });
  y -= 13;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 1.4, color: MAROON });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.4, color: MAROON });
  y -= 26;

  page.drawText(title, { x: MARGIN, y, size: 17, font: bold, color: INK });
  y -= 20;
  const label = "REPORTING PERIOD";
  page.drawText(label, { x: MARGIN, y, size: 8, font: bold, color: MAROON });
  const lw = bold.widthOfTextAtSize(label, 8);
  page.drawText(periodLabel, { x: MARGIN + lw + 8, y: y - 0.5, size: 11, font: bold, color: INK });
  y -= 22;
  return y;
}

export async function renderTodoReportPdf(data: TodoReportData, logo: { bytes: Uint8Array; type: "png" | "jpg" } | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const genAt = new Date(data.generatedAt);
  const period = `Current open items as of ${fmtStamp(genAt).replace(/ at .*$/, "")}`;
  let y = await letterhead(doc, page, font, bold, logo, "Share Folder — To-Do & Tickler Report", period, PAGE_H - MARGIN);

  page.drawText(`${data.overdue} overdue  ·  ${data.open} open  ·  ${data.done} completed  ·  across ${data.folderCount} folder${data.folderCount === 1 ? "" : "s"}`, { x: MARGIN, y, size: 10, font, color: GRAY });
  y -= 22;

  const drawHeader = () => {
    page.drawText("Task / Folder", { x: MARGIN, y, size: 10, font: bold, color: GRAY });
    page.drawText("Assigned", { x: MARGIN + 250, y, size: 10, font: bold, color: GRAY });
    page.drawText("Due", { x: MARGIN + 380, y, size: 10, font: bold, color: GRAY });
    page.drawText("Status", { x: MARGIN + 460, y, size: 10, font: bold, color: GRAY });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.75, color: RULE });
    y -= 15;
  };
  drawHeader();

  if (data.rows.length === 0) {
    page.drawText("No open tasks. Everything is clear.", { x: MARGIN, y, size: 10, font, color: GRAY });
  }

  for (const r of data.rows) {
    if (y < MARGIN + 54) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; drawHeader(); }
    const statusColor = r.status === "overdue" ? RED : r.status === "done" ? GRAY : AMBER;
    const statusText = r.status === "overdue" ? "OVERDUE" : r.status === "done" ? "done" : "open";
    page.drawText(truncate(safe(r.text), 240, 10, font), { x: MARGIN, y, size: 10, font, color: r.status === "done" ? GRAY : INK });
    page.drawText(truncate(safe(`${r.folder}${r.caseNumber ? ` · ${r.caseNumber}` : ""}`), 240, 8, font), { x: MARGIN, y: y - 10, size: 8, font, color: GRAY });
    page.drawText(truncate(safe(r.assignees.join(", ") || "—"), 120, 9, font), { x: MARGIN + 250, y, size: 9, font, color: INK });
    page.drawText(r.due ? fmtDue(r.due) : "—", { x: MARGIN + 380, y, size: 9, font, color: r.status === "overdue" ? RED : INK });
    page.drawText(statusText, { x: MARGIN + 460, y, size: 9, font: bold, color: statusColor });
    // Clicking the task name opens the folder (invisible link over the two-line cell).
    addLink(doc, page, MARGIN, y - 12, 244, 22, `${BASE}/admin/share-folders/${r.folderId}`);
    y -= 24;
  }

  drawFooters(doc, font, genAt);
  return Buffer.from(await doc.save());
}

export async function renderDocumentReportPdf(data: DocReportData, logo: { bytes: Uint8Array; type: "png" | "jpg" } | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const genAt = new Date();
  let y = await letterhead(doc, page, font, bold, logo, "Share Folder — Documents Uploaded", fmtRange(data.periodStart, data.periodEnd), PAGE_H - MARGIN);

  page.drawText(`${data.count} document${data.count === 1 ? "" : "s"} uploaded across ${data.folderCount} folder${data.folderCount === 1 ? "" : "s"}`, { x: MARGIN, y, size: 10, font, color: GRAY });
  y -= 22;

  const drawHeader = () => {
    page.drawText("Document / Folder", { x: MARGIN, y, size: 10, font: bold, color: GRAY });
    page.drawText("Uploaded by", { x: MARGIN + 300, y, size: 10, font: bold, color: GRAY });
    page.drawText("Date", { x: MARGIN + 440, y, size: 10, font: bold, color: GRAY });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.75, color: RULE });
    y -= 15;
  };
  drawHeader();

  if (data.rows.length === 0) {
    page.drawText("No documents were uploaded in this period.", { x: MARGIN, y, size: 10, font, color: GRAY });
  }

  for (const r of data.rows) {
    if (y < MARGIN + 54) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; drawHeader(); }
    page.drawText(truncate(safe(r.filename), 290, 10, font), { x: MARGIN, y, size: 10, font, color: INK });
    page.drawText(truncate(safe(`${r.folder}${r.caseNumber ? ` · ${r.caseNumber}` : ""}`), 290, 8, font), { x: MARGIN, y: y - 10, size: 8, font, color: GRAY });
    page.drawText(truncate(safe(r.by), 130, 9, font), { x: MARGIN + 300, y, size: 9, font, color: INK });
    page.drawText(fmtAt(r.at), { x: MARGIN + 440, y, size: 9, font, color: INK });
    y -= 24;
  }

  drawFooters(doc, font, genAt);
  return Buffer.from(await doc.save());
}

/* ------------------------------ email template ----------------------------- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportEmailHtml(opts: { todo?: TodoReportData; docs?: DocReportData; reportsUrl: string; isTest?: boolean }): string {
  const { todo, docs, reportsUrl, isTest } = opts;
  const rows: string[] = [];
  if (todo) {
    rows.push(`<tr><td style="padding:10px 0;border-bottom:1px solid #eee">
      <p style="margin:0 0 4px;font-weight:bold;color:#1a1a1a">To-do items &amp; ticklers</p>
      <p style="margin:0;color:#555;font-size:13px">${todo.overdue} overdue · ${todo.open} open · ${todo.done} completed, across ${todo.folderCount} folder${todo.folderCount === 1 ? "" : "s"}. See the attached PDF.</p>
    </td></tr>`);
  }
  if (docs) {
    rows.push(`<tr><td style="padding:10px 0;border-bottom:1px solid #eee">
      <p style="margin:0 0 4px;font-weight:bold;color:#1a1a1a">Documents uploaded — ${esc(docs.periodLabel)}</p>
      <p style="margin:0;color:#555;font-size:13px">${docs.count} document${docs.count === 1 ? "" : "s"} across ${docs.folderCount} folder${docs.folderCount === 1 ? "" : "s"}. See the attached PDF.</p>
    </td></tr>`);
  }
  return `<div style="margin:0;background:#f4f2ee;padding:24px 0;font-family:Georgia,'Times New Roman',serif">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e1d8">
      <div style="background:#7a1f2b;height:6px"></div>
      <div style="padding:28px 32px 24px">
        ${isTest ? `<p style="margin:0 0 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7a1f2b">Test report</p>` : ""}
        <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#1a1a1a">Your share-folder review</p>
        <p style="margin:0 0 18px;color:#555;font-size:14px;line-height:1.5">Here is your periodic review of the drop folders and to-do tasks in the secure document portal. The full details are attached as PDF report${rows.length > 1 ? "s" : ""}.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">${rows.join("")}</table>
        <p style="margin:0 0 4px"><a href="${reportsUrl}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open the reports area</a></p>
        <p style="margin:14px 0 0;color:#888;font-size:12px">You can browse, download, and archive past reports in the admin panel. Reports auto-archive after six months.</p>
      </div>
      <div style="border-top:1px solid #eee;padding:14px 32px;color:#9a9a9a;font-size:11px">${esc(FIRM.name)} · Automated share-folder report</div>
    </div>
  </div>`;
}

export { loadLogoBytes };

/* --------------------------- generate + persist --------------------------- */

export type GeneratedReport = {
  kind: ShareReportKind;
  title: string;
  pdf: Buffer;
  filename: string;
  todo?: TodoReportData;
  docs?: DocReportData;
  id?: number;
  pdfUrl?: string;
};

/** Build a report, render its PDF, store the PDF in Blob (best-effort), and
 *  record a row. Returns everything the caller needs to also email it. */
export async function generateAndStoreReport(kind: ShareReportKind, createdBy: string, now: Date = new Date()): Promise<GeneratedReport> {
  const logo = await loadLogoBytes();
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let out: GeneratedReport;
  if (kind === "documents") {
    const docs = await buildDocumentReport(now);
    const pdf = await renderDocumentReportPdf(docs, logo);
    out = { kind, title: `Documents uploaded — ${docs.periodLabel}`, pdf, filename: `Documents Report — ${docs.periodLabel}.pdf`, docs };
  } else {
    const todo = await buildTodoReport(now);
    out = { kind, title: `To-do report — ${stamp}`, pdf: await renderTodoReportPdf(todo, logo), filename: `To-Do Report — ${stamp}.pdf`, todo };
  }

  let pdfUrl: string | undefined;
  let pdfPathname: string | undefined;
  if (isBlobConfigured()) {
    try {
      const blob = await put(`share-reports/${kind}-${stamp}-${Date.now()}.pdf`, out.pdf, { access: "public", contentType: "application/pdf", addRandomSuffix: true });
      pdfUrl = blob.url;
      pdfPathname = blob.pathname;
    } catch { /* keep the row without a stored PDF */ }
  }

  const summary = kind === "documents"
    ? { count: out.docs?.count ?? 0, folderCount: out.docs?.folderCount ?? 0, periodLabel: out.docs?.periodLabel }
    : { overdue: out.todo?.overdue ?? 0, open: out.todo?.open ?? 0, done: out.todo?.done ?? 0, folderCount: out.todo?.folderCount ?? 0 };

  if (db) {
    try {
      const [row] = await db.insert(shareReports).values({
        kind, title: out.title,
        periodStart: out.docs ? new Date(out.docs.periodStart) : null,
        periodEnd: out.docs ? new Date(out.docs.periodEnd) : null,
        pdfUrl: pdfUrl ?? null, pdfPathname: pdfPathname ?? null,
        summary, createdBy,
      }).returning({ id: shareReports.id });
      out.id = row.id;
    } catch { /* non-fatal */ }
  }
  out.pdfUrl = pdfUrl;
  return out;
}

/** Archive reports older than the retention window. Returns how many changed. */
export async function autoArchiveOldReports(now: Date = new Date()): Promise<number> {
  if (!db) return 0;
  const cutoff = new Date(now.getTime() - REPORT_ARCHIVE_DAYS * 86_400_000);
  try {
    const stale = await db.select({ id: shareReports.id }).from(shareReports).where(and(eq(shareReports.archived, false), lte(shareReports.createdAt, cutoff)));
    if (stale.length === 0) return 0;
    await db.update(shareReports).set({ archived: true, archivedAt: now }).where(and(eq(shareReports.archived, false), lte(shareReports.createdAt, cutoff)));
    return stale.length;
  } catch {
    return 0;
  }
}
