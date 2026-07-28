import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, admins } from "@/db/schema";
import { FIRM } from "@/lib/firm";
import { CT, ctDate } from "@/lib/ct-time";

export type PersonDay = { name: string; billable: number; nonBillable: number; total: number; count: number };
export type DailyReview = { dateIso: string; dateLabel: string; people: PersonDay[]; totalEntries: number };

/** A person's live (non-archived) time for a Central-Time calendar day, grouped
 *  by the ACTIVITY USER who did the work (falling back to the login that entered
 *  it). Billable and non-billable hours are kept separate. */
export async function buildDailyReview(now: Date = new Date()): Promise<DailyReview> {
  const iso = ctDate(now).iso;
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
  const empty: DailyReview = { dateIso: iso, dateLabel, people: [], totalEntries: 0 };
  if (!db) return empty;

  const rows = await db.select().from(timeEntries).where(and(eq(timeEntries.entryDate, iso), eq(timeEntries.status, "active")));
  if (rows.length === 0) return empty;

  const ad = await db.select({ id: admins.id, name: admins.name }).from(admins);
  const ownerName = new Map(ad.map((a) => [a.id, a.name]));

  const byPerson = new Map<string, PersonDay>();
  for (const e of rows) {
    const name = (e.activityUserName || "").trim() || ownerName.get(e.ownerId) || "(unassigned)";
    const p = byPerson.get(name) ?? { name, billable: 0, nonBillable: 0, total: 0, count: 0 };
    const q = e.quantity || 0;
    if (e.nonBillable) p.nonBillable += q; else p.billable += q;
    p.total += q;
    p.count += 1;
    byPerson.set(name, p);
  }
  const people = [...byPerson.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { dateIso: iso, dateLabel, people, totalEntries: rows.length };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hrs = (n: number) => n.toFixed(2);

/** The 6 PM review email: a per-person summary with a button into the Billing
 *  Review tab, filtered to that person and day, where edits can be made. */
export function dailyReviewEmailHtml(data: DailyReview, base: string, isTest = false): string {
  const reviewUrl = (name?: string) => `${base}/admin/billing-review?date=${data.dateIso}${name ? `&user=${encodeURIComponent(name)}` : ""}`;
  const rows = data.people
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 10px 8px 0;border-top:1px solid #eee;font-size:14px">${esc(p.name)}<div style="color:#999;font-size:11px">${p.count} ${p.count === 1 ? "entry" : "entries"}</div></td>
        <td style="padding:8px 10px;border-top:1px solid #eee;text-align:right;font-size:13px">${hrs(p.billable)}</td>
        <td style="padding:8px 10px;border-top:1px solid #eee;text-align:right;font-size:13px;color:#777">${hrs(p.nonBillable)}</td>
        <td style="padding:8px 10px;border-top:1px solid #eee;text-align:right;font-size:13px;font-weight:bold">${hrs(p.total)}</td>
        <td style="padding:8px 0 8px 10px;border-top:1px solid #eee;text-align:right"><a href="${reviewUrl(p.name)}" style="font-size:12px;color:#7a1f2b;text-decoration:none;white-space:nowrap">Review &rarr;</a></td>
      </tr>`,
    )
    .join("");
  const totB = data.people.reduce((n, p) => n + p.billable, 0);
  const totN = data.people.reduce((n, p) => n + p.nonBillable, 0);

  return `<div style="margin:0;background:#f4f2ee;padding:24px 0;font-family:Georgia,'Times New Roman',serif">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e1d8">
      <div style="background:#7a1f2b;height:6px"></div>
      <div style="padding:26px 30px 22px">
        ${isTest ? `<p style="margin:0 0 10px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7a1f2b">Test</p>` : ""}
        <p style="margin:0 0 4px;font-size:18px;font-weight:bold;color:#1a1a1a">End-of-day billing review</p>
        <p style="margin:0 0 16px;color:#555;font-size:14px">Time entered for <strong>${esc(data.dateLabel)}</strong>. Review and revise it now so it doesn&rsquo;t pile up at month-end.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 8px">
          <thead><tr>
            <th style="text-align:left;font-size:11px;color:#999;text-transform:uppercase;padding:0 10px 4px 0">Person</th>
            <th style="text-align:right;font-size:11px;color:#999;text-transform:uppercase;padding:0 10px 4px">Billable</th>
            <th style="text-align:right;font-size:11px;color:#999;text-transform:uppercase;padding:0 10px 4px">Non-bill.</th>
            <th style="text-align:right;font-size:11px;color:#999;text-transform:uppercase;padding:0 10px 4px">Total</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td style="padding:8px 10px 0 0;border-top:2px solid #7a1f2b;font-weight:bold;font-size:13px">All staff</td>
            <td style="padding:8px 10px 0;border-top:2px solid #7a1f2b;text-align:right;font-size:13px;font-weight:bold">${hrs(totB)}</td>
            <td style="padding:8px 10px 0;border-top:2px solid #7a1f2b;text-align:right;font-size:13px;font-weight:bold;color:#777">${hrs(totN)}</td>
            <td style="padding:8px 10px 0;border-top:2px solid #7a1f2b;text-align:right;font-size:13px;font-weight:bold">${hrs(totB + totN)}</td>
            <td style="border-top:2px solid #7a1f2b"></td>
          </tr></tfoot>
        </table>
        <p style="margin:16px 0 0"><a href="${reviewUrl()}" style="background:#7a1f2b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block;font-size:14px">Open the Billing Review tab</a></p>
      </div>
      <div style="border-top:1px solid #eee;padding:14px 30px;color:#9a9a9a;font-size:11px">${esc(FIRM.name)} · Automated end-of-day billing review</div>
    </div>
  </div>`;
}
