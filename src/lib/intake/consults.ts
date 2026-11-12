import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { intakeConsults, intakeSubmissions } from "@/db/schema";
import { FIRM, OFFICES } from "@/lib/firm";
import { SITE_URL } from "@/lib/seo";
import { sendEmail } from "@/lib/email";
import { sendOrScheduleClientEmail } from "@/lib/email-quiet";
import { brandedEmailHtml } from "@/lib/email-template";
import { getActiveTheme, getBlocks, recipientsForBranch } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { INTAKE_NOTIFY_TO } from "@/lib/email";
import { getIntakePartner } from "./partners";
import { getPartnerContacts } from "./partner-contacts";

/**
 * In-person consultation requests from a partner office's intake form.
 *
 *   requested  the person gave up to four dates that work for them (a request,
 *              not an appointment)
 *   proposed   the intake team picked a real date, time and place and emailed
 *              it to the partner-office contact (or the person) to confirm
 *   confirmed  they pressed Confirm: everyone is told, and reminders go out
 *              the day before and four hours before
 *   cancelled  called off by the intake team
 *
 * Email addresses are never mixed: the firm's team and the partner-office
 * contact share one message; the person gets their own, with no one else's
 * address on it.
 */
export const CONSULT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS intake_consults (
    id serial PRIMARY KEY, intake_id integer NOT NULL, partner_slug varchar(64) NOT NULL DEFAULT '', token varchar(64) NOT NULL, status varchar(16) NOT NULL DEFAULT 'requested',
    requested jsonb NOT NULL DEFAULT '[]'::jsonb, contact_id varchar(32) NOT NULL DEFAULT '', sent_to_name varchar(191) NOT NULL DEFAULT '', sent_to_email varchar(255) NOT NULL DEFAULT '', sent_to_kind varchar(16) NOT NULL DEFAULT '',
    start_at timestamptz, duration_min integer NOT NULL DEFAULT 60, location text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', proposed_by varchar(255), proposed_at timestamptz, confirmed_at timestamptz,
    decline_note text NOT NULL DEFAULT '', reminder_day_at timestamptz, reminder_hours_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS intake_consults_token_uq ON intake_consults (token)`,
  `CREATE INDEX IF NOT EXISTS intake_consults_intake_idx ON intake_consults (intake_id)`,
];

let ensured: Promise<void> | null = null;
/** Creates the table the first time it is needed, so no manual database update is required. */
export async function ensureConsults(): Promise<void> {
  if (!db) return;
  if (!ensured) ensured = (async () => { for (const stmt of CONSULT_DDL) await db!.execute(sql.raw(stmt)); })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

export class ConsultError extends Error {}
export type RequestedDate = { date: string; part: string };
export const DAY_PARTS = ["Morning", "Afternoon", "Either"] as const;
const TZ = "America/Chicago";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---- dates and times, always on a Central-time clock ---- */
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
export const centralToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
/** The instant that reads `ymd hm` on a Central clock, on either side of daylight saving. */
export function centralInstant(ymd: string, hm: string): Date {
  for (const off of ["-05:00", "-06:00"]) {
    const d = new Date(`${ymd}T${hm}:00${off}`);
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
    if (`${g("year")}-${g("month")}-${g("day")}` === ymd && `${String(Number(g("hour")) % 24).padStart(2, "0")}:${g("minute")}` === hm) return d;
  }
  return new Date(`${ymd}T${hm}:00-06:00`);
}
export const fmtDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const fmtWhen = (d: Date) => `${d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })} (Central time)`;
export const fmtRequested = (r: RequestedDate) => `${fmtDay(r.date)}${r.part && r.part !== "Either" ? ` — ${r.part.toLowerCase()}` : ""}`;

/** Clean what the form sent: real future dates, at most four, no repeats. */
export function cleanRequested(input: unknown): RequestedDate[] {
  if (!Array.isArray(input)) return [];
  const today = centralToday(), out: RequestedDate[] = [], seen = new Set<string>();
  for (const x of input) {
    const date = (x as { date?: unknown })?.date, part = String((x as { part?: unknown })?.part ?? "Either");
    if (!isYmd(date) || date <= today || date > `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`) continue;
    const p = (DAY_PARTS as readonly string[]).includes(part) ? part : "Either";
    if (seen.has(`${date}|${p}`)) continue;
    seen.add(`${date}|${p}`); out.push({ date, part: p });
    if (out.length === 4) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createConsultRequest(intakeId: number, partnerSlug: string, requested: RequestedDate[], contactId: string): Promise<number | null> {
  if (!db || requested.length === 0) return null;
  await ensureConsults();
  const [row] = await db.insert(intakeConsults).values({ intakeId, partnerSlug, token: randomBytes(24).toString("hex"), requested, contactId: contactId.slice(0, 32) }).returning({ id: intakeConsults.id });
  return row.id;
}

export type ConsultView = {
  id: number; intakeId: number; status: string; requested: RequestedDate[]; contactId: string; clientName: string; clientPhone: string; clientEmail: string; matter: string;
  sentToName: string; sentToKind: string; startAt: string | null; whenText: string; durationMin: number; location: string; note: string; proposedAt: string | null; proposedBy: string | null;
  confirmedAt: string | null; declineNote: string; reminderDayAt: string | null; reminderHoursAt: string | null; createdAt: string;
  /** The lead this request belongs to: its status (the outcome) and whether it has been archived. */
  leadStatus: string; leadArchived: boolean;
  /** Where the meeting stands in time: offered or confirmed and still ahead; or already over. */
  upcoming: boolean; past: boolean;
};

export async function listConsults(partnerSlug: string): Promise<ConsultView[]> {
  if (!db) return [];
  await ensureConsults();
  const rows = await db.select({ c: intakeConsults, name: intakeSubmissions.name, phone: intakeSubmissions.phone, email: intakeSubmissions.email, answers: intakeSubmissions.answers, leadStatus: intakeSubmissions.status, leadArchived: intakeSubmissions.archived })
    .from(intakeConsults).innerJoin(intakeSubmissions, eq(intakeSubmissions.id, intakeConsults.intakeId)).where(eq(intakeConsults.partnerSlug, partnerSlug)).orderBy(desc(intakeConsults.id)).limit(400);
  const now = Date.now();
  return rows.map(({ c, name, phone, email, answers, leadStatus, leadArchived }) => ({
    leadStatus: String(leadStatus), leadArchived: !!leadArchived,
    upcoming: (c.status === "proposed" || c.status === "confirmed") && !!c.startAt && c.startAt.getTime() > now,
    past: !!c.startAt && c.startAt.getTime() + c.durationMin * 60_000 < now,
    id: c.id, intakeId: c.intakeId, status: c.status, requested: c.requested ?? [], contactId: c.contactId, clientName: name ?? "", clientPhone: phone ?? "", clientEmail: email ?? "", matter: String((answers as Record<string, unknown>)?.practiceArea ?? ""),
    sentToName: c.sentToName, sentToKind: c.sentToKind, startAt: c.startAt?.toISOString() ?? null, whenText: c.startAt ? fmtWhen(c.startAt) : "", durationMin: c.durationMin, location: c.location, note: c.note,
    proposedAt: c.proposedAt?.toISOString() ?? null, proposedBy: c.proposedBy, confirmedAt: c.confirmedAt?.toISOString() ?? null, declineNote: c.declineNote,
    reminderDayAt: c.reminderDayAt?.toISOString() ?? null, reminderHoursAt: c.reminderHoursAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(),
  }));
}

/**
 * The partner office's own addresses, read from the contact details kept on
 * its tab (one office per block). The address is every line before the first
 * phone or email line.
 */
export function partnerLocations(partnerName: string, contactText: string): string[] {
  const out: string[] = [];
  for (const block of String(contactText ?? "").split(/\n\s*\n/)) {
    const lines: string[] = [];
    for (const raw of block.split("\n")) {
      const line = raw.trim().replace(/,+$/, "");
      if (!line) continue;
      if (/@|\bphone\b|\bemail\b|\btel\b|\bfax\b|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}/i.test(line)) break;
      lines.push(line);
    }
    if (lines.length) out.push(`${partnerName}, ${lines.join(", ")}`.slice(0, 300));
  }
  return [...new Set(out)];
}

/** Places the consultation can be held: the firm's own offices. */
export const consultLocations = () => OFFICES.map((o) => `${FIRM.name}, ${o.street}, ${o.city}, ${o.state} ${o.zip}`);

/* ---- emails ---- */
async function brand() {
  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fp = getFontPalette(theme.fontPaletteId);
  const firmName = globals["global.firmName"] || FIRM.name;
  const wrap = (bodyHtml: string) => brandedEmailHtml({ colors, fonts: { display: fp.displayLabel, body: fp.bodyLabel }, logoLight: globals["global.logoLight"] || undefined, logoDark: globals["global.logoDark"] || undefined, firmName, bodyHtml });
  const box = (html: string) => `<p style="margin:0 0 16px;padding:14px 18px;background:${colors.surface2};border-left:3px solid ${colors.accent};line-height:1.7">${html}</p>`;
  const button = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td align="center" bgcolor="${colors.accent}" style="background-color:${colors.accent};border-radius:8px"><a href="${href}" style="display:inline-block;padding:15px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${colors.onAccent};text-decoration:none">${label} &rarr;</a></td></tr></table>`;
  const sign = `<p style="margin:18px 0 0;color:${colors.inkMuted};font-size:13px">&mdash; The office of ${esc(firmName)}</p>`;
  return { colors, firmName, wrap, box, button, sign };
}
const NOT_CLIENT = "<strong>This has not created an attorney-client relationship.</strong> Our firm does not represent you until you have signed a representation agreement that has been issued by our firm and paid the applicable retainer fee.";
const details = (when: string, mins: number, location: string) => `<strong>${esc(when)}</strong><br/>About ${mins} minutes, in person<br/>${esc(location)}`;
const adminLink = (slug: string, consultId: number) => `${SITE_URL}/admin/intake?partner=${slug}&consult=${consultId}#consults`;

