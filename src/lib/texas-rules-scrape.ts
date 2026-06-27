import "server-only";
import { TXCOURTS_RULES_URL, type TexasRule } from "./texas-rules";

/**
 * Best-effort scraper for the Texas Judicial Branch rules page. There's no API,
 * so we fetch the HTML and, for each rule we track, find the anchor whose text
 * matches the rule title and points at a PDF — updating that rule's PDF link and
 * (when found nearby) its "last amended" date. It NEVER clears existing data:
 * unmatched rules are left untouched, so a layout change or block just means
 * "no update," not data loss. Runs server-side (in the cron) where txcourts is
 * reachable.
 */
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(?:${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`);

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
function norm(s: string): string {
  return stripTags(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function absolutize(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://www.txcourts.gov${href}`;
  return href;
}

export interface ScrapeResult {
  rules: TexasRule[];
  changes: string[];
  fetched: boolean;
  error?: string;
}

export async function scrapeAndMergeRules(current: TexasRule[]): Promise<ScrapeResult> {
  let html = "";
  try {
    const res = await fetch(TXCOURTS_RULES_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) return { rules: current, changes: [], fetched: false, error: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { rules: current, changes: [], fetched: false, error: (e as Error).message };
  }

  // Collect every anchor as { href, text, index }.
  const anchors: { href: string; text: string; index: number }[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    anchors.push({ href: m[1], text: norm(m[2]), index: m.index });
  }

  const changes: string[] = [];
  const rules = current.map((rule) => {
    const target = norm(rule.title);
    if (target.length < 5) return rule;

    // The anchor whose visible text contains the full rule title and links to a PDF/media doc.
    const hit = anchors.find(
      (a) => (/\.pdf(\?|$)/i.test(a.href) || /\/media\//i.test(a.href)) && a.text.includes(target),
    );
    if (!hit) return rule;

    const next: TexasRule = { ...rule };
    const newPdf = absolutize(hit.href);
    if (newPdf && newPdf !== rule.pdfUrl) {
      next.pdfUrl = newPdf;
      changes.push(`${rule.title}: PDF link updated`);
    }
    // Date sitting just after the link in its table row.
    const dm = html.slice(hit.index, hit.index + 400).match(DATE_RE);
    if (dm) {
      const newDate = dm[0].replace(/\s+/g, " ").trim();
      if (newDate !== rule.lastAmended) {
        next.lastAmended = newDate;
        changes.push(`${rule.title}: date → ${newDate}`);
      }
    }
    return next;
  });

  return { rules, changes, fetched: true };
}
