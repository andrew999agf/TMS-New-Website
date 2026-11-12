import "server-only";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { docxToPdf } from "./docx2pdf";

/**
 * The Texas Mexico Law engagement letter as a PDF, made from the filled Word
 * file itself.
 *
 * The letter is two Word sections, English then Spanish, each with its own
 * first-page letterhead and its own page numbering. The converter prints one
 * section at a time, so the file is split at the section break, each half is
 * printed, and the two PDFs are joined — the Spanish half then starts on its
 * own letterhead page and numbers from 1 again, as it does in Word.
 */
async function splitSections(docx: Buffer): Promise<Buffer[]> {
  const zip = await JSZip.loadAsync(docx);
  const doc = await zip.file("word/document.xml")!.async("string");
  const bodyStart = doc.indexOf("<w:body>") + "<w:body>".length, bodyEnd = doc.lastIndexOf("</w:body>");
  const head = doc.slice(0, bodyStart), tail = doc.slice(bodyEnd), body = doc.slice(bodyStart, bodyEnd);
  const out: string[] = [];
  let rest = body;
  for (;;) {
    // A section break inside the body lives in the paragraph properties of the section's last paragraph.
    const at = rest.search(/<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<w:sectPr/);
    if (at < 0) break;
    const sectStart = rest.indexOf("<w:sectPr", at), sectEnd = rest.indexOf("</w:sectPr>", sectStart) + "</w:sectPr>".length;
    const paraEnd = rest.indexOf("</w:p>", sectEnd) + "</w:p>".length;
    const sect = rest.slice(sectStart, sectEnd);
    out.push(rest.slice(0, sectStart) + rest.slice(sectEnd, paraEnd) + sect);
    rest = rest.slice(paraEnd);
  }
  out.push(rest); // the last section ends with the body's own sectPr
  if (out.length === 1) return [docx];
  const files: Buffer[] = [];
  for (const sectionBody of out) {
    const z = await JSZip.loadAsync(docx);
    z.file("word/document.xml", head + sectionBody + tail);
    files.push(await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  return files;
}

/** @font-face rules for the fonts the Word file carries inside it, so the letterhead prints in them on any machine. */
async function embeddedFontCss(docx: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docx);
  const face = async (file: string, weight: number, style: string) => {
    const f = zip.file(`word/fonts/${file}`);
    if (!f) return "";
    const b64 = (await f.async("nodebuffer")).toString("base64");
    // "Century" is the name the footer asks for; the file carries Century Schoolbook, its text face.
    return ["Century Schoolbook", "Century"].map((family) => `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: ${style}; src: url(data:font/ttf;base64,${b64}) format("truetype"); }`).join("\n");
  };
  return (await Promise.all([face("CenturySchoolbook-regular.ttf", 400, "normal"), face("CenturySchoolbook-bold.ttf", 700, "normal"), face("CenturySchoolbook-italic.ttf", 400, "italic"), face("CenturySchoolbook-boldItalic.ttf", 700, "italic")])).join("\n");
}

export async function tmlLetterPdf(docx: Buffer): Promise<Buffer> {
  const [sections, extraCss] = await Promise.all([splitSections(docx), embeddedFontCss(docx)]);
  const merged = await PDFDocument.create();
  for (const section of sections) {
    const part = await PDFDocument.load(await docxToPdf(section, { tabStops: true, wideLetterheadTables: true, sectionMargins: true, extraCss }));
    for (const page of await merged.copyPages(part, part.getPageIndices())) merged.addPage(page);
  }
  return Buffer.from(await merged.save());
}
