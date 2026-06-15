"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeRecipients } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export type RecipientInput = {
  id?: number;
  name: string;
  email: string;
  branches: string[];
  active: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveRecipient(input: RecipientInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  const email = input.email.trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };

  const values = {
    name: input.name.trim(),
    email,
    branches: input.branches ?? [],
    active: input.active,
  };

  try {
    if (input.id && input.id > 0) {
      await db.update(intakeRecipients).set(values).where(eq(intakeRecipients.id, input.id));
    } else {
      await db.insert(intakeRecipients).values(values);
    }
    await audit(session.email, input.id ? "update" : "create", "intake-recipient", input.id ? String(input.id) : undefined, `Saved recipient ${email}`);
    revalidatePath("/admin/intake");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteRecipient(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await db.delete(intakeRecipients).where(eq(intakeRecipients.id, id));
  await audit(session.email, "delete", "intake-recipient", String(id), "Deleted recipient");
  revalidatePath("/admin/intake");
  return { ok: true };
}

export async function toggleRecipient(id: number, active: boolean) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await db.update(intakeRecipients).set({ active }).where(eq(intakeRecipients.id, id));
  await audit(session.email, "update", "intake-recipient", String(id), `Active ${active}`);
  revalidatePath("/admin/intake");
  return { ok: true };
}
