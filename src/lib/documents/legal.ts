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
  /** Register a footnote; returns the superscript reference to place in the text. */
  footnote: (text: string) => string;
  /** People in a party field — for building appointment / witness blocks. */
  persons: (token: string) => { name: string; address: string; phone: string; html: string }[];
  /** A repeater/string-list field's values (e.g. children). */
  list: (token: string) => string[];
  /** Included optional provision HTML, or "" when excluded. */
  opt: (id: string) => string;
  /** The raw (possibly edited) optional-provision text, or "" when excluded. */
  optText: (id: string) => string;
};

/** Render a list of articles with sequential Roman numerals; empty bodies are skipped.
 *  `ref` (e.g. a footnote superscript) is appended to the heading unescaped. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
export function buildArticles(items: { heading: string; html: string; ref?: string }[]): string {
  let n = 0;
  return items
    .filter((i) => i.html.trim())
    .map((i) => `<div class="article"><div class="art-n">${ROMAN[n++] ?? ""}.</div><div class="art-h">${esc(i.heading)}${i.ref ?? ""}</div></div>${i.html}`)
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
): { body: string; missing: string[]; footnotes: string[] } {
  const missing: string[] = [];
  const footnotes: string[] = [];
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
    footnote: (text) => {
      footnotes.push(text);
      const n = footnotes.length;
      return `<sup class="fnref" data-n="${n}">${n}</sup>`;
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
  const body = spec.body(ctx);
  return { body, missing, footnotes };
}

/* ------------------------------- CSS ------------------------------------- */

const SERIF = `"Century","Century Schoolbook","Bookman Old Style",Georgia,'Times New Roman',serif`;

function legalCss(footerName: string, footerSub: string): string {
  const ident = footerSub ? `${esc(footerName)} of ${esc(footerSub)}` : esc(footerName);
  return `
  :root { --ink:#141414; --muted:#555; }
  * { box-sizing:border-box; }
  body { margin:0; background:#ece9e3; }
  .page { max-width:8.5in; margin:24px auto; background:#fff; padding:1in 1in 1.1in; box-shadow:0 1px 8px rgba(0,0,0,.18);
    font-family:${SERIF}; font-size:8.2pt; line-height:1.26; color:var(--ink); }
  .doc-title { text-align:center; font-variant:small-caps; font-weight:600; font-size:11pt; letter-spacing:.04em; margin:3px 0 1px; }
  .doc-sub { text-align:center; font-variant:small-caps; font-size:8.5pt; letter-spacing:.03em; font-weight:400; margin:0 0 4px; }
  .doc-for { text-align:center; font-style:italic; font-size:7.7pt; margin:1px 0; }
  sup.fnref { font-size:.72em; vertical-align:super; line-height:0; }
  .doc-fns { margin-top:18px; }
  p.footnote { font-size:7pt; color:#3a3a3a; border-top:1px solid #bbb; margin:6px 0 0; padding-top:4px; text-align:justify; text-indent:0; line-height:1.2; }
  hr.title-rule { border:0; border-top:1px solid #999; margin:5px 0 14px; }
  .article { text-align:center; margin:12px 0 5px; }
  .art-n { font-size:8.2pt; font-weight:bold; }
  .art-h { display:block; font-weight:bold; font-size:8.2pt; }
  p.recital, p.body, p.section { text-align:justify; text-indent:.4in; margin:0 0 6px; }
  .sec-h { font-weight:bold; }
  ol.legal-ol { margin:0 0 6px 0; padding-left:.45in; list-style:lower-alpha; }
  ul.legal-ul { margin:0 0 6px 0; padding-left:.45in; }
  ol.legal-ol li, ul.legal-ul li { margin:0 0 5px; text-align:justify; padding-left:.1in; }
  strong { font-weight:bold; }
  .spacer { height:10px; }
  .two-col { display:flex; gap:.5in; }
  .two-col > .sig { flex:1; }
  .sig { margin:20px 0 4px; max-width:3.9in; }
  .sig-line { border-bottom:1px solid var(--ink); height:1px; margin-bottom:3px; }
  .addr-line { border-bottom:1px solid var(--ink); height:1px; margin:13px 0 4px; }
  .sig-name { font-weight:bold; }
  .sig-role { font-size:7pt; color:var(--muted); }
  .jurat { margin:12px 0 5px; }
  .jurat .j-row { white-space:pre; }
  .jurat .j-left { display:inline-block; width:2.6in; }
  .wit { margin:0 0 12px; }
  .wit-row { display:flex; align-items:flex-end; gap:8px; margin:0 0 6px; }
  .wit-label { flex:0 0 1.3in; }
  .wit-line { flex:1; border-bottom:1px solid var(--ink); height:1.05em; }
  .notary { margin-top:14px; }
  .ph { background:#fff2b8; border-bottom:1px dashed #b8860b; padding:0 3px; font-style:italic; }
  @media print {
    body { background:#fff; }
    .page { box-shadow:none; margin:0; max-width:none; padding:0; }
    @page {
      size: letter; margin: 1in 1in 1.25in 1in;
      @bottom-left { content:"${ident}"; font:8pt ${SERIF}; font-variant:small-caps; letter-spacing:.04em; color:#222; vertical-align:bottom; }
      @bottom-center { content:"____________"; font:8pt ${SERIF}; color:#222; vertical-align:bottom; }
      @bottom-right { content:counter(page) " of " counter(pages); font:8pt ${SERIF}; font-variant:small-caps; letter-spacing:.04em; color:#222; vertical-align:bottom; }
    }
  }`;
}

