import { NextResponse } from "next/server";
import { FIRM } from "@/lib/firm";
import { sendEmail, INTAKE_NOTIFY_TO } from "@/lib/email";
import { getQuestionnaire } from "@/lib/intake/questionnaires";
import { answersPdf, type AnswerSection } from "@/lib/intake/answers-pdf";
import { answersDocx } from "@/lib/intake/answers-docx";
import { recipientsForBranch, getActiveTheme, getBlocks } from "@/lib/content";
import { getColorPalette, getFontPalette } from "@/lib/theme/palettes";
import { brandedEmailHtml } from "@/lib/email-template";

export const runtime = "nodejs";
export const maxDuration = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Public submission endpoint for the standalone questionnaires (the
 * single-file HTML forms under /forms). The form's review page POSTs the
 * client's summarized answers here; we build a clean PDF of them, email the
 * intake team (summary + PDF), and send the client a branded confirmation —
 * receipt, no-attorney-client-relationship disclaimer, and their PDF copy.
 * Both emails go immediately: this is a receipt for something the client just
 * did, not an outbound solicitation, so quiet hours don't hold it.
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const p = (payload ?? {}) as Record<string, unknown>;

  const q = getQuestionnaire(str(p.questionnaireId, 64));
  if (!q) return NextResponse.json({ ok: false, error: "Unknown questionnaire." }, { status: 400 });

  const name = str(p.name, 191);
  const email = str(p.email, 255);
  const phone = str(p.phone, 64);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
  }

  // Sanitize the summary: bounded sections of bounded label/value rows.
  const rawSections = Array.isArray(p.sections) ? p.sections.slice(0, 40) : [];
  let itemCount = 0;
  const sections: AnswerSection[] = [];
  for (const s of rawSections) {
    const sec = (s ?? {}) as Record<string, unknown>;
    const title = str(sec.title, 200);
    const rawItems = Array.isArray(sec.items) ? sec.items : [];
    const items = [];
    for (const it of rawItems) {
      if (itemCount >= 400) break;
      const item = (it ?? {}) as Record<string, unknown>;
      const label = str(item.label, 300);
      const value = str(item.value, 5000);
      if (!label && !value) continue;
      items.push({ label, value, flag: item.flag === true });
      itemCount++;
    }
    if (title || items.length) sections.push({ title: title || "Responses", items });
  }
  if (itemCount === 0) return NextResponse.json({ ok: false, error: "No answers were included." }, { status: 400 });
  const warnings = (Array.isArray(p.warnings) ? p.warnings : []).map((w) => str(w, 400)).filter(Boolean).slice(0, 20);

  const [theme, globals] = await Promise.all([getActiveTheme(), getBlocks("global")]);
  const firmName = globals["global.firmName"] || FIRM.name;
  const pdfBytes = await answersPdf({
    firmName,
    formTitle: q.label,
    submittedAt: new Date(),
    clientName: name || undefined,
    warnings,
    sections,
  });
  const cleanName = (name || "client").replace(/[^\w \-'.]+/g, "").trim() || "client";
  const baseFile = `${q.label.replace(/[\\/:*?"<>|]/g, "-")} — ${cleanName}`;
  const pdfAttachment = { filename: `${baseFile}.pdf`, content: Buffer.from(pdfBytes), contentType: "application/pdf" };
  // The intake team's copy is a clean law-firm-style Word document (Times New
  // Roman 12 pt) — team only, never sent to the client.
  const docxBuf = await answersDocx({
    firmName,
    formTitle: q.label,
    submittedAt: new Date(),
    clientName: name || undefined,
    contact: { email, phone: phone || undefined },
    warnings,
    sections,
  });
  const docxAttachment = { filename: `${baseFile}.docx`, content: docxBuf, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

  // ---- Intake team: summary + every answer + the PDF. ----
  const managed = await recipientsForBranch(q.notifyBranch);
  const to = managed.length ? managed : [INTAKE_NOTIFY_TO];
  const rowsHtml = sections.map((s) =>
    `<h3 style="margin:18px 0 6px;font-size:14px;color:#7a1f2b">${esc(s.title)}</h3>` +
    `<table style="border-collapse:collapse;width:100%">${s.items.map((it) =>
      `<tr><td style="padding:4px 16px 4px 0;color:#777;font-size:12.5px;vertical-align:top;white-space:nowrap">${esc(it.label)}</td><td style="padding:4px 0;font-size:13.5px;border-bottom:1px solid #f0ede8;${it.flag ? "color:#b3261e;font-weight:bold" : ""}">${esc(it.value).replace(/\r?\n/g, "<br/>")}</td></tr>`).join("")}</table>`,
  ).join("");
  const teamHtml = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:640px;line-height:1.5">
      <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b;margin:0 0 14px">${esc(firmName)}</p>
      <p style="margin:0 0 12px"><strong>${esc(name || "A prospective client")}</strong> completed the <strong>${esc(q.label)}</strong> questionnaire.</p>
      <table style="border-collapse:collapse;font-size:13.5px;margin:0 0 12px">
        ${name ? `<tr><td style="padding:2px 16px 2px 0;color:#777">Name</td><td>${esc(name)}</td></tr>` : ""}
        <tr><td style="padding:2px 16px 2px 0;color:#777">Email</td><td>${esc(email)}</td></tr>
        ${phone ? `<tr><td style="padding:2px 16px 2px 0;color:#777">Phone</td><td>${esc(phone)}</td></tr>` : ""}
      </table>
      ${warnings.length ? `<div style="margin:0 0 14px;padding:10px 14px;background:#fdecec;border-left:4px solid #b3261e;color:#7d1d17"><strong>Attorney-review flags:</strong><br/>${warnings.map((w) => `&bull; ${esc(w)}`).join("<br/>")}</div>` : ""}
      ${rowsHtml}
      <p style="margin:18px 0 0;color:#999;font-size:12px">The full submission is attached as a formatted Word document. The client received a confirmation email with a PDF copy.</p>
    </div>`;
  const teamResult = await sendEmail({
    to,
    fromName: `${firmName} — Intake`,
    subject: `New questionnaire — ${q.label} — ${name || email}`,
    html: teamHtml,
    attachments: [docxAttachment],
  });

  // ---- Client confirmation: branded receipt + disclaimer + their PDF copy. ----
  const colors = { ...getColorPalette(theme.colorPaletteId).tokens, ...(theme.colorOverrides ?? {}) };
  const fontPalette = getFontPalette(theme.fontPaletteId);
  const fonts = { display: fontPalette.displayLabel, body: fontPalette.bodyLabel };
  const greeting = name ? esc(name) : "there";
  const ackBody = `
    <p style="margin:0 0 14px">Dear ${greeting},</p>
    <p style="margin:0 0 14px">Thank you — we received your <strong>${esc(q.label)}</strong> questionnaire. Our office will review it and follow up with you. A PDF copy of everything you submitted is attached for your records.</p>
    <p style="margin:0 0 14px;padding:12px 16px;background:${colors.surface2};border-left:3px solid ${colors.accent}"><strong>Submitting this questionnaire does not create an attorney-client relationship.</strong> It gathers information only and is not legal advice. Our firm does not represent you until you have signed a representation agreement issued by our firm and paid the applicable retainer fee.</p>
    <p style="margin:0 0 14px">If anything in your answers changes, or your matter is urgent, please call the office directly.</p>
    <p style="margin:18px 0 0;color:${colors.inkMuted};font-size:13px">— The office of ${esc(firmName)}</p>`;
  await sendEmail({
    to: email,
    fromName: firmName,
    subject: `We received your ${q.label} questionnaire — ${firmName}`,
    html: brandedEmailHtml({
      colors, fonts,
      logoLight: globals["global.logoLight"] || undefined,
      logoDark: globals["global.logoDark"] || undefined,
      firmName,
      bodyHtml: ackBody,
    }),
    attachments: [pdfAttachment],
  });

  return NextResponse.json({ ok: true, emailed: teamResult.sent });
}
