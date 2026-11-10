import type { GlossaryTermSeed } from "./defaults/glossary";

/**
 * Wrap the first occurrence of each glossary term (or alias) in a post body
 * with a <span class="gloss" data-slug="..."> marker, so the client tooltip
 * component can attach definitions on hover/tap. Only operates on text outside
 * of HTML tags and existing anchors, so we never break markup or double-link.
 *
 * Several terms are also ordinary English words ("will", "trust", "answer",
 * "served", "damages", "limitations"). Those get a tooltip only where the
 * words around them show the legal sense — "a valid will", never "Texas will
 * enforce". A missed tooltip costs nothing; a wrong one makes the firm look
 * like it doesn't know the difference.
 */

type Rule = {
  /** The text right before the word must match one of these (tested against the preceding ~40 characters). */
  before?: RegExp;
  /** …or the text right after it must. */
  after?: RegExp;
  /** Never when the preceding text matches this. */
  notBefore?: RegExp;
  /** Never when the following text matches this. */
  notAfter?: RegExp;
};

/** Keyed by the matched phrase, lower-cased. A phrase with a rule is annotated
 *  only when `before` or `after` matches (if either is given) and neither
 *  `notBefore` nor `notAfter` does. */
const CONTEXT_RULES: Record<string, Rule> = {
  // The testament — not the verb, and not a "living will" (a different document).
  will: {
    before: /\b(?:a|the|your|his|her|their|no|valid|written|well-drafted|drafted|holographic|prior|new|old|decedent's|testator's|person's)\s+$/i,
    notBefore: /\bliving\s+$/i,
    notAfter: /^\s+(?:not|be|have|also|never|always|usually|often|still|then|only)\b/i,
  },
  // The legal arrangement — not confidence in someone.
  trust: {
    before: /\b(?:a|the|living|revocable|irrevocable|testamentary|family|land|charitable|your|his|her|their)\s+$/i,
    notAfter: /^\s+(?:between|among|in|of)\b/i,
  },
  // The pleading — not "the right answer".
  answer: {
    before: /\b(?:an|original|written|timely|deadline to|failed to|fails to|file an|filed an|filing an|file your|filed your)\s+$/i,
  },
  // Service of process — not "served as counsel" or "served the community".
  served: {
    before: /\b(?:being|been|was|were|are|is|get|got|gets|once|when|after|you're|you are)\s+$/i,
    after: /^\s+(?:with|papers|on you|by)\b/i,
    notAfter: /^\s+as\b/i,
  },
  citation: { notBefore: /\b(?:traffic|case|legal|statutory)\s+$/i },
  // The noun — not "that damages your credit".
  damages: { notAfter: /^\s+(?:your|his|her|their|its|our|my|the|a|an)\b/i },
  // The deadline to sue — not "reasonable limitations as to time".
  limitations: {
    before: /\b(?:statute of|by|the|of|on)\s+$/i,
    after: /^\s+(?:period|defense|deadline|bar)\b/i,
    notAfter: /^\s+(?:as to|on|in|of)\b/i,
  },
  discovery: { notAfter: /^\s+(?:of oil|of gas|of the body)\b/i },
  conversion: { notAfter: /^\s+(?:rate|to|into|of the)\b/i },
  venue: { notBefore: /\b(?:wedding|event|concert|music)\s+$/i },
  administrator: { notBefore: /\b(?:system|network|plan|database|court|school)\s+$/i },
  exemption: { notBefore: /\b(?:tax|medical|religious|vaccine)\s+$/i },
};

function allowed(phrase: string, before: string, after: string): boolean {
  const rule = CONTEXT_RULES[phrase.toLowerCase()];
  if (!rule) return true;
  if (rule.notBefore?.test(before) || rule.notAfter?.test(after)) return false;
  if (!rule.before && !rule.after) return true;
  return !!(rule.before?.test(before) || rule.after?.test(after));
}

export function annotateGlossary(html: string, terms: GlossaryTermSeed[]): string {
  if (!html || terms.length === 0) return html;

  // Build a lookup of phrase -> slug, longest phrases first to avoid partials.
  const entries: { phrase: string; slug: string }[] = [];
  for (const t of terms) {
    entries.push({ phrase: t.term, slug: t.slug });
    for (const a of t.aliases ?? []) entries.push({ phrase: a, slug: t.slug });
  }
  entries.sort((a, b) => b.phrase.length - a.phrase.length);

  const used = new Set<string>();

  // Split into tags vs text so we only annotate text nodes. Also skip the
  // contents of <a> and <h2> blocks.
  const tokens = html.split(/(<[^>]+>)/g);
  let insideAnchor = false;
  let insideHeading = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("<")) {
      const tag = tok.toLowerCase();
      if (tag.startsWith("<a")) insideAnchor = true;
      else if (tag.startsWith("</a")) insideAnchor = false;
      else if (/^<h[1-4]/.test(tag)) insideHeading = true;
      else if (/^<\/h[1-4]/.test(tag)) insideHeading = false;
      continue;
    }
    if (insideAnchor || insideHeading || !tok.trim()) continue;

    // Work on the plain text; collect non-overlapping spans, then splice once
    // (so a later phrase can never match inside markup we just inserted).
    const spans: { start: number; end: number; slug: string }[] = [];
    for (const { phrase, slug } of entries) {
      if (used.has(slug)) continue;
      const re = new RegExp(`\\b(${escapeRegex(phrase)})\\b`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(tok))) {
        const start = m.index, end = start + m[0].length;
        if (spans.some((s) => start < s.end && end > s.start)) continue; // inside a longer term already taken
        if (!allowed(phrase, tok.slice(Math.max(0, start - 40), start), tok.slice(end, end + 30))) continue;
        spans.push({ start, end, slug });
        used.add(slug);
        break;
      }
    }
    if (!spans.length) continue;
    spans.sort((a, b) => b.start - a.start);
    let text = tok;
    for (const s of spans) {
      text = text.slice(0, s.start) + `<span class="gloss" data-slug="${s.slug}" tabindex="0" role="button">${text.slice(s.start, s.end)}</span>` + text.slice(s.end);
    }
    tokens[i] = text;
  }

  return tokens.join("");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
