import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * The people at a partner office (their intake staff), added on the partner's
 * tab in the admin. Their NAMES appear in a dropdown on that partner's intake
 * form; whoever is picked there is copied on the intake team's email for that
 * one lead. Nobody is copied automatically, and an email address is never
 * sent to the form. The link can also be emailed to them from the tab.
 *
 * Kept in the settings table, one entry per partner — no schema change.
 */
export type PartnerContact = { id: string; name: string; email: string; addedAt: string; linkSentAt?: string };

const keyFor = (slug: string) => `intake-partner-contacts:${slug}`;
export const MAX_PARTNER_CONTACTS = 25;

export async function getPartnerContacts(slug: string): Promise<PartnerContact[]> {
  if (!db) return [];
  try {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, keyFor(slug))).limit(1);
    const list = (row?.value as { contacts?: unknown } | undefined)?.contacts;
    if (!Array.isArray(list)) return [];
    return list
      .filter((c): c is PartnerContact => !!c && typeof c === "object" && typeof (c as PartnerContact).id === "string" && typeof (c as PartnerContact).email === "string")
      .map((c) => ({ id: c.id, name: String(c.name ?? ""), email: c.email, addedAt: String(c.addedAt ?? ""), ...(c.linkSentAt ? { linkSentAt: String(c.linkSentAt) } : {}) }));
  } catch {
    return [];
  }
}

export async function savePartnerContacts(slug: string, contacts: PartnerContact[]): Promise<void> {
  if (!db) throw new Error("Database not configured.");
  const value = { contacts };
  await db.insert(settings).values({ key: keyFor(slug), value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
