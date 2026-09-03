"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mapOverlayProjects } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/map-overlay", session.role, session.permissions)) throw new Error("Not allowed");
  return session;
}

type BaseIn = { url: string; w: number; h: number; name: string };
type TxIn = { x: number; y: number; scale: number; rotation: number };
type LayerIn = { name: string; url: string; w: number; h: number; x: number; y: number; scale: number; rotation: number; opacity: number };
type CropIn = { x: number; y: number; w: number; h: number } | null;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const httpUrl = (v: unknown) => { const s = String(v ?? ""); return /^https?:\/\//.test(s) ? s.slice(0, 1000) : ""; };

export async function saveMapProject(input: { id?: number; name: string; base: BaseIn; baseTx: TxIn; layers: LayerIn[]; crop: CropIn }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = input.name.trim().slice(0, 191);
  if (!name) return { ok: false as const, error: "Give the project a name." };
  if (!httpUrl(input.base?.url)) return { ok: false as const, error: "The images haven't finished uploading — try again." };

  const values = {
    name,
    base: { url: httpUrl(input.base.url), w: num(input.base.w), h: num(input.base.h), name: str(input.base.name, 191) },
    baseTx: { x: num(input.baseTx?.x), y: num(input.baseTx?.y), scale: num(input.baseTx?.scale) || 1, rotation: num(input.baseTx?.rotation) },
    layers: (Array.isArray(input.layers) ? input.layers : []).slice(0, 2).map((l) => ({
      name: str(l.name, 191), url: httpUrl(l.url), w: num(l.w), h: num(l.h),
      x: num(l.x), y: num(l.y), scale: num(l.scale) || 1, rotation: num(l.rotation),
      opacity: Math.max(0, Math.min(100, num(l.opacity))),
    })).filter((l) => l.url),
    crop: input.crop && num(input.crop.w) > 0 && num(input.crop.h) > 0
      ? { x: num(input.crop.x), y: num(input.crop.y), w: num(input.crop.w), h: num(input.crop.h) }
      : null,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      await db.update(mapOverlayProjects).set(values).where(eq(mapOverlayProjects.id, input.id));
      await audit(session.email, "update", "map-overlay", String(input.id), name);
      revalidatePath("/admin/map-overlay");
      return { ok: true as const, id: input.id };
    }
    const [row] = await db.insert(mapOverlayProjects).values({ ...values, createdBy: session.email }).returning({ id: mapOverlayProjects.id });
    await audit(session.email, "create", "map-overlay", String(row.id), name);
    revalidatePath("/admin/map-overlay");
    return { ok: true as const, id: row.id };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false as const, error: /does not exist/i.test(msg) ? "Run Settings → Database updates once, then try again." : msg };
  }
}

export async function deleteMapProject(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  await db.delete(mapOverlayProjects).where(eq(mapOverlayProjects.id, id));
  await audit(session.email, "delete", "map-overlay", String(id), "Deleted project");
  revalidatePath("/admin/map-overlay");
  return { ok: true as const };
}
