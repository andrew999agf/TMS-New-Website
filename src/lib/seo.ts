import { FIRM } from "@/lib/firm";

/**
 * One canonical address for the public site. Google already lists the firm
 * under www, so that is the host every canonical, sitemap entry and schema
 * id uses unless NEXT_PUBLIC_SITE_URL says otherwise. No trailing slash.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://www.${FIRM.domain}`).replace(/\/+$/, "");
export const ORG_ID = `${SITE_URL}/#organization`;
export const ATTORNEY_ID = `${SITE_URL}/#attorney`;
export const absUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
/** Drop a trailing " | <firm>" an editor typed into an SEO title — the template adds it. */
export const stripFirmSuffix = (t: string) => t.replace(new RegExp(`\\s*[|—–-]\\s*${FIRM.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();

/** Titles Google shows in full are about 60 characters including the firm's
 *  suffix, so the page's own part stays under ~50; cut at a word, never mid-word. */
export function clampTitle(t: string, max = 50): string {
  const s = t.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  // Prefer a natural break (colon, dash, pipe) in the back half; else the last word.
  const punct = Math.max(cut.lastIndexOf(":"), cut.lastIndexOf(" — "), cut.lastIndexOf(" | "), cut.lastIndexOf(" – "));
  const at = punct > max * 0.45 ? punct : cut.lastIndexOf(" ");
  return (at > max * 0.45 ? cut.slice(0, at) : cut.slice(0, max)).replace(/[\s—|,:;–-]+$/g, "").trim();
}

/** Meta descriptions: 50–155 characters, cut at a word with an ellipsis. */
export function clampDescription(t: string | undefined | null, fallback = ""): string {
  let s = (t ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || fallback;
  // A one-line summary ("Acquittal.") is too thin to stand alone in a result.
  if (s.length < 50 && fallback && s !== fallback) s = `${s.replace(/[.\s]+$/, "")}. ${fallback}`;
  if (s.length <= 155) return s;
  const cut = s.slice(0, 156);
  const at = cut.lastIndexOf(" ");
  return `${(at > 90 ? cut.slice(0, at) : cut.slice(0, 152)).replace(/[\s,;:—-]+$/g, "")}…`;
}
