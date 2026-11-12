import "server-only";
import JSZip from "jszip";
import { TML_TEMPLATE_B64 } from "./tml-template-docx";
import { type ContractData, longDateEn, longDateEs, money, resolvedStartWhen, taskLines, weekdayEn, weekdayEs } from "./tml-fields";

/**
 * Fills the Texas Mexico Law engagement letter. The attorney's Word file is
 * the template: only the text of its yellow [BRACKETED] blanks is replaced,
 * inside word/document.xml, so the letterhead, footers, numbering, fonts and
 * spacing stay exactly as drafted.
 *
 * A downloaded letter is always finished. Nothing is ever left bracketed or
 * highlighted: an optional part that was not filled in (a specific task, a
 * payment plan, a minimum balance, a trial retainer, the court) is left out
 * so the letter still reads, and any other field left empty prints as blank.
 */
const T_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const P_RE = /(<w:p[ >][\s\S]*?<\/w:p>)/;
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textOf = (p: string) => [...p.matchAll(T_RE)].map((m) => m[1]).join("");
const HL = '<w:highlight w:val="yellow"/>';

/**
 * Replace the nth occurrence of `token` in a paragraph's text with `value`,
 * even when Word has split the token across several runs: the value goes into
 * the first run the token touches and the rest of the token is removed from
 * the others. Formatting of every run is left alone.
 */
function replaceToken(p: string, token: string, value: string, nth = 0): string {
  const nodes = [...p.matchAll(T_RE)].map((m) => ({ at: m.index!, len: m[0].length, text: m[1] }));
  const joined = nodes.map((n) => n.text).join("");
  let hit = -1;
  for (let i = 0, from = 0; i <= nth; i++) { hit = joined.indexOf(token, from); if (hit < 0) return p; from = hit + token.length; }
  const end = hit + token.length;
  let pos = 0, placed = false, out = p;
  const edits: { at: number; len: number; text: string }[] = [];
  for (const n of nodes) {
    const s = pos, e = pos + n.text.length; pos = e;
    if (e <= hit || s >= end) continue;
    const before = n.text.slice(0, Math.max(0, hit - s)), after = n.text.slice(Math.min(n.text.length, end - s));
    edits.push({ at: n.at, len: n.len, text: before + (placed ? "" : xml(value)) + after }); placed = true;
  }
  for (const ed of edits.reverse()) out = `${out.slice(0, ed.at)}<w:t xml:space="preserve">${ed.text}</w:t>${out.slice(ed.at + ed.len)}`;
  return out;
}

