import type { GlossaryTermSeed } from "./defaults/glossary";

/**
 * Wrap the first occurrence of each glossary term (or alias) in a post body
 * with a <span class="gloss" data-slug="..."> marker, so the client tooltip
 * component can attach definitions on hover/tap. Only operates on text outside
 * of HTML tags and existing anchors, so we never break markup or double-link.
 */
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

    let text = tok;
    for (const { phrase, slug } of entries) {
      if (used.has(slug)) continue;
      const re = new RegExp(`\\b(${escapeRegex(phrase)})\\b`, "i");
      const m = re.exec(text);
      if (m && m.index >= 0) {
        used.add(slug);
        text =
          text.slice(0, m.index) +
          `<span class="gloss" data-slug="${slug}" tabindex="0" role="button">${m[1]}</span>` +
          text.slice(m.index + m[0].length);
      }
    }
    tokens[i] = text;
  }

  return tokens.join("");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
