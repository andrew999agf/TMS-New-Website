import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { answersToCsv } from "@/lib/intake/csv";
import { sendEmail, INTAKE_NOTIFY_TO } from "@/lib/email";
import { getBranch } from "@/lib/intake/config";
import { recipientsForBranch, getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml } from "@/lib/email-template";
import { FIRM } from "@/lib/firm";

export const runtime = "nodejs";

/** Escape user-supplied text before placing it in an HTML email. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const schema = z.object({
  branch: z.string().min(1),
  practiceSlug: z.string().optional(),
  answers: z.record(z.unknown()),
  referrer: z.string().optional(),
  turnstileToken: z.string().optional(),
  // Honeypot — must be empty.
  company: z.string().optional(),
});

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not enforced when unconfigured
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

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

  const { branch, practiceSlug, answers, referrer, company, turnstileToken } = parsed.data;

  // Honeypot tripped — pretend success, drop silently.
  if (company && company.trim()) {
    return NextResponse.json({ ok: true });
  }

  // Turnstile (only enforced when configured).
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
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

  // Resolve recipients from the admin-managed list (scoped by intake branch),
  // falling back to the default address if none are configured.
  const managed = await recipientsForBranch(branch);
  const to = managed.length ? managed : [INTAKE_NOTIFY_TO];

  const emailResult = await sendEmail({
    to,
    fromName: `${FIRM.name} — Intake`,
    subject: `${isUrgent ? "[URGENT] " : ""}New consultation: ${branchLabel}`,
    html,
    attachments: [{ filename: `intake-${id ?? Date.now()}.csv`, content: csv }],
  });

  // Second email: a clean, professional summary the team can forward — no raw
  // data dump or attachment. Reads as if prepared by the office.
  const clientName = (str("name") || "A prospective client").trim();
  const matterNoun = branchDef?.summaryNoun ?? `a ${branchLabel.toLowerCase()} matter`;
  const matterShort = (branchDef?.summaryNoun ?? branchLabel).replace(/^an?\s+/i, "");
  const matterSubject = matterShort.charAt(0).toUpperCase() + matterShort.slice(1);
  const pref = str("preferredContact");
  const preferredPhrase = pref === "Email" ? "email" : pref === "Telephone" || pref === "Phone" ? "telephone" : "telephone or email";
  const phone = str("phone");
  const email = str("email");
  const county = str("county");
  const court = str("court") || str("trialCourt") || str("courtNamed");
  // For the subject: prefer the exact court, then any county captured, then city.
  const location = court || str("chargeCounty") || str("deathCounty") || county || "";
  const message = str("message") || str("description");

  const row = (label: string, val?: string) =>
    val ? `<tr><td style="padding:3px 18px 3px 0;color:#777;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:3px 0">${esc(val)}</td></tr>` : "";

  const summaryHtml = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:600px;line-height:1.55;font-size:15px">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 16px">T. Maxwell Smith, PLLC</p>
      <p style="margin:0 0 14px">${esc(clientName)} has reached out to our firm in connection with ${esc(matterNoun)}, and prefers to be contacted by ${preferredPhrase}.</p>
      ${isUrgent && deadline ? `<p style="margin:0 0 14px;color:#b00"><strong>Time-sensitive:</strong> deadline / date noted as ${esc(deadline)}.</p>` : ""}
      <table style="border-collapse:collapse;font-size:14px;margin:4px 0 16px">
        ${row("Name", clientName)}
        ${row("Matter", matterSubject)}
        ${row("Preferred contact", pref || "—")}
        ${row("Telephone", phone)}
        ${row("Email", email)}
        ${row("Court", court)}
        ${row("County / City", county)}
      </table>
      ${message ? `<p style="margin:0 0 6px;color:#777;font-size:13px">In their words:</p><p style="margin:0 0 18px;padding:12px 16px;background:#f6f4f1;border-left:3px solid #7a1f2b;font-style:italic">${esc(message)}</p>` : ""}
      <p style="margin:0;color:#777;font-size:13px">Prepared by the office of T. Maxwell Smith, PLLC.</p>
    </div>`;

  const subjectParts = ["New inquiry", clientName, location, matterSubject].filter(Boolean);
  await sendEmail({
    to,
    fromName: `${FIRM.name} — Intake`,
    subject: subjectParts.join(" — "),
    html: summaryHtml,
  });

  // Acknowledgment email to the prospective client — a branded HTML email that
  // matches the live site (logo banner, theme colors, office footer), with the
  // representation disclaimer.
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
    const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
    const fontPalette = getFontPalette(theme.fontPaletteId);
    const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
    const firmName = globals["global.firmName"] || FIRM.name;
    const greetingName = str("name") ? esc(str("name")!.trim()) : "there";
    const ackBody = `
      <p style="margin:0 0 14px">Dear ${greetingName},</p>
      <p style="margin:0 0 14px">Thank you for your submission. We have received your request and will review it, then follow up using the contact method you chose.</p>
      <p style="margin:0 0 14px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>This has not created an attorney-client relationship.</strong> Our firm does not represent you until you have signed a representation agreement that has been issued by our firm and paid the applicable retainer fee.</p>
      <p style="margin:0 0 14px">If your matter is urgent, please call the office directly.</p>
      <p style="margin:18px 0 0;color:${colors.inkMuted};font-size:13px">— The office of ${esc(firmName)}</p>`;
    const ackHtml = brandedEmailHtml({
      colors,
      fonts,
      logoLight: globals["global.logoLight"] || undefined,
      logoDark: globals["global.logoDark"] || undefined,
      firmName,
      bodyHtml: ackBody,
    });
    await sendEmail({
      to: email,
      fromName: firmName,
      subject: `Thank you for contacting ${firmName}`,
      html: ackHtml,
    });
  }

  return NextResponse.json({ ok: true, id, emailed: emailResult.sent });
}
