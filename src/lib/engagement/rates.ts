import "server-only";
import { getBlocks } from "@/lib/content";

/** The firm's standard hourly rates, set in the Intake tab. Rates typed
 *  below these render struck-through-then-reduced in the letter. */
export async function engagementDefaultRates(): Promise<{ attorneyRate: number; associateRate: number; staffRate: number }> {
  const b = await getBlocks("consultation");
  const n = (k: string, fallback: number) => {
    const v = parseFloat(b[k] ?? "");
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    attorneyRate: n("engagement.rate.attorney", 425),
    associateRate: n("engagement.rate.associate", 425),
    staffRate: n("engagement.rate.staff", 145),
  };
}
