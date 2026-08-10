/**
 * First real case seeded into the Pre-Trial Deadlines tool: Smith v. Morgan,
 * CV24-162 (Bosque County). Inserted once by the Database Sync step, keyed on
 * the cause number so re-running never duplicates it.
 *
 * Items are intentionally undated — no trial date or scheduling-order dates were
 * supplied, and inventing court deadlines would be worse than leaving them
 * blank. Undated items sort in `sort` order, so the sequence below is the order
 * the team sees. Once a trial date is set, "Run setup" adds the standard dated
 * scheduling-order milestones alongside these.
 */

export const CV24_162_CAUSE = "CV24-162";

export const CV24_162_CASE = {
  name: "Smith, Robert v. Morgan",
  causeNumber: CV24_162_CAUSE,
  court: "Bosque County",
  matter: "",
  notes:
    "Lead claim: Count 6 — declaratory judgment that CR 3515 is a public road by implied dedication. " +
    "Alternatives pleaded: prescriptive easement (Ct 1), easement by estoppel (Ct 2), irrevocable license (Ct 7). " +
    "Proof matrix is maintained as a separate working document.",
};

export type SeedItem = { title: string; notes?: string };

/** Grouped by workstream; the prefix keeps the grouping legible in a flat list. */
export const CV24_162_ITEMS: SeedItem[] = [
  // ---- Court filings & responses -----------------------------------------
  { title: "Filings — Draft letter to Judge summarizing pretrial motions", notes: "See attached letter." },
  {
    title: "Filings — Plaintiff's Response to Motion to Exclude",
    notes:
      "Motion: https://docs.google.com/document/d/1TqoQIQP7ak8MOhwNYXpYh1JvxYdk8mTM/edit  ·  " +
      "Proposed order: https://docs.google.com/document/d/1bXhy7GNlcNpaC2r-VZLlHSKBZSH4HLf2/edit",
  },
  { title: "Filings — Response to D's Motion to Strike Expert Witness", notes: "Their motion is very late — lead with that." },
  { title: "Filings — Response to Motion to Compel" },
  {
    title: "Filings — Answer and Affirmative Defenses",
    notes: "Include Transportation Code Chapter 258 provisions. https://drive.google.com/drive/folders/1iAvGQQicCNnKI2UOFq7j64yndBlpPh20",
  },
  {
    title: "Filings — Motions in Limine",
    notes: "Keep to three mains — can't talk about fixing things on appeal + boilerplate. https://drive.google.com/drive/folders/1iAvGQQicCNnKI2UOFq7j64yndBlpPh20",
  },

  // ---- Hearing logistics --------------------------------------------------
  { title: "Hearing — Amend the 166 hearing notice to add the 166 & 248 motion", notes: "Get with the court." },
  {
    title: "Hearing — Notice MSJ for day of trial, or move for leave to hear it at the 166 & 248 pretrial hearing",
    notes: "Decide, then get with the court — set by fiat. Last day to set is the day of trial.",
  },
  { title: "Hearing — Proposed Order on 166 & 248", notes: "https://docs.google.com/document/d/1GTRKoxdxtBjFeexHgasxSQqQLDDcsvRR/edit" },
  { title: "Hearing — Proposed Order on MSJ", notes: "https://docs.google.com/document/d/1Yv7sCZ5WGIGw1ChTkW130sxQUp7980bQ/edit" },
  {
    title: "Hearing — Prepare 166 & 248 Pretrial Materials Summary / Binder for the Court and serve on OC",
    notes: "See attached letter. Goal: the Judge and co-counsel both understand exactly what we're doing.",
  },

  // ---- Disclosures, Bates & exhibits -------------------------------------
  {
    title: "Disclosures — Prepare 1st Amended 194.4 Pretrial Disclosures (tighten up)",
    notes: "https://docs.google.com/document/d/13H5w1bCQBlKOTP9BvAxdXbmf7DPGRJRQ/edit",
  },
  { title: "Disclosures — Add witness: Homero Gonzales, (214) 205-2265", notes: "Visited the ranch." },
  { title: "Disclosures — Add witness: Charles Whitfield Land Clearing, (817) 648-4668", notes: "Mowing and shredding — did work at the ranch." },
  { title: "Exhibits — 6th Bates: photos, maps, video of rear gate, video of lead-in", notes: "Get the GLO map certified." },
  { title: "Exhibits — 7th Bates: confirm all affidavits are in, and check for anything else" },
  { title: "Exhibits — 8th Bates: confirm all items are present" },
  { title: "Exhibits — 9th Bates: confirm all items are present" },
  { title: "Exhibits — Deeds: figure out which deeds actually matter" },
  { title: "Exhibits — Maps: organize the aerial maps and the road maps" },
  { title: "Exhibits — Deposition exhibits: annotated maps (Maxwell, Whitney, Morgan, Smith)" },
  { title: "Exhibits — 2006 Survey: locate the clearest version" },
  { title: "Exhibits — Easement Survey: locate the clearest version" },
  { title: "Exhibits — Photos of the property: humanize our guy (property and family)" },
  { title: "Exhibits — Any other random maps we're missing?" },
  { title: "Exhibits — Send everything to Robert to start reviewing", notes: "This week." },

  // ---- Witnesses ----------------------------------------------------------
  { title: "Witnesses — Draft and send out witness subpoenas", notes: "This week." },
  { title: "Witnesses — Motions to appear at trial via Zoom for out-of-area witnesses" },
  { title: "Witnesses — Talk to the three family-friend witnesses", notes: "Call Luz and Janet. Do not call Aguirre." },

  // ---- Trial prep ---------------------------------------------------------
  {
    title: "Trial prep — Complete the Jury Charge",
    notes: "Buy a real estate jury charge (PJC edition). https://docs.google.com/document/d/1Vu2FVBfsvDRKyLR6u9usSMZLkGkpWhTz/edit",
  },
  { title: "Trial prep — Continue the Exhibit and Trial Witness Schedule" },
  { title: "Trial prep — Highlight bad depos and send to client with full docs" },
  { title: "Trial prep — Review Brief on Ch. 258 memo", notes: "https://drive.google.com/drive/folders/1WIqCYy_-dmCM4ARKuakFunGqPFxl1kJk" },
  { title: "Trial prep — Review D's Response to Motion to Strike and Exclude Designated Expert" },
  { title: "Trial prep — Review D's Response to Motion for Pre-Trial Rulings" },
  { title: "Trial prep — Review D's Response to Special Exceptions" },
  {
    title: "Trial prep — Trespass allegation: establish Ballard passed Tommy Morgan on the Whitney property",
    notes: "Not the Morgan property — establish this at trial.",
  },

  // ---- Proof matrix -------------------------------------------------------
  {
    title: "Proof matrix — Fill deposition line numbers from the certified transcripts before filing",
    notes: "Bates index is page-level only, so citations currently read Dep. p. __ (RES Bates) with line blanks.",
  },
  {
    title: "Proof matrix — Build Element 4 cross around Morgan Dep. p. 8 (RES_000320)",
    notes: "He claims the CR designation was a 911 clerical error (\"they put CR instead of PR\") — that's the counter-testimony on offer/acceptance of dedication.",
  },
  {
    title: "Proof matrix — Confirm trial testimony lined up where no depo testimony exists",
    notes: "Etter IV (Etter family use from the 1940s), Bass (2007 Ch. 258 map process), Leatherwood (road in same location in every aerial from 1978; no alternative access), Ballard (Morgan confrontation while surveying), T. Maxwell Smith (fees/lodestar).",
  },
];
