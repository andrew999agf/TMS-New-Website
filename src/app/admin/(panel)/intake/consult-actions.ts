"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, audit } from "@/lib/auth";
import { cancelConsult, ConsultError, proposeConsult } from "@/lib/intake/consults";

type R = { ok: true; message: string } | { ok: false; error: string };

/** Offer one date, time and place for a requested consultation, and email it for confirmation. */
export async function offerConsultTime(input: { id: number; date: string; time: string; durationMin: number; location: string; note: string; sendTo: string }): Promise<R> {
  const session = await requireAdmin();
  try {
    const r = await proposeConsult(Number(input.id), input, session.email);
    await audit(session.email, "send", "intake-consult", String(input.id), `Offered ${input.date} ${input.time} for an in-person consultation; emailed to ${r.sentTo}`);
    revalidatePath("/admin/intake");
    return { ok: true, message: `Sent to ${r.sentTo} to confirm.` };
  } catch (e) {
    if (e instanceof ConsultError) { revalidatePath("/admin/intake"); return { ok: false, error: e.message }; }
    throw e;
  }
}

export async function cancelConsultRequest(input: { id: number }): Promise<R> {
  const session = await requireAdmin();
  try {
    await cancelConsult(Number(input.id));
    await audit(session.email, "delete", "intake-consult", String(input.id), "Cancelled an in-person consultation request");
    revalidatePath("/admin/intake");
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    if (e instanceof ConsultError) return { ok: false, error: e.message };
    throw e;
  }
}
