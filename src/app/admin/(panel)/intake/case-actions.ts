"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { caseHub, intakeCases, intakeSubmissions, shareFolders, shareRecipients } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { partnerOfAnswers } from "@/lib/intake/partners";
import { getPartnerContacts } from "@/lib/intake/partner-contacts";
import { LeadCaseError, ensureLeadCases, sendLeadToCases, setLeadCaseSkipped, setLeadShareFolder, type SendToCasesInput } from "@/lib/intake/lead-cases";
import { addRecipient, createFolder, resendInvite } from "@/app/admin/(panel)/share-folders/actions";

type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (e: unknown, fallback: string): Result => ({ ok: false, error: e instanceof LeadCaseError ? e.message : fallback });

/** "Send to Cases": the converted lead becomes (or joins) a case record in Matters / Cases. */
export async function sendToCases(leadId: number, input: SendToCasesInput): Promise<Result & { caseId?: number }> {
  const session = await requireAdmin();
  try {
    const r = await sendLeadToCases(Number(leadId), input, session.email);
    await audit(session.email, "create", "case", String(r.caseId), `Lead #${leadId} sent to Cases under matter ${r.matter}${r.existed ? " (the matter already had a case record)" : ""}`);
    revalidatePath("/admin/intake"); revalidatePath("/admin/cases"); revalidatePath(`/admin/cases/${r.caseId}`);
    return { ok: true, caseId: r.caseId, message: r.existed ? `Matter ${r.matter} already had a case record. This lead is now linked to it.` : `Case record created under matter ${r.matter}.` };
  } catch (e) { if (!(e instanceof LeadCaseError)) console.error("[intake] sendToCases failed:", e); return fail(e, "Couldn't create the case record. Try again."); }
}

/** "No case record needed" for a converted lead, and back. */
export async function skipSendToCases(leadId: number, skipped: boolean): Promise<Result> {
  const session = await requireAdmin();
  try {
    await setLeadCaseSkipped(Number(leadId), !!skipped, session.email);
    await audit(session.email, "update", "intake", String(leadId), skipped ? "Marked: no case record needed" : "Back on the list to send to Cases");
    revalidatePath("/admin/intake");
    return { ok: true, message: skipped ? "Taken off the list." : "Back on the list." };
  } catch (e) { return fail(e, "That did not save. Try again."); }
}

/**
 * The two-way document folder with the office that referred the client. Creates it the first time (an ordinary share
 * folder filed under the case's matter) and emails each chosen person their own sign-in link, with permission to add
 * documents. Run again to send the link to someone else there, or to re-send it.
 */
export async function sharePartnerFolder(leadId: number, contactIds: string[]): Promise<Result & { folderId?: number }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  try {
    await ensureLeadCases();
    const [lead] = await db.select().from(intakeSubmissions).where(eq(intakeSubmissions.id, Number(leadId))).limit(1);
    const [link] = await db.select().from(intakeCases).where(eq(intakeCases.intakeId, Number(leadId))).limit(1);
    if (!lead || !link?.caseId) return { ok: false, error: "Send this lead to Cases first." };
    const partner = partnerOfAnswers((lead.answers as Record<string, unknown>) ?? {});
    if (!partner) return { ok: false, error: "This lead did not come through a partner office." };
    const [kase] = await db.select().from(caseHub).where(eq(caseHub.id, link.caseId)).limit(1);
    if (!kase) return { ok: false, error: "The case record no longer exists. Send the lead to Cases again." };
    const wanted = new Set((Array.isArray(contactIds) ? contactIds : []).map(String));
    const people = (await getPartnerContacts(partner.slug)).filter((c) => wanted.has(c.id));
    if (!people.length) return { ok: false, error: `Choose who at ${partner.name} gets the link.` };

    let folderId = link.shareFolderId;
    if (folderId != null) { const [f] = await db.select({ id: shareFolders.id }).from(shareFolders).where(eq(shareFolders.id, folderId)).limit(1); if (!f) folderId = null; }
    let created = false;
    if (folderId == null) {
      const made = await createFolder({ caseNumber: kase.causeNumber, name: `${(lead.name ?? "").trim() || "Client"} — ${partner.name}`.slice(0, 191), matter: kase.matter, court: kase.court, county: kase.county, type: "referring" });
      if (!made.ok) return { ok: false, error: made.error };
      folderId = made.id; created = true;
      await setLeadShareFolder(lead.id, folderId);
    }

    const sent: string[] = [], failed: string[] = [];
    for (const p of people) {
      const email = p.email.trim().toLowerCase();
      const [already] = await db.select({ id: shareRecipients.id }).from(shareRecipients).where(and(eq(shareRecipients.folderId, folderId), eq(shareRecipients.email, email))).limit(1);
      // Someone who already has access gets their link re-issued and emailed again; everyone else is added with permission to add documents.
      const r = already ? await resendInvite(already.id) : await addRecipient(folderId, email, p.name, "upload", "referring", true, undefined, { sendEmail: true });
      (r.ok && !("error" in r && r.error) ? sent : failed).push(p.name);
    }
    await audit(session.email, "update", "intake", String(lead.id), `Shared folder with ${partner.name}${created ? " created" : ""}: link emailed to ${sent.join(", ") || "no one"}`);
    revalidatePath("/admin/intake"); revalidatePath(`/admin/cases/${kase.id}`); revalidatePath("/admin/share-folders");
    if (failed.length) return { ok: false, folderId, error: `${created ? "The folder was created, but the" : "The"} email to ${failed.join(", ")} did not send. Check the email settings, then send the link again.${sent.length ? ` Sent to ${sent.join(", ")}.` : ""}` };
    return { ok: true, folderId, message: `${created ? "Folder created. " : ""}Link emailed to ${sent.join(", ")}.` };
  } catch (e) {
    if ((e as Error)?.message === "Not allowed.") return { ok: false, error: "Your login does not have access to Share Folders, which this uses." };
    console.error("[intake] sharePartnerFolder failed:", e);
    return fail(e, "Couldn't set up the shared folder. Try again.");
  }
}
