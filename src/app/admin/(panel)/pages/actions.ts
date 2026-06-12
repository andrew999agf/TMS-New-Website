"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contentBlocks } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import { CONTENT_BLOCKS } from "@/lib/content/defaults/blocks";

export async function saveBlocks(
  updates: { key: string; value: string }[],
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };

  const defaults = new Map(CONTENT_BLOCKS.map((b) => [b.key, b]));

  try {
    for (const u of updates) {
      const def = defaults.get(u.key);
      if (!def) continue;
      await db
        .insert(contentBlocks)
        .values({
          key: u.key,
          page: def.page,
          section: def.section,
          label: def.label,
          type: def.type,
          value: u.value,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: contentBlocks.key,
          set: { value: u.value, updatedAt: new Date() },
        });
    }
    await audit(session.email, "publish", "content", updates[0]?.key, `Updated ${updates.length} block(s)`);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
