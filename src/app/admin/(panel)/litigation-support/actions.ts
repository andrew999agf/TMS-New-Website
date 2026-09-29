"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { dwqPackages, litFiles } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { ensureDiscoveryTables } from "@/db/ensure";
import { buildDwqDocx, type DwqInput } from "@/lib/litigation/dwq-docx";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/litigation-support", session.role, session.permissions)) {
    throw new Error("Not allowed");
  }
  await ensureDiscoveryTables();
  return session;
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const strArr = (v: unknown, max: number, each = 4000): string[] =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? "").slice(0, each)).slice(0, max);

/** Everything user-typed, bounded — the Word document regenerates from this. */
function cleanInput(raw: DwqInput): DwqInput {
  return {
    causeNo: str(raw.causeNo, 64),
    courtLines: strArr(raw.courtLines, 5, 120),
    plaintiff: str(raw.plaintiff, 255),
    defendant: str(raw.defendant, 255),
    noticingParty: str(raw.noticingParty, 255),
    entity: str(raw.entity, 255),
    serviceLine: str(raw.serviceLine, 600),
    financial: raw.financial === true,
    method: raw.method === "in-person" ? "in-person" : "zoom",
    dateTime: str(raw.dateTime, 160),
    reporter: str(raw.reporter, 255),
    zoomLink: str(raw.zoomLink, 500),
    zoomMeetingId: str(raw.zoomMeetingId, 64),
    zoomPasscode: str(raw.zoomPasscode, 64),
    location: str(raw.location, 500),
    affidavitOption: raw.affidavitOption !== false,
    definitions: str(raw.definitions, 8000),
    documents: strArr(raw.documents, 60),
    includeStandardQuestions: raw.includeStandardQuestions !== false,
    customQuestions: strArr(raw.customQuestions, 60),
    includeHousekeepingQuestions: raw.includeHousekeepingQuestions !== false,
    returnFax: str(raw.returnFax, 64),
    returnEmail: str(raw.returnEmail, 191),
    officePhone: str(raw.officePhone, 64),
    serviceDate: str(raw.serviceDate, 64),
    noEarlierThan: str(raw.noEarlierThan, 64),
    issuanceDate: str(raw.issuanceDate, 64),
    attorneyBlock: strArr(raw.attorneyBlock, 12, 191),
    signRole: str(raw.signRole, 255),
    opposingCounsel: strArr(raw.opposingCounsel, 15, 191),
  };
}

/** Save (or update) a package. Word regenerates from the saved inputs. */
export async function saveDwqPackage(input: DwqInput, matter: string, id?: number) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const data = cleanInput(input);
    if (!data.entity.trim()) return { ok: false as const, error: "Name the witness entity." };
    if (id) {
      const [row] = await db.select({ id: dwqPackages.id }).from(dwqPackages).where(eq(dwqPackages.id, id));
      if (!row) return { ok: false as const, error: "Package not found." };
      await db.update(dwqPackages).set({ matter: str(matter, 64), entity: data.entity, data, updatedAt: new Date() }).where(eq(dwqPackages.id, id));
      await audit(session.email, "update", "dwq-package", String(id), `Updated DWQ package for ${data.entity}`);
      revalidatePath("/admin/litigation-support");
      return { ok: true as const, id };
    }
    const [row] = await db.insert(dwqPackages).values({ matter: str(matter, 64), entity: data.entity, data, createdBy: session.email }).returning({ id: dwqPackages.id });
    await audit(session.email, "create", "dwq-package", String(row.id), `Created DWQ package for ${data.entity}`);
    revalidatePath("/admin/litigation-support");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[lit-support] saveDwqPackage failed:", err);
    return { ok: false as const, error: "Couldn't save the package." };
  }
}

export async function deleteDwqPackage(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [row] = await db.select({ entity: dwqPackages.entity }).from(dwqPackages).where(eq(dwqPackages.id, id));
    if (!row) return { ok: false as const };
    await db.delete(dwqPackages).where(eq(dwqPackages.id, id));
    await audit(session.email, "delete", "dwq-package", String(id), `Deleted DWQ package for ${row.entity}`);
    revalidatePath("/admin/litigation-support");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

/** Build the Word document and hand it back for download (no storage —
 *  regenerate any time from the saved inputs). */
export async function generateDwqDoc(input: DwqInput) {
  await guard();
  try {
    const data = cleanInput(input);
    if (!data.entity.trim()) return { ok: false as const, error: "Name the witness entity." };
    const bytes = await buildDwqDocx(data);
    const safe = data.entity.replace(/[^A-Za-z0-9 _.-]/g, "").trim().slice(0, 60) || "witness";
    return {
      ok: true as const,
      filename: `DWQ - ${safe} - ${data.issuanceDate || new Date().toISOString().slice(0, 10)}.docx`,
      base64: Buffer.from(bytes).toString("base64"),
    };
  } catch (err) {
    console.error("[lit-support] generateDwqDoc failed:", err);
    return { ok: false as const, error: "Couldn't build the Word document." };
  }
}

/** Record a template-bank upload after the browser's direct Blob upload. */
export async function registerLitFile(meta: { filename: string; url: string; pathname?: string; contentType?: string; sizeBytes?: number; notes?: string }) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const filename = str(meta.filename, 255);
    const url = str(meta.url, 2000);
    if (!filename || !url.startsWith("https://")) return { ok: false as const, error: "Bad upload." };
    const [row] = await db.insert(litFiles).values({
      filename, url, pathname: str(meta.pathname, 1000) || null, contentType: str(meta.contentType, 128) || null,
      sizeBytes: Number.isFinite(Number(meta.sizeBytes)) ? Number(meta.sizeBytes) : null,
      notes: str(meta.notes, 500), uploadedBy: session.email,
    }).returning({ id: litFiles.id });
    await audit(session.email, "create", "lit-file", String(row.id), `Uploaded template "${filename}"`);
    revalidatePath("/admin/litigation-support");
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[lit-support] registerLitFile failed:", err);
    return { ok: false as const, error: "Couldn't record the upload." };
  }
}

export async function deleteLitFile(id: number) {
  const session = await guard();
  if (!db) return { ok: false as const };
  try {
    const [row] = await db.select().from(litFiles).where(eq(litFiles.id, id));
    if (!row) return { ok: false as const };
    if (row.pathname) { try { await del(row.pathname); } catch { /* best-effort */ } }
    await db.delete(litFiles).where(eq(litFiles.id, id));
    await audit(session.email, "delete", "lit-file", String(id), `Deleted template "${row.filename}"`);
    revalidatePath("/admin/litigation-support");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}
