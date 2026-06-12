"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeSubmissions } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export async function updateIntakeStatus(
  id: number,
  status: "new" | "contacted" | "scheduled" | "declined",
) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.update(intakeSubmissions).set({ status }).where(eq(intakeSubmissions.id, id));
  await audit(session.email, "update", "intake", String(id), `Status → ${status}`);
  revalidatePath("/admin/intake");
  return { ok: true };
}
