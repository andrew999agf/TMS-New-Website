"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin, audit } from "@/lib/auth";
import type { ActiveTheme } from "@/lib/theme/css";

export async function saveTheme(theme: ActiveTheme): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!db) return { ok: false, error: "Database not configured." };

  try {
    await db
      .insert(settings)
      .values({ key: "theme", value: theme, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: theme, updatedAt: new Date() },
      });

    await audit(session.email, "theme", "settings", "theme", "Updated site theme", {
      color: theme.colorPaletteId,
      font: theme.fontPaletteId,
    });

    // The theme is read in the root layout on every route — revalidate broadly.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
