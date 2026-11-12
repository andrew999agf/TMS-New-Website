/**
 * The blanks in the Texas Mexico Law engagement letter, as data. Safe to use
 * in the browser: the fill-in screen uses it to show what is still blank, and
 * the server uses the same shape to fill the Word file.
 *
 * The letter is English followed by Spanish. Names, amounts, dates and
 * choices are entered once and written into both halves; free text (what the
 * matter is, the tasks, exclusions) is entered in each language.
 */
export type ScheduleRow = { date: string; amount: string };
export type ContractData = {
  date: string;              // letter date, YYYY-MM-DD
  clientName: string; clientEmail: string; street: string; city: string; state: string; zip: string;
  title: string;             // "Mr." | "Ms." | "" (use the full name)
  lastName: string;
  caseStyle: string; court: string; county: string;
  noCourt: boolean;          // nothing filed yet: leave the court out of the RE line
  matterEn: string; matterEs: string;          // "My office will represent you in ___"
  matterTypeEn: string; matterTypeEs: string;  // the heading above the task list
  tasksEn: string; tasksEs: string;            // one per line
  exclusionsEn: string; exclusionsEs: string;  // optional
  retainer: string; minBalance: string;
  schedule: ScheduleRow[];
  attorneyRate: string; associateRate: string; staffRate: string;
  standardAttorneyRate: string; standardAssociateRate: string;
  startWhen: "" | "full" | "first";
  openUntil: string;         // YYYY-MM-DD
  trialRetainer: string;
  associatedCounsel: string; // optional
};

export const emptyContract = (): ContractData => ({
  date: "", clientName: "", clientEmail: "", street: "", city: "", state: "TX", zip: "", title: "", lastName: "", caseStyle: "", court: "", county: "", noCourt: false,
  matterEn: "", matterEs: "", matterTypeEn: "", matterTypeEs: "", tasksEn: "", tasksEs: "", exclusionsEn: "", exclusionsEs: "",
  retainer: "", minBalance: "", schedule: [], attorneyRate: "375", associateRate: "375", staffRate: "145", standardAttorneyRate: "425", standardAssociateRate: "425",
  startWhen: "", openUntil: "", trialRetainer: "", associatedCounsel: "",
});

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");
const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Whatever was saved or posted, as a well-formed ContractData. */
export function cleanContract(input: unknown): ContractData {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>, e = emptyContract();
  const rows = Array.isArray(i.schedule) ? i.schedule : [];
  return {
    date: ymd(i.date), clientName: str(i.clientName, 200).trim(), clientEmail: str(i.clientEmail, 255).trim(), street: str(i.street, 200).trim(), city: str(i.city, 100).trim(), state: str(i.state, 30).trim() || "", zip: str(i.zip, 16).trim(),
    title: ["Mr.", "Ms."].includes(str(i.title)) ? str(i.title) : "", lastName: str(i.lastName, 100).trim(), caseStyle: str(i.caseStyle, 300).trim(), court: str(i.court, 200).trim(), county: str(i.county, 100).trim().replace(/\s+county$/i, ""), noCourt: i.noCourt === true,
    matterEn: str(i.matterEn, 1000).trim(), matterEs: str(i.matterEs, 1000).trim(), matterTypeEn: str(i.matterTypeEn, 200).trim(), matterTypeEs: str(i.matterTypeEs, 200).trim(),
    tasksEn: str(i.tasksEn, 3000), tasksEs: str(i.tasksEs, 3000), exclusionsEn: str(i.exclusionsEn, 600).trim(), exclusionsEs: str(i.exclusionsEs, 600).trim(),
    retainer: str(i.retainer, 20).trim(), minBalance: str(i.minBalance, 20).trim(),
    schedule: rows.slice(0, 12).map((r) => ({ date: ymd((r as ScheduleRow)?.date), amount: str((r as ScheduleRow)?.amount, 20).trim() })).filter((r) => r.date || r.amount),
    attorneyRate: str(i.attorneyRate, 12).trim() || e.attorneyRate, associateRate: str(i.associateRate, 12).trim() || e.associateRate, staffRate: str(i.staffRate, 12).trim() || e.staffRate,
    standardAttorneyRate: str(i.standardAttorneyRate, 12).trim() || e.standardAttorneyRate, standardAssociateRate: str(i.standardAssociateRate, 12).trim() || e.standardAssociateRate,
    startWhen: i.startWhen === "full" || i.startWhen === "first" ? i.startWhen : "", openUntil: ymd(i.openUntil), trialRetainer: str(i.trialRetainer, 20).trim(), associatedCounsel: str(i.associatedCounsel, 200).trim(),
  };
}

