import { getSetting } from "@/lib/content";
import { PATRIOT_PAGES_KEY, DEFAULT_PAGE_VISIBILITY, type PatriotPageKey } from "./settings";

/** Merged public-page visibility (saved overrides on top of the defaults). */
export async function getPageVisibility(): Promise<Record<PatriotPageKey, boolean>> {
  const saved = await getSetting<Partial<Record<PatriotPageKey, boolean>>>(PATRIOT_PAGES_KEY, {});
  return { ...DEFAULT_PAGE_VISIBILITY, ...(saved ?? {}) };
}
