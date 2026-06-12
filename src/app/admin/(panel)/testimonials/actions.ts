"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { testimonials } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";

export async function createTestimonial(data: {
  quote: string;
  attribution: string;
  context: string;
}) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!data.quote.trim()) return { ok: false, error: "Quote is required." };
  await db.insert(testimonials).values({
    quote: data.quote,
    attribution: data.attribution || null,
    context: data.context || null,
  });
  await audit(session.email, "create", "testimonial", undefined, "Added testimonial");
  revalidatePath("/admin/testimonials");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTestimonial(
  id: number,
  data: { quote: string; attribution: string; context: string; visible: boolean },
) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await db
    .update(testimonials)
    .set({
      quote: data.quote,
      attribution: data.attribution || null,
      context: data.context || null,
      visible: data.visible,
    })
    .where(eq(testimonials.id, id));
  await audit(session.email, "update", "testimonial", String(id), "Updated testimonial");
  revalidatePath("/admin/testimonials");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTestimonial(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  await db.delete(testimonials).where(eq(testimonials.id, id));
  await audit(session.email, "delete", "testimonial", String(id), "Deleted testimonial");
  revalidatePath("/admin/testimonials");
  revalidatePath("/");
  return { ok: true };
}
