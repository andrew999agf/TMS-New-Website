import "server-only";
import { and, gte, lte } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/db";
import { admins, timeEntries, timeActivityUsers } from "@/db/schema";
import { getSetting, getBlocks } from "@/lib/content";
import { FIRM, PRINCIPAL_OFFICE } from "@/lib/firm";
import { CT } from "@/lib/ct-time";

/**
 * Monthly billing report — the shared engine behind the month-end reminder cron
 * and the "send test" button.
 *
 * A person's monthly work is measured across the WHOLE month (both active AND
 * archived time entries), because some staff export/archive their entries during
 * the month and would otherwise look like they did nothing. Reminders go only to
 * people who actually logged billable hours. The attached PDF is a letterhead
 * summary of the cases they worked and the hours on each (billable / non-billable
 * / total) — deliberately WITHOUT any dollar figures.
 */

export type MatterLine = { matter: string; billable: number; nonBillable: number; total: number };
/** One person's monthly work — keyed by the ACTIVITY USER (who did the work),
 *  not the login that typed it in. `email` is where their report is sent. */
export type PersonReport = {
  name: string;
  email: string;
  matters: MatterLine[];
  billable: number;
  nonBillable: number;
  total: number;
};
export type MonthInfo = { y: number; m: number; monthLabel: string; firstIso: string; lastIso: string; lastDay: number };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const pad = (n: number) => String(n).padStart(2, "0");
const MAROON = rgb(0.478, 0.122, 0.169); // #7a1f2b — the firm accent
const INK = rgb(0.09, 0.09, 0.09);
const GRAY = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.8, 0.8, 0.8);

/** The Central-Time calendar month that contains `now`. */
export function ctMonthInfo(now: Date): MonthInfo {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m] = parts.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: CT, month: "long", year: "numeric" }).format(now);
  return { y, m, monthLabel, firstIso: `${y}-${pad(m)}-01`, lastIso: `${y}-${pad(m)}-${pad(lastDay)}`, lastDay };
}

/** The current Central-Time hour (0–23) — used to pin the cron to 4 PM year-round. */
export function ctHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "2-digit", hour12: false }).format(now)) % 24;
}

function accumulate(entries: { user: string; matter: string; quantity: number; nonBillable: boolean }[], resolveEmail: (user: string) => string): PersonReport[] {
  const byUser = new Map<string, Map<string, MatterLine>>();
  for (const e of entries) {
    const userKey = (e.user || "").trim() || "(no activity user)";
    const matterKey = (e.matter || "").trim() || "(no matter specified)";
    const matters = byUser.get(userKey) ?? new Map<string, MatterLine>();
    const line = matters.get(matterKey) ?? { matter: matterKey, billable: 0, nonBillable: 0, total: 0 };
    if (e.nonBillable) line.nonBillable += e.quantity;
    else line.billable += e.quantity;
    line.total += e.quantity;
    matters.set(matterKey, line);
    byUser.set(userKey, matters);
  }
  const reports: PersonReport[] = [];
  for (const [user, matters] of byUser) {
    const lines = [...matters.values()].sort((a, b) => b.total - a.total);
    const billable = lines.reduce((n, l) => n + l.billable, 0);
    const nonBillable = lines.reduce((n, l) => n + l.nonBillable, 0);
    const total = lines.reduce((n, l) => n + l.total, 0);
    reports.push({ name: user, email: resolveEmail(user), matters: lines, billable, nonBillable, total });
  }
  return reports.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every person's monthly report (by activity user), filtered to those with
 *  billable hours. Spans active AND archived entries for the month. */
export async function buildMonthReports(now: Date): Promise<{ month: MonthInfo; people: PersonReport[] }> {
  const month = ctMonthInfo(now);
  if (!db) return { month, people: [] };
  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(gte(timeEntries.entryDate, month.firstIso), lte(timeEntries.entryDate, month.lastIso)));
  // Resolve each activity user's email: the address set on the activity user
  // wins; otherwise fall back to an admin whose name matches.
  const activityUsers = await db.select({ name: timeActivityUsers.name, email: timeActivityUsers.email }).from(timeActivityUsers);
  const staff = await db.select({ name: admins.name, email: admins.email }).from(admins);
  const auMap = new Map(activityUsers.map((u) => [norm(u.name), (u.email || "").trim()]));
  const adminMap = new Map(staff.map((a) => [norm(a.name), (a.email || "").trim()]));
  const resolveEmail = (user: string) => auMap.get(norm(user)) || adminMap.get(norm(user)) || "";
  const all = accumulate(rows.map((r) => ({ user: r.activityUserName, matter: r.matter, quantity: r.quantity, nonBillable: r.nonBillable })), resolveEmail);
  return { month, people: all.filter((p) => p.billable > 0) };
}

/* ------------------------------ logo (letterhead) ------------------------------ */

