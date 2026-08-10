"use server";

import { revalidatePath } from "next/cache";
import { eq, max, inArray } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { trialWitnesses, trialExhibits, trialClaims, trialElements, trialProofs, trialTranscripts } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";

async function guard() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/pre-trial", session.role, session.permissions)) throw new Error("Not allowed.");
  return session;
}

const str = (v: unknown, n = 191) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isoDate = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const oneOf = (v: unknown, allowed: string[], fallback: string) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return allowed.includes(s) ? s : fallback;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Next sort value within a case/parent, so new rows land at the end. */
async function nextSort(table: typeof trialWitnesses | typeof trialExhibits | typeof trialClaims | typeof trialTranscripts, caseId: number) {
  const [{ n } = { n: 0 }] = await db!.select({ n: max(table.sort) }).from(table).where(eq(table.caseId, caseId));
  return (n ?? 0) + 1;
}

const paths = (caseId: number) => {
  revalidatePath(`/admin/pre-trial/${caseId}`);
  revalidatePath(`/admin/pre-trial/${caseId}/proof`);
  revalidatePath(`/admin/pre-trial/${caseId}/evidence`);
  revalidatePath(`/admin/pre-trial/${caseId}/transcripts`);
};

/* -------------------------------- witnesses ------------------------------- */

export type WitnessInput = {
  name: string; side?: string; role?: string; phone?: string; email?: string;
  available?: string; appearance?: string; notes?: string;
};

export async function addWitness(caseId: number, input: WitnessInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a witness name." };
  try {
    await db.insert(trialWitnesses).values({
      caseId,
      name,
      side: oneOf(input.side, ["plaintiff", "defendant", "third-party"], "plaintiff"),
      role: str(input.role),
      phone: str(input.phone, 64),
      email: str(input.email, 255),
      available: oneOf(input.available, ["confirmed", "likely", "unavailable", "unknown"], "unknown"),
      appearance: oneOf(input.appearance, ["in-person", "zoom", "deposition"], "in-person"),
      notes: str(input.notes, 2000),
      sort: await nextSort(trialWitnesses, caseId),
    });
    await audit(session.email, "create", "trial-witness", String(caseId), `Added witness "${name}"`);
    paths(caseId);
    return { ok: true as const };
  } catch (err) {
    console.error("[pre-trial] addWitness failed:", err);
    return { ok: false as const, error: "Couldn't add the witness. Run Settings → Database updates first." };
  }
}

