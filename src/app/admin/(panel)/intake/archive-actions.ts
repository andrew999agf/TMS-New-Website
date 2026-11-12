"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, audit } from "@/lib/auth";
import { saveAutoArchiveRules } from "@/lib/intake/lead-archive";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** How long partner-office leads stay on the lists before they are archived automatically. 0 turns a rule off. */
export async function saveAutoArchive(input: { afterOutcomeDays: number; idleDays: number }): Promise<Result> {
  const session = await requireAdmin();
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 3650;
  if (!ok(input.afterOutcomeDays) || !ok(input.idleDays)) return { ok: false, error: "Enter whole numbers of days (0 turns a rule off)." };
  try {
    const saved = await saveAutoArchiveRules(input);
    await audit(session.email, "update", "intake", "auto-archive", `Automatic archiving: ${saved.afterOutcomeDays || "never"} days after an outcome, ${saved.idleDays || "never"} days idle`);
    revalidatePath("/admin/intake");
    return { ok: true, message: "Saved." };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