async function loadLogoBytes(): Promise<{ bytes: Uint8Array; type: "png" | "jpg" } | null> {
  try {
    let url = await getSetting<string>("logo", "");
    if (!url) {
      const g = await getBlocks("global");
      url = g["global.logoDark"] || g["global.logoLight"] || "";
    }
    if (!url) return null;
    let bytes: Uint8Array;
    if (url.startsWith("data:")) {
      const m = /^data:(image\/[\w.+-]+);base64,(.*)$/i.exec(url);
      if (!m) return null;
      bytes = new Uint8Array(Buffer.from(m[2], "base64"));
    } else {
      const res = await fetch(url);
      if (!res.ok) return null;
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, type: "png" }; // PNG magic
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, type: "jpg" }; // JPEG magic
    return null; // SVG / unsupported — fall back to text letterhead
  } catch {
    return null;
  }
}

/* ------------------------------ PDF rendering ------------------------------ */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN; // 558
// right-edge x positions of the numeric columns
const COL_TOTAL = RIGHT;
const COL_NONBILL = RIGHT - 90;
const COL_BILL = RIGHT - 180;
const MATTER_MAX = COL_BILL - 90 - MARGIN; // matter column text width

/** Standard PDF fonts only encode WinAnsi — normalize smart punctuation and drop
 *  anything outside Latin-1 so a stray character in a matter name can't throw. */
function safe(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function rightText(page: PDFPage, text: string, rightX: number, y: number, size: number, font: PDFFont, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function truncate(text: string, maxW: number, size: number, font: PDFFont): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** Render the letterhead time-summary PDF for one person. No dollar figures. */
export async function renderTimeSummaryPdf(report: PersonReport, month: MonthInfo, logo: { bytes: Uint8Array; type: "png" | "jpg" } | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let img: PDFImage | null = null;
  if (logo) {
    try {
      img = logo.type === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    } catch {
      img = null;
    }
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  /* Letterhead: centered logo (or firm name), firm line, rule. */
  if (img) {
    const maxW = 190;
    const maxH = 74;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    y -= h;
    page.drawImage(img, { x: (PAGE_W - w) / 2, y, width: w, height: h });
    y -= 16;
  } else {
    y -= 20;
    const name = FIRM.name;
    const w = bold.widthOfTextAtSize(name, 18);
    page.drawText(name, { x: (PAGE_W - w) / 2, y, size: 18, font: bold, color: MAROON });
    y -= 18;
  }
  const officeLine = `${PRINCIPAL_OFFICE.city} · Fort Worth · Weatherford, Texas`;
  const olW = font.widthOfTextAtSize(officeLine, 9);
  page.drawText(officeLine, { x: (PAGE_W - olW) / 2, y, size: 9, font, color: GRAY });
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 1.2, color: MAROON });
  y -= 26;

  /* Title block */
  page.drawText("Monthly Time Summary", { x: MARGIN, y, size: 16, font: bold, color: INK });
  y -= 18;
  page.drawText(`${safe(report.name)}  ·  ${month.monthLabel}`, { x: MARGIN, y, size: 11, font, color: GRAY });
  y -= 28;

  /* Table header */
  const drawHeader = () => {
    page.drawText("Case / Matter", { x: MARGIN, y, size: 10, font: bold, color: GRAY });
    rightText(page, "Billable", COL_BILL, y, 10, bold, GRAY);
    rightText(page, "Non-billable", COL_NONBILL, y, 10, bold, GRAY);
    rightText(page, "Total", COL_TOTAL, y, 10, bold, GRAY);
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.75, color: RULE });
    y -= 16;
  };
  drawHeader();

  /* Rows (with pagination) */
  for (const line of report.matters) {
    if (y < MARGIN + 70) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader();
    }
    page.drawText(truncate(safe(line.matter), MATTER_MAX, 10, font), { x: MARGIN, y, size: 10, font, color: INK });
    rightText(page, line.billable.toFixed(2), COL_BILL, y, 10, font);
    rightText(page, line.nonBillable.toFixed(2), COL_NONBILL, y, 10, font);
    rightText(page, line.total.toFixed(2), COL_TOTAL, y, 10, font);
    y -= 16;
  }

  /* Totals */
  y -= 2;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 1, color: MAROON });
  y -= 16;
  page.drawText("Total", { x: MARGIN, y, size: 10, font: bold, color: INK });
  rightText(page, report.billable.toFixed(2), COL_BILL, y, 10, bold);
  rightText(page, report.nonBillable.toFixed(2), COL_NONBILL, y, 10, bold);
  rightText(page, report.total.toFixed(2), COL_TOTAL, y, 10, bold, MAROON);
  y -= 30;

  page.drawText("Hours summary for internal billing preparation. Please submit your billing to the billing department.", {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: GRAY,
  });

  return Buffer.from(await doc.save());
}

/* ------------------------------ email templates ------------------------------ */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function shell(inner: string): string {
  return `<div style="margin:0;background:#f4f2ee;padding:24px 0;font-family:Georgia,'Times New Roman',serif">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e6e1d8">
      <div style="background:#7a1f2b;height:6px"></div>
      <div style="padding:28px 32px 24px">${inner}</div>
      <div style="border-top:1px solid #eee;padding:14px 32px;color:#9a9a9a;font-size:11px">
        T. Maxwell Smith, PLLC · Automated billing reminder
      </div>
    </div>
  </div>`;
}

