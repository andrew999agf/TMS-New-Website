import "server-only";

/**
 * Word table-of-contents generator for share folders.
 *
 * Produces a .doc (Word-formatted HTML, the same technique as the Document
 * Generator) styled like a Texas pleading: cause number, a party/court caption
 * with the § column, a centered small-caps title, then an organized index of
 * every document in the chosen folder — grouped by subfolder, numbered
 * straight through. Caption fields the folder doesn't have yet render as
 * fill-in blanks, so the document is always usable and never guesses.
 */

export type TocFolder = {
  name: string;
  caseNumber: string;
  court: string;
  county: string;
  plaintiff: string;
  defendant: string;
};

const SERIF = `"Century","Century Schoolbook","Bookman Old Style",Georgia,'Times New Roman',serif`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BLANK = "____________________";

/** Strip the extension for display — the index reads like a list of documents,
 *  not a directory dump. */
const displayName = (base: string) => base.replace(/\.[a-z0-9]{2,5}$/i, "");

/** Natural sort so "Exhibit 2" precedes "Exhibit 10". */
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function buildTocWordHtml(
  folder: TocFolder,
  scope: string, // "" = the whole folder; otherwise the subfolder path
  files: { filename: string; createdAt: Date | null }[],
  allDirs: string[],
  now: Date,
): { html: string; fileName: string } {
  /* ------------------------------ organize ------------------------------ */
  const prefix = scope ? `${scope}/` : "";
  const inScope = files
    .filter((f) => (scope ? f.filename.startsWith(prefix) : true))
    .map((f) => ({ rel: f.filename.slice(prefix.length), at: f.createdAt }));

  // Group by the subfolder path relative to the scope ("" = directly inside).
  const groups = new Map<string, { base: string; at: Date | null }[]>();
  for (const f of inScope) {
    const i = f.rel.lastIndexOf("/");
    const dir = i >= 0 ? f.rel.slice(0, i) : "";
    const base = i >= 0 ? f.rel.slice(i + 1) : f.rel;
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push({ base, at: f.at });
  }
  // Registered-but-empty subfolders still get a heading, so the index shows the
  // full shape of the folder.
  for (const d of allDirs) {
    const rel = scope ? (d === scope ? "" : d.startsWith(prefix) ? d.slice(prefix.length) : null) : d;
    if (rel === null || rel === "") continue;
    if (!groups.has(rel)) groups.set(rel, []);
  }
  const dirKeys = [...groups.keys()].sort((a, b) => natural(a, b));
  // Root files first, then subfolders in order.
  const ordered = ["", ...dirKeys.filter((k) => k !== "")].filter((k) => groups.has(k) || k === "");

  /* ------------------------------- caption ------------------------------ */
  const cause = folder.caseNumber.trim() ? esc(folder.caseNumber.trim().toUpperCase()) : `NO. ${BLANK}`;
  const causeLine = folder.caseNumber.trim() ? `CAUSE NO. ${cause.replace(/^(CAUSE\s+)?NO\.?\s*/i, "")}` : `CAUSE ${cause}`;
  const plaintiff = folder.plaintiff.trim() ? esc(folder.plaintiff.trim().toUpperCase()) : BLANK;
  const defendant = folder.defendant.trim() ? esc(folder.defendant.trim().toUpperCase()) : BLANK;
  const courtRaw = folder.court.trim();
  const courtLine = courtRaw
    ? `IN THE ${esc(courtRaw.toUpperCase().replace(/^IN THE\s+/i, ""))}`
    : `IN THE ${BLANK}`;
  const countyLine = folder.county.trim()
    ? `${esc(folder.county.trim().toUpperCase().replace(/\s+COUNTY.*$/i, ""))} COUNTY, TEXAS`
    : `${BLANK} COUNTY, TEXAS`;

  const S = `<td class="cap-s">&sect;</td>`;
  const caption = `
  <p class="cause">${causeLine}</p>
  <table class="caption" cellspacing="0" cellpadding="0">
    <tr><td class="cap-l">${plaintiff},</td>${S}<td class="cap-r">${courtLine}</td></tr>
    <tr><td class="cap-l cap-role">Plaintiff,</td>${S}<td class="cap-r"></td></tr>
    <tr><td class="cap-l">V.</td>${S}<td class="cap-r">${countyLine}</td></tr>
    <tr><td class="cap-l">${defendant},</td>${S}<td class="cap-r"></td></tr>
    <tr><td class="cap-l cap-role">Defendant.</td>${S}<td class="cap-r"></td></tr>
  </table>`;

  /* -------------------------------- index ------------------------------- */
  const scopeName = scope ? scope.split("/").pop()! : folder.name;
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let n = 0;
  const sections = ordered
    .map((dir) => {
      const rows = (groups.get(dir) ?? []).slice().sort((a, b) => natural(a.base, b.base));
      const heading = dir === ""
        ? (ordered.length > 1 ? `<p class="grp">${esc(scopeName.toUpperCase())}</p>` : "")
        : `<p class="grp">${esc(dir.split("/").join("  /  ").toUpperCase())}</p>`;
      if (rows.length === 0) {
        if (dir === "") return "";
        return `${heading}<p class="empty">(No documents.)</p>`;
      }
      const trs = rows
        .map((r) => {
          n++;
          const when = r.at ? new Date(r.at).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
          return `<tr><td class="i-n">${n}.</td><td class="i-doc">${esc(displayName(r.base))}</td><td class="i-date">${when}</td></tr>`;
        })
        .join("\n");
      return `${heading}
      <table class="idx" cellspacing="0" cellpadding="0">
        <tr class="idx-h"><td class="i-n">NO.</td><td class="i-doc">DOCUMENT</td><td class="i-date">DATE</td></tr>
        ${trs}
      </table>`;
    })
    .filter(Boolean)
    .join("\n");

  const body = `
  ${caption}
  <hr class="cap-rule"/>
  <p class="doc-title">TABLE OF CONTENTS</p>
  <p class="doc-sub">${esc(scopeName)}${scope ? ` &mdash; ${esc(folder.name)}` : ""}</p>
  <p class="doc-for">${n} document${n === 1 ? "" : "s"} &middot; as of ${esc(dateStr)}</p>
  <hr class="title-rule"/>
  ${sections || `<p class="empty">(No documents in this folder yet.)</p>`}`;

  const footer = esc(`Table of Contents — ${scopeName}`);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head>
  <meta charset="utf-8"/><title>Table of Contents — ${esc(scopeName)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    @page Section1 { size:8.5in 11.0in; margin:1.0in 1.0in 1.15in 1.0in; mso-header-margin:.5in; mso-footer-margin:.5in; mso-footer:f1; mso-paper-source:0; }
    div.Section1 { page:Section1; }
    body { font-family:${SERIF}; font-size:12pt; color:#141414; line-height:1.25; }
    p.cause { text-align:center; font-weight:bold; margin:0 0 14pt; }
    table.caption { width:100%; }
    td.cap-l { width:44%; vertical-align:top; padding:0 0 2pt; }
    td.cap-l.cap-role { padding-left:.5in; font-style:normal; }
    td.cap-s { width:6%; text-align:center; vertical-align:top; }
    td.cap-r { width:50%; vertical-align:top; padding:0 0 2pt 10pt; }
    hr.cap-rule { border:0; margin:10pt 0 0; }
    .doc-title { text-align:center; font-variant:small-caps; font-weight:bold; font-size:15pt; letter-spacing:.04em; margin:14pt 0 1pt; }
    .doc-sub { text-align:center; font-variant:small-caps; font-size:12pt; margin:0 0 2pt; }
    .doc-for { text-align:center; font-style:italic; font-size:10.8pt; margin:1pt 0; }
    hr.title-rule { border:0; border-top:1px solid #999; margin:4pt 0 12pt; }
    p.grp { font-weight:bold; font-variant:small-caps; letter-spacing:.03em; margin:12pt 0 4pt; }
    p.empty { font-style:italic; color:#555; margin:0 0 8pt; text-indent:.25in; }
    table.idx { width:100%; margin:0 0 6pt; }
    tr.idx-h td { font-size:9.5pt; font-weight:bold; letter-spacing:.05em; color:#444; border-bottom:1px solid #141414; padding:0 4pt 2pt; }
    td.i-n { width:.55in; vertical-align:top; padding:3pt 4pt; }
    td.i-doc { vertical-align:top; padding:3pt 4pt; }
    td.i-date { width:1.1in; vertical-align:top; padding:3pt 4pt; white-space:nowrap; }
    table.idx td { border-bottom:.75pt solid #d8d2c6; }
    p.MsoFooter, li.MsoFooter, div.MsoFooter { margin:0; font-size:9.5pt; font-variant:small-caps; letter-spacing:.04em; color:#222; mso-tab-stops:right 6.5in; }
  </style></head>
  <body><div class="Section1">${body}
    <div style='mso-element:footer' id=f1>
      <p class=MsoFooter style='border-top:.75pt solid #888;padding-top:3.0pt;mso-tab-stops:right 6.5in'>${footer}<span style='mso-tab-count:1'></span>Page <span style='mso-field-code:" PAGE "'></span> of <span style='mso-field-code:" NUMPAGES "'></span></p>
    </div>
  </div></body></html>`;

  const safe = scopeName.replace(/[\\/:*?"<>|]/g, "-").trim() || "folder";
  return { html, fileName: `Table of Contents — ${safe}.doc` };
}