/** A calendar file people can add to their own calendar. */
function ics(c: { id: number; startAt: Date; durationMin: number; location: string }, firmName: string, summary: string): { filename: string; content: string; contentType: string } {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const t = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${t(firmName)}//Consultation//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:consult-${c.id}@${FIRM.domain}`, `DTSTAMP:${z(new Date())}`,
    `DTSTART:${z(c.startAt)}`, `DTEND:${z(new Date(c.startAt.getTime() + c.durationMin * 60_000))}`, `SUMMARY:${t(summary)}`, `LOCATION:${t(c.location)}`, "END:VEVENT", "END:VCALENDAR"];
  return { filename: "consultation.ics", content: lines.join("\r\n") + "\r\n", contentType: "text/calendar; charset=utf-8; method=PUBLISH" };
}

async function load(id: number) {
  const [row] = await db!.select({ c: intakeConsults, lead: intakeSubmissions }).from(intakeConsults).innerJoin(intakeSubmissions, eq(intakeSubmissions.id, intakeConsults.intakeId)).where(eq(intakeConsults.id, id)).limit(1);
  if (!row) throw new ConsultError("That consultation request no longer exists.");
  return row;
}
const teamFor = async (branch: string) => { const m = await recipientsForBranch(branch); return m.length ? m : [INTAKE_NOTIFY_TO]; };
const validEmail = (e: string | null | undefined): e is string => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/**
 * The intake team's step: offer one date, time and place, and email it to the
 * partner-office contact (or, if chosen, to the person) with a Confirm button.
 */