/** Endnote/footnote block for the on-screen + PDF output. */
function footnotesHtml(footnotes: string[]): string {
  if (!footnotes.length) return "";
  return `<div class="doc-fns">${footnotes.map((t, i) => `<p class="footnote"><sup>${i + 1}</sup>&nbsp;${t}</p>`).join("")}</div>`;
}

/** Full self-contained HTML for on-screen preview and browser print → PDF. */
export function wrapForWeb(spec: DocSpec, body: string, footnotes: string[] = [], footerSub = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(spec.label)}</title><style>${legalCss(spec.footerName, footerSub)}</style></head>
  <body><div class="page">${body}${footnotesHtml(footnotes)}</div></body></html>`;
}

/**
 * Word-compatible (.doc) HTML: opens in Microsoft Word as a formatted, editable
 * document with real page-bottom footnotes and a footer (document name in small
 * caps on the left; an initials line above the dynamic page number on the right).
 */
export function wrapForWord(spec: DocSpec, body: string, footnotes: string[] = [], footerSub = ""): string {
  const f = esc(spec.footerName);
  const sub = footerSub ? esc(footerSub) : "";
  // Turn each <sup class="fnref" data-n="N">N</sup> into a real Word footnote reference.
  const refAnchor = (n: number) =>
    `<a style='mso-footnote-id:ftn${n}' href="#_ftn${n}" name="_ftnref${n}"><span class=MsoFootnoteReference><span style='mso-special-character:footnote'></span></span></a>`;
  const wordBody = body.replace(/<sup class="fnref" data-n="(\d+)">\d+<\/sup>/g, (_m, n) => refAnchor(Number(n)));
  const footnoteList = footnotes.length
    ? `<div style='mso-element:footnote-list'>${footnotes
        .map(
          (t, i) =>
            `<div style='mso-element:footnote' id=ftn${i + 1}><p class=MsoFootnoteText><a style='mso-footnote-id:ftn${i + 1}' href="#_ftnref${i + 1}" name="_ftn${i + 1}"><span class=MsoFootnoteReference><span style='mso-special-character:footnote'></span></span></a> ${t}</p></div>`,
        )
        .join("")}</div>`
    : "";
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>
  <meta charset="utf-8"/><title>${esc(spec.label)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    @page Section1 { size:8.5in 11.0in; margin:1.0in 1.0in 1.15in 1.0in; mso-header-margin:.5in; mso-footer-margin:.5in; mso-footer:f1; mso-paper-source:0; }
    div.Section1 { page:Section1; }
    body { font-family:${SERIF}; font-size:8.2pt; color:#141414; line-height:1.2; }
    .doc-title { text-align:center; font-variant:small-caps; font-weight:bold; font-size:11pt; letter-spacing:.04em; margin:3pt 0 1pt; }
    .doc-sub { text-align:center; font-variant:small-caps; font-size:8.5pt; margin:0 0 2pt; }
    .doc-for { text-align:center; font-style:italic; font-size:7.7pt; margin:1pt 0; }
    hr.title-rule { border:0; border-top:1px solid #999; margin:4pt 0 11pt; }
    .article { text-align:center; margin:11pt 0 5pt; }
    .art-n { display:block; font-weight:bold; } .art-h { display:block; font-weight:bold; }
    p.recital, p.body, p.section { text-align:justify; text-indent:.4in; margin:0 0 6pt; }
    ol.legal-ol { margin:0 0 6pt; }
    .sec-h { font-weight:bold; }
    .ph { background:#fff2b8; font-style:italic; }
    .sig-line, .wit-line, .addr-line { border-bottom:1px solid #141414; }
    .sig-role { font-size:7pt; color:#555; }
    .wit-row { margin:0 0 6pt; } .wit-label { display:inline-block; width:1.3in; }
    .jurat { margin:9pt 0 5pt; } .jurat .j-left { display:inline-block; width:2.6in; }
    .two-col { width:100%; } .two-col > .sig { display:inline-block; width:46%; }
    p.MsoFootnoteText { font-size:7pt; }
    p.MsoFooter, li.MsoFooter, div.MsoFooter { margin:0; font-size:8pt; font-variant:small-caps; letter-spacing:.04em; color:#222; }
    table.FooterTbl td { padding:3pt 0 0; vertical-align:top; }
  </style></head>
  <body><div class="Section1">${wordBody}
    <div style='mso-element:footer' id=f1>
      <table class=FooterTbl cellpadding=0 cellspacing=0 width="100%" style='width:100%;border-top:.75pt solid #888'>
        <tr>
          <td style='width:62%'><p class=MsoFooter>${f}${sub ? ` of` : ""}${sub ? `<br/>${sub}` : ""}</p></td>
          <td style='width:38%'><p class=MsoFooter style='text-align:right'>____________<br/>Page <span style='mso-field-code:" PAGE "'></span> of <span style='mso-field-code:" NUMPAGES "'></span></p></td>
        </tr>
      </table>
    </div>${footnoteList}
  </div></body></html>`;
}
