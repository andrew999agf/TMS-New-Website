import { NextResponse } from "next/server";
import { isNotNull, inArray, asc } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { getSetting } from "@/lib/content";
import { getBranch } from "@/lib/intake/config";
import { FIRM } from "@/lib/firm";

export const runtime = "nodejs";
export const maxDuration = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const INTAKE_NOTIFY_KEY = "intake.statusNotify";

/**
 * Batched intake-change digest. Runs every 15 minutes (see vercel.json) and, if
 * any intake status/archive changes are queued, sends ONE email listing them
 * all — so archiving eight at once produces one email, not eight — then clears
 * the queue. Nothing is sent when there's nothing pending.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ ok: true, note: "no database" });

  const pending = await db.select().from(intakeSubmissions).where(isNotNull(intakeSubmissions.notifyChange)).orderBy(asc(intakeSubmissions.notifyChangeAt));
  if (pending.length === 0) return NextResponse.json({ ok: true, changes: 0 });

  const configured = await getSetting<string[]>(INTAKE_NOTIFY_KEY, [FIRM.email]);
  const recipients = (Array.isArray(configured) ? configured : []).map((s) => String(s).trim()).filter(Boolean);

  // Even if no one is configured, clear the queue so it doesn't pile up forever.
  const ids = pending.map((p) => p.id);
  if (recipients.length === 0) {
    await db.update(intakeSubmissions).set({ notifyChange: null, notifyChangeAt: null, notifyChangeBy: null }).where(inArray(intakeSubmissions.id, ids));
    return NextResponse.json({ ok: true, changes: pending.length, note: "no recipients" });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || `https://${FIRM.domain}`).replace(/\/$/, "");
  const rows = pending
    .map((p) => {
      const name = (p.name || "Unnamed").trim();
      const matter = getBranch(p.branch)?.label || p.branch;
      const actor = p.notifyChangeBy ? p.notifyChangeBy.split("@")[0] : "";
      return `<tr>
        <td style="padding:7px 12px 7px 0;border-top:1px solid #eee;font-size:14px"><a href="${base}/admin/intake?lead=${p.id}" style="color:#7a1f2b;text-decoration:none;font-weight:bold">${esc(name)}</a><div style="color:#999;font-size:12px">${esc(matter)}</div></td>
        <td style="padding:7px 0;border-top:1px solid #eee;font-size:13px">${esc(p.notifyChange ?? "")}${actor ? `<div style="color:#999;font-size:11px">by ${esc(actor)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5;max-width:600px">
    <p style="margin:0 0 12px"><strong>${pending.length}</strong> intake ${pending.length === 1 ? "update" : "updates"} since the last summary:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 14px">${rows}</table>
    <p style="margin:0"><a href="${base}/admin/intake" style="color:#7a1f2b">Open the intake list &rarr;</a></p>
  </div>`;

  const res = await sendEmail({ to: recipients, fromName: `${FIRM.name} — Intake`, subject: `Intake updates — ${pending.length} change${pending.length === 1 ? "" : "s"}`, html });
  if (res.sent) {
    await db.update(intakeSubmissions).set({ notifyChange: null, notifyChangeAt: null, notifyChangeBy: null }).where(inArray(intakeSubmissions.id, ids));
  }
  return NextResponse.json({ ok: true, changes: pending.length, sent: res.sent });
}
