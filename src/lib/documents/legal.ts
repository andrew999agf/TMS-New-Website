import { FIELD_LABELS } from "./templates";
import type { Person, Gift, ResiduaryValue } from "@/lib/intake/config";

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
  /** Like f, but bold — used for party names and addresses (house style). */
  b: (token: string, label?: string) => string;
  /** Raw value or "" (no placeholder) — for conditional text. */
  raw: (token: string) => string;
  /** A party field (people) joined "A, of …, and B, of …"; placeholder if empty. */
  party: (token: string, label?: string) => string;
  /** A party field as an ordered list of alternates: "A, and then B." */
  partyOrder: (token: string) => string;
  /** A residuary field → "in equal shares to A and B" or "50% to A, 50% to B". */
  residuary: (token: string) => string;
  /** Specific gifts → one paragraph per gift; "" when there are none. */
  gifts: (token: string) => string;
  /** True if a party/gifts field has at least one entry. */
  has: (token: string) => boolean;
  /** People in a party field — for building appointment / witness blocks. */
  persons: (token: string) => { name: string; address: string; phone: string; html: string }[];
  /** A repeater/string-list field's values (e.g. children). */
  list: (token: string) => string[];
  /** Included optional provision HTML, or "" when excluded. */
  opt: (id: string) => string;
  /** The raw (possibly edited) optional-provision text, or "" when excluded. */
  optText: (id: string) => string;
};

/** Render a list of articles with sequential Roman numerals; empty bodies are skipped. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
export function buildArticles(items: { heading: string; html: string }[]): string {
  let n = 0;
  return items
    .filter((i) => i.html.trim())
    .map((i) => `<div class="article"><div class="art-n">${ROMAN[n++] ?? ""}.</div><div class="art-h">${esc(i.heading)}</div></div>${i.html}`)
    .join("");
}

const personStr = (p: Person, bold = true): string => {
  const name = (p?.name ?? "").trim();
  if (!name) return "";
  const n = bold ? `<strong>${esc(name)}</strong>` : esc(name);
  const addr = (p?.address ?? "").trim();
  return addr ? `${n}, of ${esc(addr)}` : n;
};

const joinAnd = (parts: string[]): string => {
  const xs = parts.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
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
    `<h1 class="doc-title">${esc(t)}</h1>${sub ? `<p class="doc-sub">${esc(sub)}</p>` : ""}<hr class="title-rule"/>`,
  recital: (html: string) => `<p class="recital">${html}</p>`,
  article: (numeral: string, heading: string) =>
    `<div class="article"><div class="art-n">${esc(numeral)}.</div><div class="art-h">${esc(heading)}</div></div>`,
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
  const peopleOf = (token: string): Person[] => {
    const v = answers[token];
    return Array.isArray(v) ? (v as Person[]).filter((p) => p && (p.name ?? "").trim()) : [];
  };
  const ph = (token: string, label?: string) => {
    if (!missing.includes(token)) missing.push(token);
    return `<span class="ph">[ ${esc(label ?? FIELD_LABELS[token] ?? token)} ]</span>`;
  };

  const ctx: DocBuildCtx = {
    f: (token, label) => {
      const v = val(token);
      if (v) return nl2br(v);
      return ph(token, label);
    },
    b: (token, label) => `<strong>${ctx.f(token, label)}</strong>`,
    raw: (token) => val(token),
    has: (token) => {
      const v = answers[token];
      if (!Array.isArray(v)) return Boolean(val(token));
      return v.some((x) => (x && typeof x === "object" && "name" in x ? (x as Person).name?.trim() : (x as Gift).item?.trim()));
    },
    party: (token, label) => {
      const ppl = peopleOf(token);
      if (!ppl.length) return ph(token, label);
      return joinAnd(ppl.map((p) => personStr(p)));
    },
    partyOrder: (token) => {
      const ppl = peopleOf(token);
      if (!ppl.length) return ph(token);
      return ppl.map((p) => personStr(p)).join(", and then ");
    },
    residuary: (token) => {
      const v = answers[token] as ResiduaryValue | undefined;
      const shares = v?.shares?.filter((s) => (s.person?.name ?? "").trim()) ?? [];
      if (!shares.length) return ph(token);
      if (v?.even) return `in equal shares to ${joinAnd(shares.map((s) => personStr(s.person)))}`;
      return shares.map((s) => `${esc((s.percent || "").trim() || "[ % ]")}% to ${personStr(s.person)}`).join(", ");
    },
    gifts: (token) => {
      const list = (answers[token] as Gift[] | undefined) ?? [];
      const valid = list.filter((g) => (g.item ?? "").trim() && g.to?.some((p) => (p.name ?? "").trim()));
      if (!valid.length) return "";
      return valid
        .map((g) => `<p class="body">I give ${esc(g.item.trim())} to ${joinAnd(g.to.filter((p) => (p.name ?? "").trim()).map((p) => personStr(p)))}.</p>`)
        .join("");
    },
    persons: (token) =>
      peopleOf(token).map((p) => ({ name: (p.name ?? "").trim(), address: (p.address ?? "").trim(), phone: (p.phone ?? "").trim(), html: personStr(p) })),
    list: (token) => {
      const v = answers[token];
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      const s = val(token);
      return s ? [s] : [];
    },
    optText: (id) => {
      const def = spec.optionals.find((p) => p.id === id);
      if (!def) return "";
      const chosen = optionals[id];
      if (chosen === false) return "";
      const text = typeof chosen === "string" ? chosen : def.defaultOn ? def.text : "";
      return text.trim() ? nl2br(text) : "";
    },
    opt: (id) => {
      const text = ctx.optText(id);
      if (!text) return "";
      const def = spec.optionals.find((p) => p.id === id)!;
      return `<p class="section"><span class="sec-h">${esc(def.label)}.</span> ${text}</p>`;
    },
  };
  return { body: spec.body(ctx), missing };
}

/* ------------------------------- CSS ------------------------------------- */

