"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { cleanContract, missingBlanks } from "@/lib/engagement/tml-fields";
import { leadForContract, saveContractData } from "@/lib/intake/contracts";

/** Save what has been filled in for a lead's engagement letter. */
export async function saveContract(input: { leadId: number; data: unknown }): Promise<{ ok: true; blanks: number } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/intake", session.role, session.permissions)) return { ok: false, error: "Not allowed." };
  const lead = await leadForContract(Number(input.leadId));
  if (!lead) return { ok: false, error: "That lead no longer exists." };
  const data = cleanContract(input.data);
  try {
    await saveContractData(lead.id, data, session.email);
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not save." };
  }
  const blanks = missingBlanks(data).length;
  await audit(session.email, "update", "intake-contract", String(lead.id), `Saved the engagement letter for ${lead.name || `lead ${lead.id}`} (${blanks} blank${blanks === 1 ? "" : "s"} left)`);
  revalidatePath("/admin/intake");
  return { ok: true, blanks };
}