export async function updateWitness(id: number, input: WitnessInput) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const name = str(input.name);
  if (!name) return { ok: false as const, error: "Enter a witness name." };
  try {
    const [row] = await db
      .update(trialWitnesses)
      .set({
        name,
        side: oneOf(input.side, ["plaintiff", "defendant", "third-party"], "plaintiff"),
        role: str(input.role),
        phone: str(input.phone, 64),
        email: str(input.email, 255),
        available: oneOf(input.available, ["confirmed", "likely", "unavailable", "unknown"], "unknown"),
        appearance: oneOf(input.appearance, ["in-person", "zoom", "deposition"], "in-person"),
        notes: str(input.notes, 2000),
      })
      .where(eq(trialWitnesses.id, id))
      .returning({ caseId: trialWitnesses.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the witness." };
  }
}

/** Removing a witness detaches (never deletes) any proof entries citing them. */
export async function deleteWitness(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.update(trialProofs).set({ witnessId: null }).where(eq(trialProofs.witnessId, id));
    await db.update(trialTranscripts).set({ witnessId: null }).where(eq(trialTranscripts.witnessId, id));
    const [row] = await db.delete(trialWitnesses).where(eq(trialWitnesses.id, id)).returning({ caseId: trialWitnesses.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the witness." };
  }
}

/* -------------------------------- exhibits -------------------------------- */

export type ExhibitInput = {
  title: string; side?: string; number?: string; bates?: string;
  description?: string; status?: string; notes?: string;
  file?: { url: string; pathname: string; contentType?: string; size?: number };
};

export async function addExhibit(caseId: number, input: ExhibitInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const title = str(input.title, 255);
  if (!title) return { ok: false as const, error: "Enter an exhibit description." };
  try {
    await db.insert(trialExhibits).values({
      caseId,
      side: oneOf(input.side, ["plaintiff", "defendant", "joint"], "plaintiff"),
      number: str(input.number, 32),
      title,
      bates: str(input.bates, 128),
      description: str(input.description, 4000),
      status: oneOf(input.status, ["listed", "objected", "admitted", "excluded"], "listed"),
      url: input.file?.url ?? null,
      pathname: input.file?.pathname ?? null,
      contentType: input.file?.contentType ?? null,
      sizeBytes: num(input.file?.size),
      notes: str(input.notes, 2000),
      sort: await nextSort(trialExhibits, caseId),
    });
    await audit(session.email, "create", "trial-exhibit", String(caseId), `Added exhibit "${title}"`);
    paths(caseId);
    return { ok: true as const };
  } catch (err) {
    console.error("[pre-trial] addExhibit failed:", err);
    return { ok: false as const, error: "Couldn't add the exhibit. Run Settings → Database updates first." };
  }
}

export async function updateExhibit(id: number, input: ExhibitInput) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const title = str(input.title, 255);
  if (!title) return { ok: false as const, error: "Enter an exhibit description." };
  try {
    const set: Record<string, unknown> = {
      side: oneOf(input.side, ["plaintiff", "defendant", "joint"], "plaintiff"),
      number: str(input.number, 32),
      title,
      bates: str(input.bates, 128),
      description: str(input.description, 4000),
      status: oneOf(input.status, ["listed", "objected", "admitted", "excluded"], "listed"),
      notes: str(input.notes, 2000),
    };
    // Only replace the attachment when a fresh upload came with the save.
    if (input.file) {
      set.url = input.file.url;
      set.pathname = input.file.pathname;
      set.contentType = input.file.contentType ?? null;
      set.sizeBytes = num(input.file.size);
    }
    const [row] = await db.update(trialExhibits).set(set).where(eq(trialExhibits.id, id)).returning({ caseId: trialExhibits.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the exhibit." };
  }
}

export async function deleteExhibit(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [ex] = await db.select().from(trialExhibits).where(eq(trialExhibits.id, id));
    if (!ex) return { ok: false as const, error: "Not found." };
    if (ex.url) { try { await del(ex.url); } catch { /* best-effort */ } }
    await db.update(trialProofs).set({ exhibitId: null }).where(eq(trialProofs.exhibitId, id));
    await db.delete(trialExhibits).where(eq(trialExhibits.id, id));
    paths(ex.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the exhibit." };
  }
}

/* ------------------------- claims (causes of action) ---------------------- */

export async function addClaim(caseId: number, name: string, party?: string, isLead?: boolean) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = str(name, 255);
  if (!clean) return { ok: false as const, error: "Enter a cause of action." };
  try {
    const [row] = await db
      .insert(trialClaims)
      .values({ caseId, name: clean, party: oneOf(party, ["plaintiff", "defendant"], "plaintiff"), isLead: !!isLead, sort: await nextSort(trialClaims, caseId) })
      .returning({ id: trialClaims.id });
    await audit(session.email, "create", "trial-claim", String(caseId), `Added cause of action "${clean}"`);
    paths(caseId);
    return { ok: true as const, id: row.id };
  } catch (err) {
    console.error("[pre-trial] addClaim failed:", err);
    return { ok: false as const, error: "Couldn't add the cause of action. Run Settings → Database updates first." };
  }
}

export async function updateClaim(id: number, patch: { name?: string; party?: string; isLead?: boolean; notes?: string }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const n = str(patch.name, 255);
      if (!n) return { ok: false as const, error: "Enter a cause of action." };
      set.name = n;
    }
    if (patch.party !== undefined) set.party = oneOf(patch.party, ["plaintiff", "defendant"], "plaintiff");
    if (patch.isLead !== undefined) set.isLead = !!patch.isLead;
    if (patch.notes !== undefined) set.notes = str(patch.notes, 4000);
    if (!Object.keys(set).length) return { ok: true as const };
    const [row] = await db.update(trialClaims).set(set).where(eq(trialClaims.id, id)).returning({ caseId: trialClaims.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the cause of action." };
  }
}

/** Deleting a claim removes its elements and their proof entries. */
export async function deleteClaim(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [claim] = await db.select().from(trialClaims).where(eq(trialClaims.id, id));
    if (!claim) return { ok: false as const, error: "Not found." };
    const els = await db.select({ id: trialElements.id }).from(trialElements).where(eq(trialElements.claimId, id));
    if (els.length) {
      await db.delete(trialProofs).where(inArray(trialProofs.elementId, els.map((e) => e.id)));
      await db.delete(trialElements).where(eq(trialElements.claimId, id));
    }
    await db.delete(trialClaims).where(eq(trialClaims.id, id));
    paths(claim.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the cause of action." };
  }
}

/* -------------------------------- elements -------------------------------- */

export async function addElement(caseId: number, claimId: number, text: string) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const clean = str(text, 500);
  if (!clean) return { ok: false as const, error: "Enter the element." };
  try {
    const [{ n } = { n: 0 }] = await db.select({ n: max(trialElements.sort) }).from(trialElements).where(eq(trialElements.claimId, claimId));
    await db.insert(trialElements).values({ caseId, claimId, text: clean, sort: (n ?? 0) + 1 });
    paths(caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't add the element." };
  }
}

export async function updateElement(id: number, patch: { text?: string; notes?: string }) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const set: Record<string, unknown> = {};
    if (patch.text !== undefined) {
      const t = str(patch.text, 500);
      if (!t) return { ok: false as const, error: "Enter the element." };
      set.text = t;
    }
    if (patch.notes !== undefined) set.notes = str(patch.notes, 4000);
    if (!Object.keys(set).length) return { ok: true as const };
    const [row] = await db.update(trialElements).set(set).where(eq(trialElements.id, id)).returning({ caseId: trialElements.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the element." };
  }
}

export async function deleteElement(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    await db.delete(trialProofs).where(eq(trialProofs.elementId, id));
    const [row] = await db.delete(trialElements).where(eq(trialElements.id, id)).returning({ caseId: trialElements.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the element." };
  }
}

/* --------------------------------- proofs --------------------------------- */

export type ProofInput = {
  kind: string;               // exhibit | testimony
  exhibitId?: number | null;  // when kind = exhibit
  witnessId?: number | null;  // when kind = testimony
  citation?: string;
  summary?: string;
  anticipated?: boolean;
};

/** Attach an exhibit or a witness's testimony to an element. */
export async function addProof(caseId: number, elementId: number, input: ProofInput) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const kind = oneOf(input.kind, ["exhibit", "testimony"], "exhibit");
  const exhibitId = kind === "exhibit" ? num(input.exhibitId) : null;
  const witnessId = kind === "testimony" ? num(input.witnessId) : null;
  const citation = str(input.citation, 500);
  const summary = str(input.summary, 4000);
  // Require something identifiable — a link, a citation, or a description.
  if (!exhibitId && !witnessId && !citation && !summary) {
    return { ok: false as const, error: kind === "exhibit" ? "Pick an exhibit or type a citation." : "Pick a witness or type what they'll say." };
  }
  try {
    const [{ n } = { n: 0 }] = await db.select({ n: max(trialProofs.sort) }).from(trialProofs).where(eq(trialProofs.elementId, elementId));
    await db.insert(trialProofs).values({
      caseId, elementId, kind, exhibitId, witnessId, citation, summary,
      anticipated: !!input.anticipated,
      sort: (n ?? 0) + 1,
    });
    paths(caseId);
    return { ok: true as const };
  } catch (err) {
    console.error("[pre-trial] addProof failed:", err);
    return { ok: false as const, error: "Couldn't add the proof entry." };
  }
}

export async function updateProof(id: number, input: ProofInput) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const kind = oneOf(input.kind, ["exhibit", "testimony"], "exhibit");
  try {
    const [row] = await db
      .update(trialProofs)
      .set({
        kind,
        exhibitId: kind === "exhibit" ? num(input.exhibitId) : null,
        witnessId: kind === "testimony" ? num(input.witnessId) : null,
        citation: str(input.citation, 500),
        summary: str(input.summary, 4000),
        anticipated: !!input.anticipated,
      })
      .where(eq(trialProofs.id, id))
      .returning({ caseId: trialProofs.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the proof entry." };
  }
}

export async function deleteProof(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [row] = await db.delete(trialProofs).where(eq(trialProofs.id, id)).returning({ caseId: trialProofs.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the proof entry." };
  }
}

/* ------------------------------- transcripts ------------------------------ */

export type TranscriptInput = {
  title: string; kind?: string; witnessId?: number | null; takenOn?: string; notes?: string;
  file?: { url: string; pathname: string; contentType?: string; size?: number };
};

export async function addTranscript(caseId: number, input: TranscriptInput) {
  const session = await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const title = str(input.title, 255);
  if (!title) return { ok: false as const, error: "Enter a title." };
  try {
    await db.insert(trialTranscripts).values({
      caseId,
      kind: oneOf(input.kind, ["deposition", "statement", "hearing", "other"], "deposition"),
      title,
      witnessId: num(input.witnessId),
      takenOn: isoDate(input.takenOn),
      url: input.file?.url ?? null,
      pathname: input.file?.pathname ?? null,
      contentType: input.file?.contentType ?? null,
      sizeBytes: num(input.file?.size),
      notes: str(input.notes, 2000),
      sort: await nextSort(trialTranscripts, caseId),
    });
    await audit(session.email, "create", "trial-transcript", String(caseId), `Added transcript "${title}"`);
    paths(caseId);
    return { ok: true as const };
  } catch (err) {
    console.error("[pre-trial] addTranscript failed:", err);
    return { ok: false as const, error: "Couldn't add the transcript. Run Settings → Database updates first." };
  }
}

export async function updateTranscript(id: number, input: TranscriptInput) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  const title = str(input.title, 255);
  if (!title) return { ok: false as const, error: "Enter a title." };
  try {
    const set: Record<string, unknown> = {
      kind: oneOf(input.kind, ["deposition", "statement", "hearing", "other"], "deposition"),
      title,
      witnessId: num(input.witnessId),
      takenOn: isoDate(input.takenOn),
      notes: str(input.notes, 2000),
    };
    if (input.file) {
      set.url = input.file.url;
      set.pathname = input.file.pathname;
      set.contentType = input.file.contentType ?? null;
      set.sizeBytes = num(input.file.size);
    }
    const [row] = await db.update(trialTranscripts).set(set).where(eq(trialTranscripts.id, id)).returning({ caseId: trialTranscripts.caseId });
    if (row) paths(row.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't save the transcript." };
  }
}

export async function deleteTranscript(id: number) {
  await guard();
  if (!db) return { ok: false as const, error: "Database not configured." };
  try {
    const [t] = await db.select().from(trialTranscripts).where(eq(trialTranscripts.id, id));
    if (!t) return { ok: false as const, error: "Not found." };
    if (t.url) { try { await del(t.url); } catch { /* best-effort */ } }
    await db.delete(trialTranscripts).where(eq(trialTranscripts.id, id));
    paths(t.caseId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Couldn't remove the transcript." };
  }
}
