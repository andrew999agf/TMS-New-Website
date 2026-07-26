/**
 * Minimal HTML sanitizer for the recipient rich-text answer box. Recipients are
 * semi-trusted external users and their answers are shown back to the admin with
 * dangerouslySetInnerHTML, so we strip everything except a safe formatting
 * whitelist (bold / italic / underline / lists / highlight). No attributes
 * survive except a validated background-color on span/mark (the highlight), so
 * there is no room for event handlers, javascript: URLs, scripts, or styles.
 */

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "mark", "span"]);

export function sanitizeRichText(input: string): string {
  if (!input) return "";
  let s = input.slice(0, 20000);
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, close: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return "";
    if (close) return `</${t}>`;
    let keep = "";
    if (t === "span" || t === "mark") {
      const style = /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /style\s*=\s*'([^']*)'/i.exec(attrs)?.[1];
      if (style) {
        const bg = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)/.exec(style);
        if (bg) keep = ` style="background-color:${bg[1]}"`;
      }
    }
    return `<${t}${keep}>`;
  });
  return s.trim();
}

/** True when the sanitized HTML has any visible text (not just empty tags). */
export function hasRichText(html?: string): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}
