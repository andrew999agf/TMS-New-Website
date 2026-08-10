/**
 * First real case seeded into the Pre-Trial Checklist: Smith v. Morgan,
 * CV24-162 (Bosque County). Trial is Aug 31, 2026; the pretrial setting is
 * Aug 24, 2026. Inserted by Database Sync, keyed on the cause number so
 * re-running never duplicates it.
 *
 * The firm's own work items are seeded undated on purpose — only the trial and
 * pretrial dates were given, and inventing court deadlines would be worse than
 * leaving them blank. Undated items sort in `sort` order, so the structure below
 * is what the team sees. "Run setup" adds the dated scheduling-order milestones
 * calculated back from the trial date.
 */

export const CV24_162_CAUSE = "CV24-162";

export const CV24_162_CASE = {
  name: "Smith, Robert v. Morgan",
  causeNumber: CV24_162_CAUSE,
  court: "Bosque County",
  matter: "",
  trialDate: "2026-08-31",
  pretrialDate: "2026-08-24",
  notes:
    "Lead claim: Count 6 — declaratory judgment that CR 3515 is a public road by implied dedication. " +
    "Alternatives pleaded: prescriptive easement (Ct 1), easement by estoppel (Ct 2), irrevocable license (Ct 7).",
};

/** A top-level task and the sub-tasks that roll up under it. */
export type SeedItem = { title: string; notes?: string; children?: SeedItem[] };

/**
 * Eight overarching tasks, each with its own sub-tasks. Assign the parent to a
 * team member and the whole workstream has an owner; the sub-tasks get ticked
 * off individually underneath.
 */
export const CV24_162_ITEMS: SeedItem[] = [
  {
    title: "Pretrial motions & responses",
    children: [
      { title: "Draft letter to Judge summarizing pretrial motions", notes: "See attached letter." },
      {
        title: "Plaintiff's Response to Motion to Exclude",
        notes:
          "Motion: https://docs.google.com/document/d/1TqoQIQP7ak8MOhwNYXpYh1JvxYdk8mTM/edit  ·  " +
          "Proposed order: https://docs.google.com/document/d/1bXhy7GNlcNpaC2r-VZLlHSKBZSH4HLf2/edit",
      },
      { title: "Response to D's Motion to Strike Expert Witness", notes: "Their motion is very late — lead with that." },
      { title: "Response to Motion to Compel" },
      { title: "Answer and Affirmative Defenses", notes: "Include Transportation Code Chapter 258 provisions. https://drive.google.com/drive/folders/1iAvGQQicCNnKI2UOFq7j64yndBlpPh20" },
      { title: "Motions in Limine", notes: "Keep to three mains — can't talk about fixing things on appeal + boilerplate. https://drive.google.com/drive/folders/1iAvGQQicCNnKI2UOFq7j64yndBlpPh20" },
    ],
  },
  {
    title: "166 & 248 pretrial hearing",
    notes: "Pretrial setting is Aug 24, 2026.",
    children: [
      { title: "Amend the 166 hearing notice to add the 166 & 248 motion", notes: "Get with the court." },
      { title: "Notice MSJ for day of trial, or move for leave to hear it at the 166 & 248 hearing", notes: "Decide, then get with the court — set by fiat. Last day to set is the day of trial." },
      { title: "Proposed Order on 166 & 248", notes: "https://docs.google.com/document/d/1GTRKoxdxtBjFeexHgasxSQqQLDDcsvRR/edit" },
      { title: "Proposed Order on MSJ", notes: "https://docs.google.com/document/d/1Yv7sCZ5WGIGw1ChTkW130sxQUp7980bQ/edit" },
      { title: "Prepare the 166 & 248 Pretrial Materials Summary / Binder and serve on OC", notes: "See attached letter. Goal: the Judge and co-counsel both understand exactly what we're doing." },
    ],
  },
  {
    title: "1st Amended 194.4 Pretrial Disclosures",
    notes: "https://docs.google.com/document/d/13H5w1bCQBlKOTP9BvAxdXbmf7DPGRJRQ/edit",
    children: [
      { title: "Add witness: Homero Gonzales, (214) 205-2265", notes: "Visited the ranch." },
      { title: "Add witness: Charles Whitfield Land Clearing, (817) 648-4668", notes: "Mowing and shredding — did work at the ranch." },
      { title: "Tighten up the disclosures document" },
    ],
  },
  {
    title: "Bates & exhibit assembly",
    children: [
      { title: "6th Bates — photos, maps, video of rear gate, video of lead-in", notes: "Get the GLO map certified." },
      { title: "7th Bates — confirm all affidavits are in, and check for anything else" },
      { title: "8th Bates — confirm all items are present" },
      { title: "9th Bates — confirm all items are present" },
      { title: "Deeds — figure out which deeds actually matter" },
      { title: "Maps — organize the aerial maps and the road maps" },
      { title: "Deposition exhibits — annotated maps (Maxwell, Whitney, Morgan, Smith)" },
      { title: "2006 Survey — locate the clearest version" },
      { title: "Easement Survey — locate the clearest version" },
      { title: "Photos of the property — humanize our guy (property and family)" },
      { title: "Any other random maps we're missing?" },
      { title: "Send everything to Robert to start reviewing", notes: "This week." },
    ],
  },
  {
    title: "Witnesses & subpoenas",
    children: [
      { title: "Draft and send out witness subpoenas", notes: "This week." },
      { title: "Motions to appear at trial via Zoom for out-of-area witnesses" },
      { title: "Talk to the three family-friend witnesses", notes: "Call Luz and Janet. Do not call Aguirre." },
    ],
  },
  {
    title: "Trial preparation",
    children: [
      { title: "Complete the Jury Charge", notes: "Buy a real estate jury charge (PJC edition). https://docs.google.com/document/d/1Vu2FVBfsvDRKyLR6u9usSMZLkGkpWhTz/edit" },
      { title: "Continue the Exhibit and Trial Witness Schedule" },
      { title: "Highlight bad depos and send to client with full docs" },
      { title: "Review Brief on Ch. 258 memo", notes: "https://drive.google.com/drive/folders/1WIqCYy_-dmCM4ARKuakFunGqPFxl1kJk" },
      { title: "Trespass allegation — establish Ballard passed Tommy Morgan on the Whitney property", notes: "Not the Morgan property — establish this at trial." },
    ],
  },
  {
    title: "Review Defendants' responses to our pretrial motions",
    children: [
      { title: "D's Response to Motion to Strike and Exclude Designated Expert" },
      { title: "D's Response to Motion for Pre-Trial Rulings" },
      { title: "D's Response to Special Exceptions" },
    ],
  },
  {
    title: "Proof matrix follow-ups",
    notes: "The structured matrix lives on the Proof Matrix tab.",
    children: [
      { title: "Fill deposition line numbers from the certified transcripts before filing", notes: "Bates index is page-level only, so citations currently read Dep. p. __ (RES Bates) with line blanks." },
      { title: "Build the Element 4 cross around Morgan Dep. p. 8 (RES_000320)", notes: "He claims the CR designation was a 911 clerical error (\"they put CR instead of PR\") — that's the counter-testimony on offer/acceptance of dedication." },
      { title: "Confirm trial testimony lined up where no depo testimony exists", notes: "Etter IV, Bass, Leatherwood, Ballard, T. Maxwell Smith (fees)." },
    ],
  },
];
