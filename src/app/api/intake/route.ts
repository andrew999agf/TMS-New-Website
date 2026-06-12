import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { answersToCsv } from "@/lib/intake/csv";
import { sendEmail, INTAKE_NOTIFY_TO } from "@/lib/email";
import { getBranch } from "@/lib/intake/config";

export const runtime = "nodejs";

const schema = z.object({
  branch: z.string().min(1),
  practiceSlug: z.string().optional(),
  answers: z.record(z.unknown()),
  referrer: z.string().optional(),
  // Honeypot — must be empty.
  company: z.string().optional(),
});

// Very small in-memory rate limiter (per-instance). For production scale,
// front with Vercel/Upstash; sufficient as a first line of defense here.
const hits = new Map<string, { count: number; ts: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const win = 60_000;
  const rec = hits.get(ip);
  if (!rec || now - rec.ts > win) {
    hits.set(ip, { count: 1, ts: now });
    return false;
  }
  rec.count += 1;
  return rec.count > 6;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }

  const { branch, practiceSlug, answers, referrer, company } = parsed.data;

  // Honeypot tripped — pretend success, drop silently.
  if (company && company.trim()) {
    return NextResponse.json({ ok: true });
  }

  const a = answers as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);

  const deadline = str("deadline") || str("courtDate") || str("judgmentDate");
  const isUrgent =
    str("hasDeadline") === "Yes" ||
    Boolean(deadline) ||
    str("inCustody") === "Yes" ||
    str("served") === "Yes";

  const branchDef = getBranch(branch);
  const branchLabel = branchDef?.label ?? branch;

  // Persist (best-effort).
  let id: number | null = null;
  if (db) {
    try {
      const [row] = await db
        .insert(intakeSubmissions)
        .values({
          branch,
          practiceSlug: practiceSlug ?? branchDef?.practiceSlug,
          answers: a,
          name: str("name"),
          email: str("email"),
          phone: str("phone"),
          county: str("county"),
          preferredContact: str("preferredContact"),
          opposingParty: str("opposingParty"),
          deadline,
          isUrgent,
          message: str("message") || str("description"),
          referrer,
        })
        .returning({ id: intakeSubmissions.id });
      id = row?.id ?? null;
    } catch (err) {
      console.error("[intake] persist failed:", err);
    }
  }

  // Email notification with CSV attachment (best-effort).
  const csv = answersToCsv(
    {
      submittedAt: new Date().toISOString(),
      branch: branchLabel,
      practiceSlug: practiceSlug ?? branchDef?.practiceSlug ?? "",
      urgent: isUrgent ? "YES" : "no",
      referrer: referrer ?? "",
    },
    a,
  );

  const rows = Object.entries(a)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${k}</td><td style="padding:4px 0">${
          Array.isArray(v) ? v.join("; ") : String(v ?? "")
        }</td></tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">New consultation request</h2>
      <p style="color:#666;margin:0 0 16px">${branchLabel}${
        isUrgent ? ' · <strong style="color:#b00">URGENT</strong>' : ""
      }</p>
      ${
        isUrgent && deadline
          ? `<p style="background:#fdecea;color:#b00;padding:8px 12px;border-radius:4px">Deadline / court date: <strong>${deadline}</strong></p>`
          : ""
      }
      <table style="border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="color:#999;font-size:12px;margin-top:20px">Full data attached as CSV. ${
        id ? `Submission #${id}.` : "Not persisted (no database configured)."
      }</p>
    </div>`;

  const emailResult = await sendEmail({
    to: INTAKE_NOTIFY_TO,
    subject: `${isUrgent ? "[URGENT] " : ""}New consultation: ${branchLabel}`,
    html,
    attachments: [{ filename: `intake-${id ?? Date.now()}.csv`, content: csv }],
  });

  return NextResponse.json({ ok: true, id, emailed: emailResult.sent });
}
