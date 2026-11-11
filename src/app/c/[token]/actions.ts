"use server";

import { revalidatePath } from "next/cache";
import { confirmConsult, declineConsult } from "@/lib/intake/consults";

/** The Confirm button on the page a confirmation link opens. */
export async function confirmAction(token: string): Promise<{ result: "confirmed" | "already" | "gone" }> {
  const result = await confirmConsult(String(token));
  revalidatePath("/admin/intake");
  return { result };
}

export async function declineAction(token: string, note: string): Promise<{ ok: boolean }> {
  const ok = await declineConsult(String(token), String(note ?? ""));
  revalidatePath("/admin/intake");
  return { ok };
}