/** The personal reminder to a staffer with billable hours (PDF attached). */
export function reminderEmailHtml(report: PersonReport, month: MonthInfo, deptRecipients: string[], isTest = false): string {
  const dept = deptRecipients.length ? deptRecipients.join(", ") : "the billing department";
  const inner = `
    ${isTest ? `<p style="margin:0 0 14px;display:inline-block;background:#fdeaea;color:#7a1f2b;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px">TEST — this is a preview</p>` : ""}
    <h1 style="margin:0 0 4px;font-size:20px;color:#161616">Your ${esc(month.monthLabel)} billing</h1>
    <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.55">Hi ${esc(report.name.split(" ")[0] || report.name)}, it&apos;s the last day of the month. Here&apos;s your time this month — please finalize your billing and send it to ${esc(dept)} so this month&apos;s invoices go out on time.</p>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;margin:0 0 8px">
      <tr>
        <td style="padding:10px 0;border-top:1px solid #eee;color:#555">Billable hours</td>
        <td style="padding:10px 0;border-top:1px solid #eee;text-align:right;font-weight:bold;color:#161616">${report.billable.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid #eee;color:#555">Non-billable hours</td>
        <td style="padding:10px 0;border-top:1px solid #eee;text-align:right;color:#161616">${report.nonBillable.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:2px solid #7a1f2b;color:#161616;font-weight:bold">Total hours</td>
        <td style="padding:10px 0;border-top:2px solid #7a1f2b;text-align:right;font-weight:bold;color:#7a1f2b">${report.total.toFixed(2)}</td>
      </tr>
    </table>
    <p style="margin:14px 0 0;color:#555;font-size:13px;line-height:1.55">The attached PDF breaks your hours down by case. Your entries live in Admin → Time Tracker.</p>`;
  return shell(inner);
}

/** The billing-department prompt (roster of everyone's monthly hours). */
export function deptSummaryHtml(people: PersonReport[], month: MonthInfo, isTest = false): string {
  const rows = people.length
    ? people
        .map(
          (o) =>
            `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #eee">${esc(o.name)}</td><td style="padding:8px 12px 8px 0;border-top:1px solid #eee;text-align:right">${o.billable.toFixed(2)}</td><td style="padding:8px 12px 8px 0;border-top:1px solid #eee;text-align:right">${o.nonBillable.toFixed(2)}</td><td style="padding:8px 0;border-top:1px solid #eee;text-align:right;font-weight:bold">${o.total.toFixed(2)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="padding:8px 0;color:#777">No billable time recorded this month.</td></tr>`;
  const tB = people.reduce((n, o) => n + o.billable, 0);
  const tN = people.reduce((n, o) => n + o.nonBillable, 0);
  const tT = people.reduce((n, o) => n + o.total, 0);
  const inner = `
    ${isTest ? `<p style="margin:0 0 14px;display:inline-block;background:#fdeaea;color:#7a1f2b;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px">TEST — this is a preview</p>` : ""}
    <h1 style="margin:0 0 4px;font-size:20px;color:#161616">Time to prepare ${esc(month.monthLabel)} bills</h1>
    <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.55">It&apos;s the last day of the month. Please start assembling this month&apos;s invoices. Here&apos;s everyone&apos;s recorded time:</p>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <tr style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
        <td style="padding:0 12px 6px 0">Staff</td><td style="padding:0 12px 6px 0;text-align:right">Billable</td><td style="padding:0 12px 6px 0;text-align:right">Non-bill.</td><td style="padding:0 0 6px;text-align:right">Total</td>
      </tr>
      ${rows}
      <tr><td style="padding:10px 12px 0 0;border-top:2px solid #7a1f2b;font-weight:bold">Firm total</td><td style="padding:10px 12px 0 0;border-top:2px solid #7a1f2b;text-align:right;font-weight:bold">${tB.toFixed(2)}</td><td style="padding:10px 12px 0 0;border-top:2px solid #7a1f2b;text-align:right;font-weight:bold">${tN.toFixed(2)}</td><td style="padding:10px 0 0;border-top:2px solid #7a1f2b;text-align:right;font-weight:bold;color:#7a1f2b">${tT.toFixed(2)}</td></tr>
    </table>`;
  return shell(inner);
}

/* ------------------------------ orchestration ------------------------------ */

/** A believable sample so the test email/PDF isn't empty when the tester has no entries. */
export function sampleReport(name: string, email: string): PersonReport {
  const matters: MatterLine[] = [
    { matter: "Doe v. Roe — Cause No. 141-000000-26", billable: 6.5, nonBillable: 1.0, total: 7.5 },
    { matter: "Estate of Sample — Probate Administration", billable: 3.25, nonBillable: 0.5, total: 3.75 },
    { matter: "Acme LLC — Contract Review & Demand", billable: 2.0, nonBillable: 0, total: 2.0 },
  ];
  return { name, email, matters, billable: 11.75, nonBillable: 1.5, total: 13.25 };
}

export { loadLogoBytes };
