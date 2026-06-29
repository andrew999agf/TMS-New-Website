import { FIELD_LABELS } from "./templates";

/**
 * Legal document engine. Each document is authored once as styled HTML through
 * a small set of clause helpers, then wrapped for the screen/PDF (print CSS
 * with a running footer) or for Word (a .doc that opens formatted in Microsoft
 * Word, with page numbers in the footer). Merge tokens pull from intake answers;
 * anything missing renders as a clearly marked placeholder. Optional provisions
 * are toggled (and editable) per generation. The goal is the polish a top-tier
 * firm would hand a client — not a plain text dump.
 */

export type OptionalProvision = {
  id: string;
  label: string;
  /** Default plain text for the provision; the user may edit before generating. */
  text: string;
  /** Included by default? */
  defaultOn: boolean;
};

export type DocBuildCtx = {
  /** Merge a field by token; records a placeholder when blank. */
  f: (token: string, label?: string) => string;
  /** Raw value or "" (no placeholder) — for conditional text. */
  raw: (token: string) => string;
  /** Included optional provision HTML, or "" when excluded. */
  opt: (id: string) => string;
};

export type DocSpec = {
  id: string;
  label: string;
  /** Short name shown in the page footer. */
  footerName: string;
  /** When an intake checked this option, the document is "requested". */
  trigger?: { field: string; value: string };
  /** Merge fields this document uses (for the reference panel). */
  fields: { token: string; label: string }[];
  optionals: OptionalProvision[];
  body: (c: DocBuildCtx) => string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const nl2br = (s: string) => esc(s).replace(/\r?\n/g, "<br/>");

/* ----------------------------- clause helpers ---------------------------- */

export const C = {
  title: (t: string, sub?: string) =>
    `<h1 class="doc-title">${esc(t)}</h1>${sub ? `<p class="doc-sub">${esc(sub)}</p>` : ""}`,
  recital: (html: string) => `<p class="recital">${html}</p>`,
  article: (numeral: string, heading: string) =>
    `<h2 class="article"><span class="art-n">ARTICLE ${esc(numeral)}</span><span class="art-h">${esc(heading)}</span></h2>`,
  section: (heading: string, html: string) =>
    `<p class="section"><span class="sec-h">${esc(heading)}.</span> ${html}</p>`,
  p: (html: string) => `<p class="body">${html}</p>`,
  ol: (items: string[]) => `<ol class="legal-ol">${items.map((i) => `<li>${i}</li>`).join("")}</ol>`,
  ul: (items: string[]) => `<ul class="legal-ul">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`,
  sign: (name: string, role: string) =>
    `<div class="sig"><div class="sig-line"></div><div class="sig-name">${name}</div><div class="sig-role">${esc(role)}</div></div>`,
  witnesses: () =>
    `<p class="body">The foregoing instrument was signed by the Testator in our presence, and we, at the Testator's request and in the Testator's presence and in the presence of each other, subscribe our names as attesting witnesses.</p>
     <div class="two-col">
       <div class="sig"><div class="sig-line"></div><div class="sig-role">Witness</div><div class="addr-line"></div><div class="sig-role">Address</div></div>
       <div class="sig"><div class="sig-line"></div><div class="sig-role">Witness</div><div class="addr-line"></div><div class="sig-role">Address</div></div>
     </div>`,
  notary: (county: string) =>
    `<div class="notary"><p class="body">STATE OF TEXAS &nbsp;&nbsp;&sect;<br/>COUNTY OF ${county} &nbsp;&nbsp;&sect;</p>
     <p class="body">This instrument was acknowledged before me on ____________________, by the person named above.</p>
     <div class="sig"><div class="sig-line"></div><div class="sig-role">Notary Public, State of Texas</div></div></div>`,
  spacer: () => `<div class="spacer"></div>`,
};

/* --------------------------- render a document --------------------------- */

export function renderDoc(
  spec: DocSpec,
  answers: Record<string, unknown>,
  optionals: Record<string, string | false>,
): { body: string; missing: string[] } {
  const missing: string[] = [];
  const val = (token: string): string => {
    const v = answers[token];
    return Array.isArray(v) ? v.filter(Boolean).join("; ") : v == null ? "" : String(v).trim();
  };
  const ctx: DocBuildCtx = {
    f: (token, label) => {
      const v = val(token);
      if (v) return nl2br(v);
      if (!missing.includes(token)) missing.push(token);
      return `<span class="ph">[ ${esc(label ?? FIELD_LABELS[token] ?? token)} ]</span>`;
    },
    raw: (token) => val(token),
    opt: (id) => {
      const def = spec.optionals.find((p) => p.id === id);
      if (!def) return "";
      const chosen = optionals[id];
      if (chosen === false) return "";
      const text = typeof chosen === "string" ? chosen : def.defaultOn ? def.text : "";
      if (!text.trim()) return "";
      return `<p class="section"><span class="sec-h">${esc(def.label)}.</span> ${nl2br(text)}</p>`;
    },
  };
  return { body: spec.body(ctx), missing };
}

/* ------------------------------- CSS ------------------------------------- */

function legalCss(footerName: string): string {
  const f = esc(footerName);
  return `
  :root { --ink:#14110f; --muted:#555; }
  * { box-sizing:border-box; }
  body { margin:0; background:#f3f1ec; }
  .page { max-width:7.5in; margin:24px auto; background:#fff; padding:1in; box-shadow:0 1px 6px rgba(0,0,0,.15);
    font-family:Georgia,'Times New Roman',serif; font-size:12.5pt; line-height:1.6; color:var(--ink); }
  .doc-title { text-align:center; font-size:16pt; letter-spacing:.06em; text-transform:uppercase; margin:0 0 4px; }
  .doc-sub { text-align:center; font-style:italic; color:var(--muted); margin:0 0 18px; }
  .article { text-align:center; margin:24px 0 8px; }
  .art-n { display:block; font-size:11.5pt; letter-spacing:.12em; }
  .art-h { display:block; font-weight:bold; text-transform:uppercase; letter-spacing:.04em; }
  p.recital { text-align:justify; text-indent:.4in; margin:0 0 12px; }
  p.body { text-align:justify; margin:0 0 11px; }
  p.section { text-align:justify; margin:0 0 11px; }
  .sec-h { font-weight:bold; }
  ol.legal-ol, ul.legal-ul { margin:0 0 11px 0; padding-left:.5in; text-align:justify; }
  ol.legal-ol li, ul.legal-ul li { margin:0 0 6px; }
  .spacer { height:14px; }
  .two-col { display:flex; gap:.5in; }
  .two-col > .sig { flex:1; }
  .sig { margin:26px 0 4px; }
  .sig-line { border-bottom:1px solid var(--ink); height:1px; margin-bottom:4px; }
  .addr-line { border-bottom:1px solid var(--ink); height:1px; margin:14px 0 4px; }
  .sig-name { font-weight:bold; }
  .sig-role { font-size:9.5pt; color:var(--muted); }
  .notary { margin-top:18px; }
  .ph { background:#fff2b8; border-bottom:1px dashed #b8860b; padding:0 3px; font-style:italic; }
  @media print {
    body { background:#fff; }
    .page { box-shadow:none; margin:0; max-width:none; padding:0; }
    @page {
      size: letter; margin: 1in 1in 1.1in 1in;
      @bottom-left { content:"${f}"; font:8pt Georgia; color:#555; }
      @bottom-center { content:"Initials: ____________"; font:8pt Georgia; color:#555; }
      @bottom-right { content:"Page " counter(page) " of " counter(pages); font:8pt Georgia; color:#555; }
    }
  }`;
}

/** Full self-contained HTML for on-screen preview and browser print → PDF. */
export function wrapForWeb(spec: DocSpec, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(spec.label)}</title><style>${legalCss(spec.footerName)}</style></head>
  <body><div class="page">${body}</div></body></html>`;
}

/**
 * Word-compatible (.doc) HTML: opens in Microsoft Word as a formatted, editable
 * document with a footer (document name, an initials line, and "Page X of Y").
 */
export function wrapForWord(spec: DocSpec, body: string): string {
  const f = esc(spec.footerName);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>
  <meta charset="utf-8"/><title>${esc(spec.label)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    @page Section1 { size:8.5in 11.0in; margin:1.0in 1.0in 1.0in 1.0in; mso-header-margin:.5in; mso-footer-margin:.5in; mso-footer:f1; mso-paper-source:0; }
    div.Section1 { page:Section1; }
    body { font-family:Georgia,'Times New Roman',serif; font-size:12.5pt; color:#14110f; line-height:1.55; }
    .doc-title { text-align:center; font-size:16pt; text-transform:uppercase; letter-spacing:.06em; }
    .doc-sub { text-align:center; font-style:italic; }
    .article { text-align:center; margin:20pt 0 6pt; }
    .art-n { display:block; letter-spacing:.1em; }
    .art-h { display:block; font-weight:bold; text-transform:uppercase; }
    p.recital, p.body, p.section { text-align:justify; margin:0 0 8pt; }
    .sec-h { font-weight:bold; }
    .ph { background:#fff2b8; font-style:italic; }
    .sig-line, .addr-line { border-bottom:1px solid #14110f; }
    .sig-role { font-size:9.5pt; color:#555; }
    .two-col { width:100%; } .two-col > .sig { display:inline-block; width:46%; }
    p.MsoFooter, li.MsoFooter, div.MsoFooter { margin:0; tab-stops:center 3.0in right 6.5in; font-size:8.5pt; color:#555; }
  </style></head>
  <body><div class="Section1">${body}
    <div style='mso-element:footer' id=f1>
      <p class=MsoFooter><span style='font-style:italic'>${f}</span><span style="mso-tab-count:1"></span>Initials: ____________<span style="mso-tab-count:1"></span>Page <span style='mso-field-code:" PAGE "'></span> of <span style='mso-field-code:" NUMPAGES "'></span></p>
    </div>
  </div></body></html>`;
}
