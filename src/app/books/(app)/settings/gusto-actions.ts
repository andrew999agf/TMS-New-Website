"use server";

import { revalidatePath } from "next/cache";
import { requireBooks, sbAudit_ } from "@/lib/books/auth";
import { checkGustoConnection, disconnectGusto } from "@/lib/books/gusto";

/** Read the latest payrolls from Gusto to prove the link works. Any login may check. */
export async function checkGusto() {
  const s = await requireBooks();
  const r = await checkGustoConnection(s.companyId);
  revalidatePath("/books/settings");
  return r;
}

export async function disconnectGustoAction() {
  const s = await requireBooks();
  if (s.role !== "owner") return { ok: false as const, error: "Only an owner can disconnect payroll." };
  await disconnectGusto(s.companyId);
  await sbAudit_(s.companyId, s.email, "delete", "integration", "gusto", "Disconnected Gusto");
  revalidatePath("/books/settings");
  return { ok: true as const };
}
