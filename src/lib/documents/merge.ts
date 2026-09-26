import JSZip from "jszip";

/**
 * The template merge engine: works directly on a real .docx (a zip of XML),
 * so everything it does preserves the firm's formatting. Three jobs:
 *
 *  - extractDocxText: the document's plain text, paragraph per line — what
 *    AI.fred reads and what field detection scans.
 *  - detectFields: the {{merge_fields}} present in the document.
 *  - mergeDocx: fill fields and apply paragraph-level revisions. Untouched
 *    paragraphs are byte-identical. A rewritten paragraph keeps its paragraph
 *    style and its first run's character formatting (a mid-sentence style
 *    change inside a rewritten paragraph flattens to the dominant style —
 *    the documented trade-off).
 *
 * Deliberately dependency-light: JSZip (already in the project) plus regex
 * over document.xml. Word's XML is machine-written and regular enough for
 * the paragraph-scoped operations used here.
 */

const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
const TEXT_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const FIELD_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Plain text of one paragraph's XML (tabs and breaks become spaces). */
function paraText(xml: string): string {
  let out = "";
  let m: RegExpExecArray | null;
  TEXT_RE.lastIndex = 0;
  while ((m = TEXT_RE.exec(xml)) !== null) out += unescapeXml(m[1]);
  return out;
}

async function readDocumentXml(bytes: Uint8Array): Promise<{ zip: JSZip; xml: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Not a Word document (no word/document.xml).");
  return { zip, xml: await entry.async("string") };
}

/** The document's readable text, one paragraph per line. */
export async function extractDocxText(bytes: Uint8Array, maxChars = 40000): Promise<string> {
  const { xml } = await readDocumentXml(bytes);
  const paras = xml.match(PARA_RE) ?? [];
  const lines = paras.map(paraText);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
}

/** Unique {{merge_fields}} found in a text, in order of first appearance. */
export function detectFields(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

export type Revision = { find: string; replace: string };
export type MergeResult = {
  bytes: Uint8Array;
  filledFields: string[];
  missingFields: string[];
  appliedRevisions: number[];
  failedRevisions: number[];
};

/** Rebuild a paragraph with new text, keeping its paragraph properties and
 *  the character formatting of its first formatted run. */
function rewriteParagraph(paraXml: string, newText: string): string {
  if (/<w:p\b[^>]*\/>/.test(paraXml) && !paraXml.includes("</w:p>")) {
    // Self-closing empty paragraph — give it a body.
    const open = paraXml.replace(/\/>$/, ">");
    return `${open}<w:r><w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r></w:p>`;
  }
  const pPr = paraXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/)?.[0] ?? "";
  const rPr = paraXml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  const openTag = paraXml.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
  // Preserve intentional line breaks within the replacement text.
  const parts = newText.split("\n");
  const runs = parts
    .map((part, i) => `${i > 0 ? `<w:r>${rPr}<w:br/></w:r>` : ""}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`)
    .join("");
  return `${openTag}${pPr}${runs}</w:p>`;
}

/**
 * Fill {{fields}} and apply text revisions, paragraph by paragraph.
 * Field fills inside a single text run are done in place (formatting fully
 * intact); a paragraph whose placeholder is split across runs, or that a
 * revision touches, is rewritten via rewriteParagraph.
 */
export async function mergeDocx(bytes: Uint8Array, fields: Record<string, string>, revisions: Revision[] = []): Promise<MergeResult> {
  const { zip, xml } = await readDocumentXml(bytes);
  const filled = new Set<string>();
  const applied = new Set<number>();

  const fieldValue = (name: string): string | null =>
    Object.prototype.hasOwnProperty.call(fields, name) ? String(fields[name] ?? "") : null;

  const newXml = xml.replace(PARA_RE, (para) => {
    let text = paraText(para);
    if (!text) return para;

    // 1) In-run field fills (covers placeholders typed without style breaks).
    let out = para.replace(TEXT_RE, (whole, inner: string) => {
      const replacedInner = unescapeXml(inner).replace(FIELD_RE, (fm, name: string) => {
        const v = fieldValue(name);
        if (v == null) return fm;
        filled.add(name);
        return v;
      });
      return whole.replace(inner, escapeXml(replacedInner));
    });

    // 2) Placeholders split across runs, and revisions: paragraph rewrite.
    text = paraText(out);
    let rewritten = text;
    FIELD_RE.lastIndex = 0;
    if (FIELD_RE.test(rewritten)) {
      rewritten = rewritten.replace(FIELD_RE, (fm, name: string) => {
        const v = fieldValue(name);
        if (v == null) return fm;
        filled.add(name);
        return v;
      });
    }
    revisions.forEach((r, i) => {
      const find = (r.find ?? "").trim();
      if (!find) return;
      if (rewritten.includes(find)) {
        rewritten = rewritten.split(find).join(r.replace ?? "");
        applied.add(i);
      }
    });
    if (rewritten !== text) out = rewriteParagraph(out, rewritten);
    return out;
  });

  zip.file("word/document.xml", newXml);
  const outBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  const requested = Object.keys(fields);
  const allText = await extractDocxText(outBytes, 200000);
  const stillMissing = new Set(detectFields(allText));
  return {
    bytes: outBytes,
    filledFields: requested.filter((f) => filled.has(f)),
    missingFields: [...stillMissing],
    appliedRevisions: revisions.map((_, i) => i).filter((i) => applied.has(i)),
    failedRevisions: revisions.map((_, i) => i).filter((i) => !applied.has(i) && (revisions[i].find ?? "").trim() !== ""),
  };
}