export async function proposeConsult(id: number, input: { date: string; time: string; durationMin: number; location: string; note: string; sendTo: string }, by: string): Promise<{ sentTo: string }> {
  if (!db) throw new ConsultError("Database not configured.");
  await ensureConsults();
  const { c, lead } = await load(id);
  if (c.status === "cancelled") throw new ConsultError("This request was cancelled.");
  if (!isYmd(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new ConsultError("Choose the date and the time.");
  const startAt = centralInstant(input.date, input.time);
  if (startAt.getTime() < Date.now() + 30 * 60_000) throw new ConsultError("Choose a date and time in the future.");
  const durationMin = [30, 45, 60, 90, 120].includes(Number(input.durationMin)) ? Number(input.durationMin) : 60;
  const location = String(input.location ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!location) throw new ConsultError("Choose where the consultation will be held.");
  const note = String(input.note ?? "").trim().slice(0, 1000);
  const partner = getIntakePartner(c.partnerSlug);
  let to = { name: "", email: "", kind: "" };
  if (input.sendTo === "client") { if (!validEmail(lead.email)) throw new ConsultError("This person didn't give an email address. Send it to a contact at the partner office instead."); to = { name: lead.name ?? "", email: lead.email.trim(), kind: "client" }; }
  else { const contact = partner ? (await getPartnerContacts(partner.slug)).find((x) => x.id === input.sendTo) : undefined; if (!contact) throw new ConsultError("Choose who to send it to."); to = { name: contact.name, email: contact.email.trim(), kind: "contact" }; }

  const token = randomBytes(24).toString("hex"); // a new link each time, so an older offer can no longer be confirmed
  await db.update(intakeConsults).set({ status: "proposed", token, startAt, durationMin, location, note, sentToName: to.name, sentToEmail: to.email, sentToKind: to.kind, proposedBy: by, proposedAt: new Date(), confirmedAt: null, declineNote: "", reminderDayAt: null, reminderHoursAt: null }).where(eq(intakeConsults.id, id));

  const b = await brand();
  const client = (lead.name ?? "").trim() || "the person";
  const when = fmtWhen(startAt), href = `${SITE_URL}/c/${token}`;
  const body = to.kind === "client"
    ? `<p style="margin:0 0 14px">Dear ${esc(to.name || "there")},</p>
       <p style="margin:0 0 16px">Thank you for asking to meet with us in person. We have looked at our calendar and can offer:</p>
       ${b.box(details(when, durationMin, location))}
       ${note ? `<p style="margin:0 0 16px">${esc(note)}</p>` : ""}
       <p style="margin:0 0 6px"><strong>This time is not held for you until you confirm it.</strong></p>
       ${b.button(href, "Confirm this date and time")}
       <p style="margin:0 0 16px;font-size:13px;color:${b.colors.inkMuted}">If it doesn&rsquo;t work, open the same link and choose &ldquo;This time doesn&rsquo;t work.&rdquo;</p>
       ${b.box(NOT_CLIENT)}${b.sign}`
    : `<p style="margin:0 0 14px">Dear ${esc(to.name || "there")},</p>
       <p style="margin:0 0 16px"><strong>${esc(client)}</strong> asked for an in-person consultation${partner ? ` through ${esc(partner.name)}` : ""}. We have looked at our calendar and can offer:</p>
       ${b.box(details(when, durationMin, location))}
       ${note ? `<p style="margin:0 0 16px">${esc(note)}</p>` : ""}
       <p style="margin:0 0 6px">Please check with ${esc(client)}${lead.phone ? ` (${esc(lead.phone)})` : ""} and confirm. <strong>The time is not held until it is confirmed.</strong></p>
       ${b.button(href, "Confirm this date and time")}
       <p style="margin:0 0 16px;font-size:13px;color:${b.colors.inkMuted}">If it doesn&rsquo;t work, open the same link and choose &ldquo;This time doesn&rsquo;t work.&rdquo; We will offer another.</p>
       ${c.requested.length ? `<p style="margin:0 0 16px;font-size:13px;color:${b.colors.inkMuted}">Dates they asked for: ${c.requested.map((r) => esc(fmtRequested(r))).join("; ")}.</p>` : ""}${b.sign}`;
  const res = await sendEmail({ to: to.email, fromName: b.firmName, subject: `Please confirm: in-person consultation ${to.kind === "client" ? "" : `for ${client} `}on ${fmtDay(input.date)}`.replace(/\s+/g, " "), html: b.wrap(body) });
  if (!res.sent) throw new ConsultError("The time was saved, but the email could not be sent. Check the email settings, then use Send again.");
  return { sentTo: to.name || to.email };
}

export type PublicConsult = { status: string; clientName: string; whenText: string; durationMin: number; location: string; note: string; firmName: string; forClient: boolean; past: boolean };

/** What the confirmation page shows for a link. Null = the link is not (or no longer) valid. */
export async function consultByToken(token: string): Promise<PublicConsult | null> {
  if (!db || !/^[0-9a-f]{48}$/.test(token)) return null;
  await ensureConsults();
  const [row] = await db.select({ c: intakeConsults, name: intakeSubmissions.name }).from(intakeConsults).innerJoin(intakeSubmissions, eq(intakeSubmissions.id, intakeConsults.intakeId)).where(eq(intakeConsults.token, token)).limit(1);
  if (!row || !row.c.startAt) return null;
  const globals = await getBlocks("global");
  return { status: row.c.status, clientName: row.name ?? "", whenText: fmtWhen(row.c.startAt), durationMin: row.c.durationMin, location: row.c.location, note: row.c.note, firmName: globals["global.firmName"] || FIRM.name, forClient: row.c.sentToKind === "client", past: row.c.startAt.getTime() < Date.now() };
}

type Loaded = Awaited<ReturnType<typeof load>>;
/** One message to the firm's team with the partner-office contact copied; a separate one to the person. Nobody's address is shown to the person. */
async function tellEveryone(row: Loaded, kind: "confirmed" | "day" | "hours" | "cancelled", opts: { quiet?: boolean } = {}) {
  const { c, lead } = row;
  if (!c.startAt) return;
  const b = await brand();
  const partner = getIntakePartner(c.partnerSlug);
  const client = (lead.name ?? "").trim() || "The person";
  const when = fmtWhen(c.startAt);
  const head = { confirmed: "Confirmed", day: "Reminder: tomorrow", hours: "Reminder: today", cancelled: "Cancelled" }[kind];
  const lead1 = { confirmed: "is confirmed", day: "is tomorrow", hours: "is in about four hours", cancelled: "has been cancelled" }[kind];
  const team = await teamFor(lead.branch);
  // The contact rides along on the team's message when they were the one asked to confirm, or were picked on the form.
  let contactEmail = c.sentToKind === "contact" ? c.sentToEmail : "";
  if (!contactEmail && partner && c.contactId) contactEmail = (await getPartnerContacts(partner.slug)).find((x) => x.id === c.contactId)?.email ?? "";
  const cc = validEmail(contactEmail) && !team.some((t) => t.toLowerCase() === contactEmail.toLowerCase()) ? [contactEmail.trim()] : undefined;
  const attach = kind === "confirmed" ? [ics({ id: c.id, startAt: c.startAt, durationMin: c.durationMin, location: c.location }, b.firmName, `In-person consultation: ${client}`)] : undefined;
  const send = async (o: { to: string | string[]; cc?: string[]; subject: string; html: string; withIcs?: boolean }) =>
    opts.quiet ? sendOrScheduleClientEmail({ to: o.to, cc: o.cc, subject: o.subject, html: o.html, fromName: b.firmName }) : sendEmail({ to: o.to, cc: o.cc, subject: o.subject, html: o.html, fromName: b.firmName, attachments: o.withIcs ? attach : undefined });

  const teamBody = `
    <p style="margin:0 0 16px">The in-person consultation with <strong>${esc(client)}</strong>${partner ? ` (through ${esc(partner.name)})` : ""} ${lead1}.</p>
    ${b.box(details(when, c.durationMin, c.location))}
    <p style="margin:0 0 16px;line-height:1.7">${lead.phone ? `Telephone: ${esc(lead.phone)}<br/>` : ""}${validEmail(lead.email) ? `Email: ${esc(lead.email)}<br/>` : ""}${String((lead.answers as Record<string, unknown>)?.practiceArea ?? "") ? `Matter: ${esc(String((lead.answers as Record<string, unknown>).practiceArea))}` : ""}</p>
    ${kind === "confirmed" ? `<p style="margin:0 0 16px;font-size:13px;color:${b.colors.inkMuted}">Reminders go to everyone the day before and four hours before. A calendar file is attached.</p>` : ""}
    ${b.button(adminLink(c.partnerSlug, c.id), "Open it in the intake portal")}${b.sign}`;
  await send({ to: team, cc, subject: `${head}: in-person consultation — ${client} — ${when}`, html: b.wrap(teamBody), withIcs: true });

  if (validEmail(lead.email)) {
    const clientBody = `
      <p style="margin:0 0 14px">Dear ${esc((lead.name ?? "").trim() || "there")},</p>
      <p style="margin:0 0 16px">Your in-person consultation with ${esc(b.firmName)} ${lead1}.</p>
      ${b.box(details(when, c.durationMin, c.location))}
      ${kind === "cancelled" ? `<p style="margin:0 0 16px">We will be in touch about another time.</p>` : `<p style="margin:0 0 16px">If you can&rsquo;t make it, please call the office as soon as you can so we can find another time.</p>`}
      ${kind === "cancelled" ? "" : b.box(NOT_CLIENT)}${b.sign}`;
    await send({ to: lead.email.trim(), subject: { confirmed: `Confirmed: your consultation on ${when}`, day: `Reminder: your consultation is tomorrow, ${when}`, hours: `Reminder: your consultation is today, ${when}`, cancelled: `Cancelled: your consultation on ${when}` }[kind], html: b.wrap(clientBody), withIcs: true });
  }
}

/** The Confirm button. Only an offer that is still open can be confirmed. */
export async function confirmConsult(token: string): Promise<"confirmed" | "already" | "gone"> {
  if (!db || !/^[0-9a-f]{48}$/.test(token)) return "gone";
  await ensureConsults();
  const [hit] = await db.update(intakeConsults).set({ status: "confirmed", confirmedAt: new Date() }).where(and(eq(intakeConsults.token, token), eq(intakeConsults.status, "proposed"))).returning({ id: intakeConsults.id, intakeId: intakeConsults.intakeId });
  if (!hit) { const [c] = await db.select({ status: intakeConsults.status }).from(intakeConsults).where(eq(intakeConsults.token, token)).limit(1); return c?.status === "confirmed" ? "already" : "gone"; }
  // The lead moves to "scheduled" unless the team has already taken it further.
  await db.update(intakeSubmissions).set({ status: "scheduled" }).where(and(eq(intakeSubmissions.id, hit.intakeId), inArray(intakeSubmissions.status, ["new", "contacted"]))).catch(() => {});
  await tellEveryone(await load(hit.id), "confirmed").catch((e) => console.error("[consult] confirmation email failed:", e));
  return "confirmed";
}

/** "This time doesn't work": back to the intake team to offer another. */
export async function declineConsult(token: string, noteIn: string): Promise<boolean> {
  if (!db || !/^[0-9a-f]{48}$/.test(token)) return false;
  await ensureConsults();
  const note = String(noteIn ?? "").trim().slice(0, 600);
  const [hit] = await db.update(intakeConsults).set({ status: "requested", declineNote: note || "(no reason given)" }).where(and(eq(intakeConsults.token, token), eq(intakeConsults.status, "proposed"))).returning({ id: intakeConsults.id });
  if (!hit) return false;
  const row = await load(hit.id), b = await brand();
  const client = (row.lead.name ?? "").trim() || "The person";
  const body = `<p style="margin:0 0 16px">${esc(row.c.sentToName || "They")} said the time offered to <strong>${esc(client)}</strong> doesn&rsquo;t work${row.c.startAt ? `: ${esc(fmtWhen(row.c.startAt))}` : ""}.</p>
    ${note ? b.box(esc(note)) : ""}
    ${row.c.requested.length ? `<p style="margin:0 0 16px">Dates originally asked for: ${row.c.requested.map((r) => esc(fmtRequested(r))).join("; ")}.</p>` : ""}
    ${b.button(adminLink(row.c.partnerSlug, row.c.id), "Offer another time")}${b.sign}`;
  await sendEmail({ to: await teamFor(row.lead.branch), fromName: b.firmName, subject: `Needs a new time: in-person consultation — ${client}`, html: b.wrap(body) }).catch(() => {});
  return true;
}

export async function cancelConsult(id: number): Promise<void> {
  if (!db) throw new ConsultError("Database not configured.");
  await ensureConsults();
  const row = await load(id);
  if (row.c.status === "cancelled") return;
  const was = row.c.status;
  await db.update(intakeConsults).set({ status: "cancelled" }).where(eq(intakeConsults.id, id));
  if (was === "confirmed") await tellEveryone(row, "cancelled").catch(() => {}); // people who were told it was on are told it is off
}

/** Run every few minutes: send the day-before and four-hours-before reminders that have come due. */
export async function sendDueReminders(now = new Date()): Promise<{ day: number; hours: number }> {
  if (!db) return { day: 0, hours: 0 };
  await ensureConsults();
  const H = 3_600_000;
  const soon = await db.select({ id: intakeConsults.id, startAt: intakeConsults.startAt, confirmedAt: intakeConsults.confirmedAt, reminderDayAt: intakeConsults.reminderDayAt, reminderHoursAt: intakeConsults.reminderHoursAt })
    .from(intakeConsults).where(and(eq(intakeConsults.status, "confirmed"), sql`${intakeConsults.startAt} > ${now.toISOString()}`, sql`${intakeConsults.startAt} <= ${new Date(now.getTime() + 24 * H).toISOString()}`));
  let day = 0, hours = 0;
  for (const c of soon) {
    if (!c.startAt) continue;
    const left = c.startAt.getTime() - now.getTime();
    // Four hours before (down to 30 minutes before; later than that a reminder is no use).
    if (!c.reminderHoursAt && left <= 4 * H && left >= 0.5 * H) {
      const [claimed] = await db.update(intakeConsults).set({ reminderHoursAt: now }).where(and(eq(intakeConsults.id, c.id), isNull(intakeConsults.reminderHoursAt))).returning({ id: intakeConsults.id });
      if (claimed) { await tellEveryone(await load(c.id), "hours", { quiet: true }).catch((e) => console.error("[consult] reminder failed:", e)); hours++; }
    }
    // The day before: from 24 hours out until the four-hour reminder takes over. Skipped if it was only confirmed inside that window.
    else if (!c.reminderDayAt && left <= 24 * H && left > 4 * H) {
      const [claimed] = await db.update(intakeConsults).set({ reminderDayAt: now }).where(and(eq(intakeConsults.id, c.id), isNull(intakeConsults.reminderDayAt))).returning({ id: intakeConsults.id });
      const confirmedLate = c.confirmedAt && c.startAt.getTime() - c.confirmedAt.getTime() < 20 * H;
      if (claimed && !confirmedLate) { await tellEveryone(await load(c.id), "day", { quiet: true }).catch((e) => console.error("[consult] reminder failed:", e)); day++; }
    }
  }
  return { day, hours };
}
