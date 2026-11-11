import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/intake/consults";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Every ten minutes: reminders for confirmed in-person consultations, the day before and four hours before. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await sendDueReminders();
  return NextResponse.json({ ok: true, ...r });
}
