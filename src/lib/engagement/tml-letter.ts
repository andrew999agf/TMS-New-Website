import "server-only";
import JSZip from "jszip";
import { TML_TEMPLATE_B64 } from "./tml-template-docx";
import { type ContractData, longDateEn, longDateEs, money, taskLines, weekdayEn, weekdayEs } from "./tml-fields";

/**
 * Fills the Texas Mexico Law engagement letter. The attorney's Word file is
 * the template: only the text of its yellow [BRACKETED] blanks is replaced,
 * inside word/document.xml, so the letterhead, footers, numbering, fonts and
 * spacing stay exactly as drafted. A blank that has no value yet is left as it
 * is — bracketed and highlighted — so an unfinished letter shows what is
 * missing. A filled blank loses its highlight.
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

/** After filling: a run is highlighted exactly when it still holds an unfilled [BLANK]. */
function settleHighlights(p: string): string {
  return p.replace(/<w:r[ >][\s\S]*?<\/w:r>/g, (run) => {
    const blank = /\[[^\]]{2,}/.test(textOf(run));
    const has = run.includes(HL);
    if (blank && !has) return run.includes("<w:rPr>") ? run.replace("<w:rPr>", `<w:rPr>${HL}`) : run.replace(/(<w:r(?:\s[^>]*)?>)/, `$1<w:rPr>${HL}</w:rPr>`);
    if (!blank && has) return run.split(HL).join("");
    return run;
  });
}