/** "5000", "5,000", "$5000.5" → "5,000.00"; anything else comes back as typed. */
export function money(v: string): string {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return v.trim() !== "" && Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.trim();
}
export const taskLines = (s: string) => s.split("\n").map((l) => l.replace(/^[\s\-•*\d.)]+/, "").replace(/[;.,\s]+$/, "").replace(/\s+and$/i, "").trim()).filter(Boolean);
const day = (d: string) => new Date(`${d}T12:00:00Z`);
export const longDateEn = (d: string) => (d ? day(d).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }) : "");
export const longDateEs = (d: string) => (d ? day(d).toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "");
export const weekdayEn = (d: string) => (d ? day(d).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" }) : "");
export const weekdayEs = (d: string) => (d ? day(d).toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long" }) : "");

/** With no choice made, representation begins on the first scheduled payment when there is a payment plan, and when the retainer is paid in full when there is not. */
export const resolvedStartWhen = (d: Pick<ContractData, "startWhen" | "schedule">): "full" | "first" => d.startWhen || (d.schedule.length > 0 ? "first" : "full");

export type LetterNote = { key: string; label: string };
/**
 * What a download will look like for the fields not filled in. A downloaded
 * letter is always finished: it never shows a placeholder or a highlight.
 *   blank    prints as an empty space — these are the ones worth filling in
 *   omitted  optional parts that are simply left out, and the letter still reads
 */
export function letterNotes(d: ContractData): { blank: LetterNote[]; omitted: LetterNote[] } {
  const blank: LetterNote[] = [], omitted: LetterNote[] = [];
  const need = (ok: unknown, key: string, label: string) => { if (!ok) blank.push({ key, label }); };
  const tEn = taskLines(d.tasksEn).length, tEs = taskLines(d.tasksEs).length;
  need(d.date, "date", "Letter date");
  need(d.clientName, "clientName", "Client name");
  if (d.title && !d.lastName) blank.push({ key: "lastName", label: "Last name for the greeting" });
  need(d.caseStyle, "caseStyle", "Case style or matter (RE line)");
  need(d.county, "county", "County (RE line)");
  need(d.matterEn, "matterEn", "What the matter is — English");
  need(d.matterEs, "matterEs", "What the matter is — Spanish");
  need(d.retainer, "retainer", "Retainer amount");
  need(d.openUntil, "openUntil", "Offer open until");
  if (d.schedule.some((r) => !r.date || !r.amount)) blank.push({ key: "schedule", label: "A payment row is missing its date or amount" });
  // Filled in for one language only: the other half would silently differ.
  if (!!d.matterTypeEn !== !!d.matterTypeEs) blank.push({ key: d.matterTypeEn ? "matterTypeEs" : "matterTypeEn", label: `Matter type heading — ${d.matterTypeEn ? "Spanish" : "English"} (the other language has one)` });
  if (!!tEn !== !!tEs) blank.push({ key: tEn ? "tasksEs" : "tasksEn", label: `Specific task — ${tEn ? "Spanish" : "English"} (the other language has one)` });
  if (!!d.exclusionsEn !== !!d.exclusionsEs) blank.push({ key: d.exclusionsEn ? "exclusionsEs" : "exclusionsEn", label: `Other exclusions — ${d.exclusionsEn ? "Spanish" : "English"} (the other language has them)` });

  if (!d.clientEmail) omitted.push({ key: "clientEmail", label: "No client email: the “Via Email” line is left out" });
  if (!d.street || !(d.city || d.zip)) omitted.push({ key: "street", label: "Address not complete: empty address lines are left out" });
  if (d.noCourt || !d.court) omitted.push({ key: "court", label: "No court: the RE line shows the matter and county only" });
  if (!d.matterTypeEn && !d.matterTypeEs) omitted.push({ key: "matterTypeEn", label: "No matter type: that heading is left out" });
  if (!tEn && !tEs) omitted.push({ key: "tasksEn", label: "No specific task: the list is the three standard items" });
  if (!d.minBalance) omitted.push({ key: "minBalance", label: "No minimum trust balance: that clause is left out" });
  if (d.schedule.length === 0) omitted.push({ key: "schedule", label: "No payment plan: the schedule is left out" });
  if (!d.trialRetainer) omitted.push({ key: "trialRetainer", label: "No trial retainer: that paragraph and its initials line are left out" });
  return { blank, omitted };
}
