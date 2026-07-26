"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { shareReports, settings, admins } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { sendEmail } from "@/lib/email";
import { FIRM } from "@/lib/firm";
import { SHARE_REPORT_KEY, type ShareReportConfig, type ShareReportKind } from "@/lib/share/reports-config";
import { generateAndStoreReport, reportEmailHtml } from "@/lib/share/reports";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/share-folders", session.role, session.permissions)) throw new Error("Not allowed.");
  return session;
}

export async function saveReportConfig(cfg: ShareReportConfig) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean: ShareReportConfig = {
    enabled: !!cfg.enabled,
    recipients: (cfg.recipients ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
    includeTodos: !!cfg.includeTodos,
    includeDocuments: !!cfg.includeDocuments,
  };
  try {
    await db.insert(settings).values({ key: SHARE_REPORT_KEY, value: clean, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: new Date() } });
    await audit(session.email, "update", "settings", SHARE_REPORT_KEY, "Updated share-report settings");
    revalidatePath("/admin/share-folders/reports");
    return { ok: true as const };
  } catch (err) {
    console.error("[share-reports] saveConfig failed:", err);
    return { ok: false as const, error: "Couldn't save — try again." };
  }
}

/** Generate a report now and file it in the reports area. */
export async function generateReportNow(kind: ShareReportKind) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const r = await generateAndStoreReport(kind, session.email);
    await audit(session.email, "create", "share-report", String(r.id ?? ""), `Generated ${kind} report`);
    revalidatePath("/admin/share-folders/reports");
    return { ok: true as const, id: r.id, pdfUrl: r.pdfUrl };
  } catch (err) {
    console.error("[share-reports] generate failed:", err);
    return { ok: false as const, error: "Couldn't generate the report — try again." };
  }
}

/** Generate the enabled reports and email them to the current admin as a test. */
export async function sendReportTest() {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [me] = await db.select({ email: admins.email }).from(admins).where(eq(admins.email, session.email));
    const to = me?.email || session.email;
    const todo = await generateAndStoreReport("todos", session.email);
    const docs = await generateAndStoreReport("documents", session.email);
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${FIRM.domain}`;
    const html = reportEmailHtml({ todo: todo.todo, docs: docs.docs, reportsUrl: `${base}/admin/share-folders/reports`, isTest: true });
    const res = await sendEmail({
      to: [to],
      fromName: `${FIRM.name} — Office`,
      subject: `[Test] Share-folder review`,
      html,
      attachments: [todo, docs].map((r) => ({ filename: r.filename, content: r.pdf, contentType: "application/pdf" })),
    });
    revalidatePath("/admin/share-folders/reports");
    return res.sent ? { ok: true as const, to } : { ok: false as const, error: "Generated the reports, but the test email didn't send (check email settings)." };
  } catch (err) {
    console.error("[share-reports] test failed:", err);
    return { ok: false as const, error: "Couldn't send the test — try again." };
  }
}

export async function setReportArchived(id: number, archived: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(shareReports).set({ archived, archivedAt: archived ? new Date() : null }).where(eq(shareReports.id, id));
    await audit(session.email, "update", "share-report", String(id), archived ? "Archived report" : "Restored report");
    revalidatePath("/admin/share-folders/reports");
    return { ok: true as const };
  } catch (err) {
    console.error("[share-reports] archive failed:", err);
    return { ok: false as const, error: "Couldn't update — try again." };
  }
}

export async function deleteReport(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [r] = await db.select().from(shareReports).where(eq(shareReports.id, id));
    if (r?.pdfUrl) { try { await del(r.pdfUrl); } catch { /* best-effort */ } }
    await db.delete(shareReports).where(eq(shareReports.id, id));
    await audit(session.email, "delete", "share-report", String(id), "Deleted report");
    revalidatePath("/admin/share-folders/reports");
    return { ok: true as const };
  } catch (err) {
    console.error("[share-reports] delete failed:", err);
    return { ok: false as const, error: "Couldn't delete — try again." };
  }
}