const RUN_FONT = '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>';
const run = (text: string, strike = false) => `<w:r><w:rPr>${RUN_FONT}${strike ? '<w:strike w:val="1"/>' : ""}<w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const num = (v: string) => Number(String(v).replace(/[$,\s]/g, ""));

export type FilledLetter = { buffer: Buffer; remaining: string[] };

export async function buildTmlLetter(d: ContractData): Promise<FilledLetter> {
  const zip = await JSZip.loadAsync(Buffer.from(TML_TEMPLATE_B64, "base64"));
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("The letter template is missing its document part.");
  const parts = (await file.async("string")).split(P_RE); // odd indexes are paragraphs
  const paras = () => parts.map((x, i) => i).filter((i) => i % 2 === 1);
  const find = (test: (text: string) => boolean, from = 0) => paras().find((i) => i >= from && test(textOf(parts[i]))) ?? -1;
  const fill = (i: number, token: string, value: string, nth = 0) => { if (i >= 0 && value) parts[i] = replaceToken(parts[i], token, value, nth); };
  const everywhere = (token: string, value: string) => {
    for (const i of paras()) for (let guard = 0; guard < 20 && textOf(parts[i]).includes(token); guard++) { parts[i] = replaceToken(parts[i], token, value); if (value.includes(token)) break; }
  };
  const everywhereIf = (token: string, value: string) => { if (value) everywhere(token, value); };

  // ----- who it is addressed to (the same in both halves)
  fill(find((t) => t === "[DATE]"), "[DATE]", longDateEn(d.date));
  fill(find((t) => t === "[FECHA]"), "[FECHA]", longDateEs(d.date));
  everywhereIf("[client email]", d.clientEmail); everywhereIf("[correo del cliente]", d.clientEmail);
  everywhereIf("[CLIENT NAME]", d.clientName); everywhereIf("[NOMBRE DEL CLIENTE]", d.clientName);
  everywhereIf("[STREET ADDRESS]", d.street); everywhereIf("[DIRECCIÓN]", d.street);
  everywhereIf("[CITY]", d.city); everywhereIf("[STATE]", d.state); everywhereIf("[ZIP]", d.zip);
  everywhereIf("[CIUDAD]", d.city); everywhereIf("[ESTADO]", d.state); everywhereIf("[CÓDIGO POSTAL]", d.zip);
  const greet = d.title && d.lastName ? { en: `${d.title} ${d.lastName}`, es: `${d.title === "Mr." ? "Sr." : "Sra."} ${d.lastName}` } : d.clientName ? { en: d.clientName, es: d.clientName } : null;
  if (greet) { everywhere("[Mr./Ms.] [CLIENT LAST NAME]", greet.en); everywhere("[Sr./Sra.] [APELLIDO DEL CLIENTE]", greet.es); }

  // ----- the RE line
  const reEn = find((t) => t.includes("[CASE STYLE / MATTER]")), reEs = find((t) => t.includes("[NOMBRE DEL CASO / ASUNTO]"));
  if (d.noCourt) { if (reEn >= 0) parts[reEn] = replaceToken(parts[reEn], "[COURT], ", ""); if (reEs >= 0) parts[reEs] = replaceToken(parts[reEs], "; [TRIBUNAL]", ""); }
  else { fill(reEn, "[COURT]", d.court); fill(reEs, "[TRIBUNAL]", d.court); }
  fill(reEn, "[CASE STYLE / MATTER]", d.caseStyle); fill(reEs, "[NOMBRE DEL CASO / ASUNTO]", d.caseStyle);
  fill(reEn, "[COUNTY]", d.county); fill(reEs, "[CONDADO]", d.county);

  // ----- scope
  everywhereIf("[DESCRIBE MATTER]", d.matterEn.replace(/[.\s]+$/, "")); everywhereIf("[DESCRIBIR EL ASUNTO]", d.matterEs.replace(/[.\s]+$/, ""));
  everywhereIf("[MATTER TYPE]", d.matterTypeEn.replace(/[:\s]+$/, "")); everywhereIf("[TIPO DE ASUNTO]", d.matterTypeEs.replace(/[:\s]+$/, ""));
  // One list item per task: the template's own paragraph is repeated, so each keeps its number and indent.
  const tasks = (marker: string, lines: string[]) => {
    const i = find((t) => t.includes(marker));
    if (i < 0 || lines.length === 0) return;
    const token = textOf(parts[i]).match(/\[[^\]]+\]/)?.[0];
    if (token) parts[i] = lines.map((l) => replaceToken(parts[i], token, l)).join("");
  };
  tasks("[SPECIFIC TASK", taskLines(d.tasksEn)); tasks("[TAREA ESPECÍFICA", taskLines(d.tasksEs));
  // Other exclusions are optional: with none, the blank and its comma come out and the sentence still reads.
  const exEn = find((t) => t.includes("[OTHER EXCLUSIONS]")), exEs = find((t) => t.includes("[OTRAS EXCLUSIONES]"));
  if (exEn >= 0) parts[exEn] = d.exclusionsEn ? replaceToken(parts[exEn], "[OTHER EXCLUSIONS]", d.exclusionsEn.replace(/[.,;\s]+$/, "")) : d.exclusionsEs ? parts[exEn] : replaceToken(parts[exEn], "[OTHER EXCLUSIONS], ", "");
  if (exEs >= 0) parts[exEs] = d.exclusionsEs ? replaceToken(parts[exEs], "[OTRAS EXCLUSIONES]", `${d.exclusionsEs.replace(/[.,;\s]+$/, "")},`) : d.exclusionsEn ? parts[exEs] : replaceToken(parts[exEs], ", [OTRAS EXCLUSIONES]", "");

  // ----- fees
  const feeEn = find((t) => t.includes("Retainer fee of $")), feeEs = find((t) => t.includes("Anticipo de $"));
  // The second blank is filled first so the first one's position never shifts.
  fill(feeEn, "[AMOUNT]", money(d.minBalance), 1); fill(feeEn, "[AMOUNT]", money(d.retainer), 0);
  fill(feeEs, "[MONTO]", money(d.minBalance), 1); fill(feeEs, "[MONTO]", money(d.retainer), 0);
  const schedule = (rowText: string, dateTok: string, amtTok: string, fmt: (s: string) => string) => {
    const rows = paras().filter((i) => textOf(parts[i]) === rowText);
    if (rows.length === 0 || d.schedule.length === 0) return;
    const model = parts[rows[0]];
    parts[rows[0]] = d.schedule.map((r) => { let p = model; if (r.date) p = replaceToken(p, dateTok, fmt(r.date)); if (r.amount) p = replaceToken(p, amtTok, money(r.amount)); return p; }).join("");
    for (const i of rows.slice(1)) parts[i] = "";
  };
  schedule("[DATE] – $[AMOUNT]", "[DATE]", "[AMOUNT]", longDateEn); schedule("[FECHA] – $[MONTO]", "[FECHA]", "[MONTO]", longDateEs);
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
  if (d.startWhen) { everywhere("[the retainer has been paid in full / the first scheduled payment has been received]", START[d.startWhen][0]); everywhere("[el anticipo se haya pagado en su totalidad / se haya recibido el primer pago programado]", START[d.startWhen][1]); }
  if (d.openUntil) { everywhere("[DAY], [DATE]", `${weekdayEn(d.openUntil)}, ${longDateEn(d.openUntil)}`); everywhere("[DÍA], [FECHA]", `${weekdayEs(d.openUntil)}, ${longDateEs(d.openUntil)}`); }
  fill(find((t) => t.includes("Trial Retainer of $")), "[AMOUNT]", money(d.trialRetainer)); fill(find((t) => t.includes("Anticipo para Juicio de $")), "[MONTO]", money(d.trialRetainer));

  // ----- associated counsel is optional: with none, the phrase comes out
  if (d.associatedCounsel) { everywhere("[ASSOCIATED COUNSEL]", d.associatedCounsel); everywhere("[ABOGADO ASOCIADO]", d.associatedCounsel); }
  else { everywhere(", including [ASSOCIATED COUNSEL],", ""); everywhere(", incluido [ABOGADO ASOCIADO],", ""); }

  for (const i of paras()) parts[i] = settleHighlights(parts[i]);
  const remaining = [...new Set(paras().flatMap((i) => textOf(parts[i]).match(/\[[^\]]{2,}\]?/g) ?? []))];
  zip.file("word/document.xml", parts.join(""));
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), remaining };
}

export function tmlLetterFileName(d: Pick<ContractData, "clientName" | "date">, ext: "docx" | "pdf"): string {
  const who = (d.clientName || "Client").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `Engagement Letter - ${who}${d.date ? ` - ${d.date}` : ""}.${ext}`;
}
