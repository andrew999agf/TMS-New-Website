"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export type TeamInput = {
  id?: number;
  slug?: string;
  name: string;
  role: string;
  office: string;
  email: string;
  directPhone: string;
  barNumber: string;
  languages: string;
  photo: string;
  isAttorney: boolean;
  isLead: boolean;
  visible: boolean;
  bioProfessional: string;
  bioBeyond: string;
  bioPersonal: string;
  services: string[];
  practiceAreas: string[];
  memberships: string[];
  barAdmissions: string[];
  courtAdmissions: string[];
};

export async function saveTeamMember(input: TeamInput) {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };
  if (!input.name.trim()) return { ok: false, error: "Name is required." };

  // Only one lead at a time.
  if (input.isLead) {
    await db.update(teamMembers).set({ isLead: false }).where(eq(teamMembers.isLead, true));
  }

  const values = {
    name: input.name,
    role: input.role,
    office: input.office || null,
    email: input.email || null,
    directPhone: input.directPhone || null,
    barNumber: input.barNumber || null,
    languages: input.languages || null,
    photo: input.photo || null,
    isAttorney: input.isAttorney,
    isLead: input.isLead,
    visible: input.visible,
    bioProfessional: input.bioProfessional || null,
    bioBeyond: input.bioBeyond || null,
    bioPersonal: input.bioPersonal || null,
    services: input.services,
    practiceAreas: input.practiceAreas,
    memberships: input.memberships,
    barAdmissions: input.barAdmissions,
    courtAdmissions: input.courtAdmissions,
    updatedAt: new Date(),
  };

  try {
    if (input.id && input.id > 0) {
      await db.update(teamMembers).set(values).where(eq(teamMembers.id, input.id));
    } else {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${teamMembers.sort}), 0)` }).from(teamMembers);
      await db.insert(teamMembers).values({
        ...values,
        slug: input.slug || slugify(input.name),
        teamLabel: "Texas Team",
        sort: Number(max) + 1,
      });
    }
    await audit(session.email, input.id ? "update" : "create", "team", input.slug, `Saved ${input.name}`);
    revalidatePath("/about");
    revalidatePath("/admin/team");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteTeamMember(id: number) {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  await db.delete(teamMembers).where(eq(teamMembers.id, id));
  await audit(session.email, "delete", "team", String(id), "Deleted team member");
  revalidatePath("/about");
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function reorderTeamMember(id: number, dir: "up" | "down") {
  const session = await requireAdmin();
  if (!db) return { ok: false };
  const items = await db.select().from(teamMembers).orderBy(asc(teamMembers.sort));
  const idx = items.findIndex((i) => i.id === id);
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= items.length) return { ok: true };
  await db.update(teamMembers).set({ sort: items[swap].sort }).where(eq(teamMembers.id, items[idx].id));
  await db.update(teamMembers).set({ sort: items[idx].sort }).where(eq(teamMembers.id, items[swap].id));
  await audit(session.email, "update", "team", String(id), `Reordered ${dir}`);
  revalidatePath("/about");
  revalidatePath("/admin/team");
  return { ok: true };
}
