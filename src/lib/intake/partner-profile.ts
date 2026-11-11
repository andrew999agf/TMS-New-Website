import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { IntakePartner } from "./partners";

/**
 * How a partner office appears on its own intake form: its logo and its
 * contact details. Both start from what is in the registry and can be changed
 * on the partner's tab in the admin. Kept in the settings table.
 *
 * Stored: { logoUrl?: string, contact?: string }
 *   logoUrl  absent = the starting logo · "" = no logo · otherwise the uploaded one
 *   contact  absent = the starting text · otherwise what was saved (may be empty)
 */
type Stored = { logoUrl?: string; contact?: string };
export type PartnerProfile = { logoUrl: string; logoIsOriginal: boolean; hasOriginalLogo: boolean; contact: string };

const keyFor = (slug: string) => `intake-partner-profile:${slug}`;
export const MAX_PARTNER_CONTACT_CHARS = 1500;

async function read(slug: string): Promise<Stored> {
  if (!db) return {};
  try {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, keyFor(slug))).limit(1);
    const v = (row?.value ?? {}) as Record<string, unknown>;
    return { ...(typeof v.logoUrl === "string" ? { logoUrl: v.logoUrl } : {}), ...(typeof v.contact === "string" ? { contact: v.contact } : {}) };
  } catch {
    return {};
  }
}

export async function getPartnerProfile(partner: IntakePartner): Promise<PartnerProfile> {
  const s = await read(partner.slug);
  const original = partner.logo ?? "";
  return {
    logoUrl: s.logoUrl ?? original,
    logoIsOriginal: s.logoUrl === undefined,
    hasOriginalLogo: !!original,
    contact: s.contact ?? partner.contact ?? "",
  };
}

/** `undefined` leaves a field alone; `null` puts it back to the starting value. */
export async function updatePartnerProfile(slug: string, change: { logoUrl?: string | null; contact?: string | null }): Promise<void> {
  if (!db) throw new Error("Database not configured.");
  const next: Stored = await read(slug);
  if (change.logoUrl === null) delete next.logoUrl; else if (change.logoUrl !== undefined) next.logoUrl = change.logoUrl;
  if (change.contact === null) delete next.contact; else if (change.contact !== undefined) next.contact = change.contact;
  await db.insert(settings).values({ key: keyFor(slug), value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
}