const RUN_FONT = '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>';
const run = (text: string, strike = false) => `<w:r><w:rPr>${RUN_FONT}${strike ? '<w:strike w:val="1"/>' : ""}<w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const num = (v: string) => Number(String(v).replace(/[$,\s]/g, ""));

export type FilledLetter = { buffer: Buffer };

export async function buildTmlLetter(d: ContractData): Promise<FilledLetter> {
  const zip = await JSZip.loadAsync(Buffer.from(TML_TEMPLATE_B64, "base64"));
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("The letter template is missing its document part.");
  const parts = (await file.async("string")).split(P_RE); // odd indexes are paragraphs
  const paras = () => parts.map((x, i) => i).filter((i) => i % 2 === 1);
  // Every placeholder the template itself contains — the only bracketed text the final sweep may clear.
  const placeholders = [...new Set(paras().flatMap((i) => textOf(parts[i]).match(/\[[^\]]{2,}\]/g) ?? []))];
  const find = (test: (text: string) => boolean, from = 0) => paras().find((i) => i >= from && test(textOf(parts[i]))) ?? -1;
  const fill = (i: number, token: string, value: string, nth = 0) => { if (i >= 0 && value) parts[i] = replaceToken(parts[i], token, value, nth); };
  const cut = (i: number, text: string) => { if (i >= 0) parts[i] = replaceToken(parts[i], text, ""); };
  const drop = (i: number) => { if (i >= 0) parts[i] = ""; };
  const everywhere = (token: string, value: string) => {
    for (const i of paras()) for (let guard = 0; guard < 20 && textOf(parts[i]).includes(token); guard++) { parts[i] = replaceToken(parts[i], token, value); if (value.includes(token)) break; }
  };
  const everywhereIf = (token: string, value: string) => { if (value) everywhere(token, value); };
  /** Fill a one-blank line, or remove the line when there is nothing to put on it. */
  const lineOrDrop = (test: (t: string) => boolean, token: string, value: string) => { for (const i of paras().filter((k) => test(textOf(parts[k])))) { if (value) parts[i] = replaceToken(parts[i], token, value); else drop(i); } };

  // ----- who it is addressed to (the same in both halves)
  fill(find((t) => t === "[DATE]"), "[DATE]", longDateEn(d.date));
  fill(find((t) => t === "[FECHA]"), "[FECHA]", longDateEs(d.date));
  lineOrDrop((t) => t.includes("[client email]"), "[client email]", d.clientEmail); lineOrDrop((t) => t.includes("[correo del cliente]"), "[correo del cliente]", d.clientEmail);
  everywhereIf("[CLIENT NAME]", d.clientName); everywhereIf("[NOMBRE DEL CLIENTE]", d.clientName);
  lineOrDrop((t) => t === "[STREET ADDRESS]", "[STREET ADDRESS]", d.street); lineOrDrop((t) => t === "[DIRECCIÓN]", "[DIRECCIÓN]", d.street);
  const cityLine = [[d.city, d.state].filter(Boolean).join(", "), d.zip].filter(Boolean).join(" ");
  const hasCity = !!(d.city || d.zip);
  lineOrDrop((t) => t === "[CITY], [STATE] [ZIP]", "[CITY], [STATE] [ZIP]", hasCity ? cityLine : ""); lineOrDrop((t) => t === "[CIUDAD], [ESTADO] [CÓDIGO POSTAL]", "[CIUDAD], [ESTADO] [CÓDIGO POSTAL]", hasCity ? cityLine : "");
  const greet = d.title && d.lastName ? { en: `${d.title} ${d.lastName}`, es: `${d.title === "Mr." ? "Sr." : "Sra."} ${d.lastName}` } : d.clientName ? { en: d.clientName, es: d.clientName } : null;
  if (greet) { everywhere("[Mr./Ms.] [CLIENT LAST NAME]", greet.en); everywhere("[Sr./Sra.] [APELLIDO DEL CLIENTE]", greet.es); }

  // ----- the RE line: with no court, it shows the matter and the county
  const reEn = find((t) => t.includes("[CASE STYLE / MATTER]")), reEs = find((t) => t.includes("[NOMBRE DEL CASO / ASUNTO]"));
  if (d.noCourt || !d.court) { cut(reEn, "[COURT], "); cut(reEs, "; [TRIBUNAL]"); }
  else { fill(reEn, "[COURT]", d.court); fill(reEs, "[TRIBUNAL]", d.court); }
  fill(reEn, "[CASE STYLE / MATTER]", d.caseStyle); fill(reEs, "[NOMBRE DEL CASO / ASUNTO]", d.caseStyle);
  fill(reEn, "[COUNTY]", d.county); fill(reEs, "[CONDADO]", d.county);

  // ----- scope
  everywhereIf("[DESCRIBE MATTER]", d.matterEn.replace(/[.\s]+$/, "")); everywhereIf("[DESCRIBIR EL ASUNTO]", d.matterEs.replace(/[.\s]+$/, ""));
  lineOrDrop((t) => t.includes("[MATTER TYPE]"), "[MATTER TYPE]", d.matterTypeEn.replace(/[:\s]+$/, "")); lineOrDrop((t) => t.includes("[TIPO DE ASUNTO]"), "[TIPO DE ASUNTO]", d.matterTypeEs.replace(/[:\s]+$/, ""));
  // One list item per task: the template's own paragraph is repeated, so each keeps its number and
  // indent. With no task, the item is removed and the three standard items renumber from 1.
  const tasks = (marker: string, lines: string[]) => {
    const i = find((t) => t.includes(marker));
    if (i < 0) return;
    const token = textOf(parts[i]).match(/\[[^\]]+\]/)?.[0];
    parts[i] = token && lines.length ? lines.map((l) => replaceToken(parts[i], token, l)).join("") : "";
  };
  tasks("[SPECIFIC TASK", taskLines(d.tasksEn)); tasks("[TAREA ESPECÍFICA", taskLines(d.tasksEs));
  // Other exclusions: with none, the blank and its comma come out and the sentence still reads.
  const exEn = find((t) => t.includes("[OTHER EXCLUSIONS]")), exEs = find((t) => t.includes("[OTRAS EXCLUSIONES]"));
  if (exEn >= 0) parts[exEn] = d.exclusionsEn ? replaceToken(parts[exEn], "[OTHER EXCLUSIONS]", d.exclusionsEn.replace(/[.,;\s]+$/, "")) : replaceToken(parts[exEn], "[OTHER EXCLUSIONS], ", "");
  if (exEs >= 0) parts[exEs] = d.exclusionsEs ? replaceToken(parts[exEs], "[OTRAS EXCLUSIONES]", `${d.exclusionsEs.replace(/[.,;\s]+$/, "")},`) : replaceToken(parts[exEs], ", [OTRAS EXCLUSIONES]", "");

  // ----- fees
  const feeEn = find((t) => t.includes("Retainer fee of $")), feeEs = find((t) => t.includes("Anticipo de $"));
  if (d.minBalance) { fill(feeEn, "[AMOUNT]", money(d.minBalance), 1); fill(feeEs, "[MONTO]", money(d.minBalance), 1); } // the second blank first, so the first one's position never shifts
  else { cut(feeEn, ", and a minimum balance of $[AMOUNT] must be maintained in the Client’s trust account"); cut(feeEs, ", y se debe mantener un saldo mínimo de $[MONTO] en la cuenta fiduciaria del Cliente"); }
  fill(feeEn, "[AMOUNT]", money(d.retainer), 0); fill(feeEs, "[MONTO]", money(d.retainer), 0);
  // The payment plan: one row per payment, or — with no plan — neither the rows nor the sentence that introduces them.
  const schedule = (rowText: string, intro: string, dateTok: string, amtTok: string, fmt: (s: string) => string) => {
    const rows = paras().filter((i) => textOf(parts[i]) === rowText);
    if (rows.length === 0) return;
    if (d.schedule.length === 0) { drop(find((t) => t.startsWith(intro))); for (const i of rows) drop(i); return; }
    const model = parts[rows[0]];
    parts[rows[0]] = d.schedule.map((r) => { let p = model; if (r.date) p = replaceToken(p, dateTok, fmt(r.date)); if (r.amount) p = replaceToken(p, amtTok, money(r.amount)); return p; }).join("");
    for (const i of rows.slice(1)) drop(i);
  };
  schedule("[DATE] – $[AMOUNT]", "The retainer is to be paid on the following schedule", "[DATE]", "[AMOUNT]", longDateEn);
  schedule("[FECHA] – $[MONTO]", "El anticipo se pagará conforme al siguiente calendario", "[FECHA]", "[MONTO]", longDateEs);
  // Hourly rates: the standard rate struck through beside the rate charged, or just the rate when they are the same.
  const rateRows = paras().filter((i) => /^\$[\d,.]+ \/ (hour|hora)(\s+\$[\d,.]+ \/ (hour|hora))?$/.test(textOf(parts[i])));
  rateRows.forEach((i, n) => {
    const unit = textOf(parts[i]).includes("hora") ? "hora" : "hour", which = n % 3;
    const charged = which === 0 ? d.attorneyRate : which === 1 ? d.associateRate : d.staffRate, standard = which === 0 ? d.standardAttorneyRate : which === 1 ? d.standardAssociateRate : "";
    if (!Number.isFinite(num(charged)) || charged.trim() === "") return;
    const body = standard && Number.isFinite(num(standard)) && num(standard) > num(charged) ? run(`$${money(standard)} / ${unit}`, true) + run(`  $${money(charged)} / ${unit}`) : run(`$${money(charged)} / ${unit}`);
    const head = parts[i].match(/^<w:p[ >][^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?/)?.[0];
    if (head) parts[i] = `${head}${body}</w:p>`;
  });
  const START = { full: ["the retainer has been paid in full", "el anticipo se haya pagado en su totalidad"], first: ["the first scheduled payment has been received", "se haya recibido el primer pago programado"] } as const;
  const start = START[resolvedStartWhen(d)];
  everywhere("[the retainer has been paid in full / the first scheduled payment has been received]", start[0]); everywhere("[el anticipo se haya pagado en su totalidad / se haya recibido el primer pago programado]", start[1]);
  if (d.openUntil) { everywhere("[DAY], [DATE]", `${weekdayEn(d.openUntil)}, ${longDateEn(d.openUntil)}`); everywhere("[DÍA], [FECHA]", `${weekdayEs(d.openUntil)}, ${longDateEs(d.openUntil)}`); }
  // Trial retainer: with none, the paragraph goes, and so does the initials line that belongs to it.
  const trial = (marker: string, token: string, initials: RegExp) => {
    const i = find((t) => t.includes(marker));
    if (i < 0) return;
    if (d.trialRetainer) { fill(i, token, money(d.trialRetainer)); return; }
    drop(i);
    const next = paras().find((k) => k > i && textOf(parts[k]).trim() !== "");
    if (next !== undefined && initials.test(textOf(parts[next]))) drop(next);
  };
  trial("Trial Retainer of $", "[AMOUNT]", /^client initials/i); trial("Anticipo para Juicio de $", "[MONTO]", /^iniciales del cliente/i);

  // ----- associated counsel is optional: with none, the phrase comes out
  if (d.associatedCounsel) { everywhere("[ASSOCIATED COUNSEL]", d.associatedCounsel); everywhere("[ABOGADO ASOCIADO]", d.associatedCounsel); }
  else { everywhere(", including [ASSOCIATED COUNSEL],", ""); everywhere(", incluido [ABOGADO ASOCIADO],", ""); }

  // ----- finish: anything still unfilled prints as blank, and no highlight is left anywhere
  for (const i of paras()) for (const token of placeholders) for (let guard = 0; guard < 20 && textOf(parts[i]).includes(token); guard++) parts[i] = replaceToken(parts[i], token, "");
  zip.file("word/document.xml", parts.join("").split(HL).join(""));
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) };
}

export function tmlLetterFileName(d: Pick<ContractData, "clientName" | "date">, ext: "docx" | "pdf"): string {
  const who = (d.clientName || "Client").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `Engagement Letter - ${who}${d.date ? ` - ${d.date}` : ""}.${ext}`;
}
