import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/intake/consults";
import { autoArchivePartnerLeads } from "@/lib/intake/lead-archive";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Every ten minutes: reminders for confirmed in-person consultations (the day before and four hours before), and the automatic archiving that keeps the partner lists short. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await sendDueReminders();
  const archived = await autoArchivePartnerLeads().catch(() => null);
  return NextResponse.json({ ok: true, ...r, archived });
}