function legalCss(footerName: string): string {
  const f = esc(footerName);
  const SERIF = `"Century Schoolbook","Bookman Old Style",Georgia,'Times New Roman',serif`;
  return `
  :root { --ink:#141414; --muted:#555; }
  * { box-sizing:border-box; }
  body { margin:0; background:#ece9e3; }
  .page { max-width:8.5in; margin:24px auto; background:#fff; padding:1in 1in 1.1in; box-shadow:0 1px 8px rgba(0,0,0,.18);
    font-family:${SERIF}; font-size:9.6pt; line-height:1.34; color:var(--ink); }
  .doc-title { text-align:center; font-variant:small-caps; font-weight:600; font-size:13pt; letter-spacing:.04em; margin:4px 0 1px; }
  .doc-sub { text-align:center; font-variant:small-caps; font-size:10pt; letter-spacing:.03em; font-weight:400; margin:0 0 4px; }
  .doc-for { text-align:center; font-style:italic; font-size:9pt; margin:1px 0; }
  p.footnote { font-size:7.5pt; color:#3a3a3a; border-top:1px solid #bbb; margin-top:12px; padding-top:5px; text-align:justify; text-indent:0; line-height:1.25; }
  hr.title-rule { border:0; border-top:1px solid #999; margin:6px 0 16px; }
  .article { text-align:center; margin:14px 0 6px; }
  .art-n { font-size:9.6pt; }
  .art-h { display:block; font-weight:bold; font-size:9.6pt; }
  p.recital, p.body, p.section { text-align:justify; text-indent:.4in; margin:0 0 7px; }
  .sec-h { font-weight:bold; }
  ol.legal-ol { margin:0 0 7px 0; padding-left:.45in; list-style:lower-alpha; }
  ul.legal-ul { margin:0 0 7px 0; padding-left:.45in; }
  ol.legal-ol li, ul.legal-ul li { margin:0 0 6px; text-align:justify; padding-left:.1in; }
  strong { font-weight:bold; }
  .spacer { height:12px; }
  .two-col { display:flex; gap:.5in; }
  .two-col > .sig { flex:1; }
  .sig { margin:22px 0 4px; max-width:3.9in; }
  .sig-line { border-bottom:1px solid var(--ink); height:1px; margin-bottom:3px; }
  .addr-line { border-bottom:1px solid var(--ink); height:1px; margin:14px 0 4px; }
  .sig-name { font-weight:bold; }
  .sig-role { font-size:8pt; color:var(--muted); }
  /* Witness / jurat blocks */
  .jurat { margin:14px 0 6px; }
  .jurat .j-row { white-space:pre; }
  .jurat .j-left { display:inline-block; width:2.6in; }
  .wit { margin:0 0 14px; }
  .wit-row { display:flex; align-items:flex-end; gap:8px; margin:0 0 7px; }
  .wit-label { flex:0 0 1.3in; }
  .wit-line { flex:1; border-bottom:1px solid var(--ink); height:1.05em; }
  .notary { margin-top:16px; }
  .ph { background:#fff2b8; border-bottom:1px dashed #b8860b; padding:0 3px; font-style:italic; }
  @media print {
    body { background:#fff; }
    .page { box-shadow:none; margin:0; max-width:none; padding:0; }
    @page {
      size: letter; margin: 1in 1in 1.1in 1in;
      @bottom-left { content:"${f}"; font:9pt ${SERIF}; font-variant:small-caps; color:#333; }
      @bottom-center { content:"Initials ____________"; font:9pt ${SERIF}; color:#333; }
      @bottom-right { content:"Page " counter(page) " of " counter(pages); font:9pt ${SERIF}; font-variant:small-caps; color:#333; }
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
  const SERIF = `"Century Schoolbook","Bookman Old Style",Georgia,'Times New Roman',serif`;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>
  <meta charset="utf-8"/><title>${esc(spec.label)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    @page Section1 { size:8.5in 11.0in; margin:1.0in 1.0in 1.15in 1.0in; mso-header-margin:.5in; mso-footer-margin:.5in; mso-footer:f1; mso-paper-source:0; }
    div.Section1 { page:Section1; }
    body { font-family:${SERIF}; font-size:9.6pt; color:#141414; line-height:1.28; }
    .doc-title { text-align:center; font-variant:small-caps; font-weight:bold; font-size:13pt; letter-spacing:.04em; margin:4pt 0 1pt; }
    .doc-sub { text-align:center; font-variant:small-caps; font-size:10pt; margin:0 0 2pt; }
    .doc-for { text-align:center; font-style:italic; font-size:9pt; margin:1pt 0; }
    p.footnote { font-size:7.5pt; color:#3a3a3a; border-top:1px solid #bbb; margin-top:10pt; padding-top:4pt; text-align:justify; text-indent:0; }
    hr.title-rule { border:0; border-top:1px solid #999; margin:4pt 0 12pt; }
    .article { text-align:center; margin:12pt 0 5pt; }
    .art-n { display:block; } .art-h { display:block; font-weight:bold; }
    p.recital, p.body, p.section { text-align:justify; text-indent:.4in; margin:0 0 6pt; }
    ol.legal-ol { margin:0 0 6pt; }
    .sec-h { font-weight:bold; }
    .ph { background:#fff2b8; font-style:italic; }
    .sig-line, .wit-line, .addr-line { border-bottom:1px solid #141414; }
    .sig-role { font-size:8pt; color:#555; }
    .wit-row { margin:0 0 6pt; } .wit-label { display:inline-block; width:1.3in; }
    .jurat { margin:10pt 0 5pt; } .jurat .j-left { display:inline-block; width:2.6in; }
    .two-col { width:100%; } .two-col > .sig { display:inline-block; width:46%; }
    p.MsoFooter, li.MsoFooter, div.MsoFooter { margin:0; mso-tab-stops:center 3.25in right 6.5in; font-size:9pt; font-variant:small-caps; color:#333; border-top:.5pt solid #999; padding-top:3pt; }
  </style></head>
  <body><div class="Section1">${body}
    <div style='mso-element:footer' id=f1>
      <p class=MsoFooter><span>${f}</span><span style="mso-tab-count:1"></span>Initials ____________<span style="mso-tab-count:1"></span>Page <span style='mso-field-code:" PAGE "'></span> of <span style='mso-field-code:" NUMPAGES "'></span></p>
    </div>
  </div></body></html>`;
}
