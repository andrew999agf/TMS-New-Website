/**
 * Texas statewide court rules shown on the public /texas-rules page and managed
 * from the admin "Texas Rules" tab (stored as a settings row). The Texas
 * Judicial Branch publishes these as versioned PDFs with no API, so the links
 * are maintained by hand — a quarterly reminder email nudges the update.
 */
export interface TexasRule {
  id: string;
  title: string;
  lastAmended: string; // free text, e.g. "March 1, 2026"
  pdfUrl?: string; // direct PDF download
  sourceUrl?: string; // txcourts.gov page (falls back to the rules index)
}

export const TEXAS_RULES_KEY = "firm.texasRules";
export const TXCOURTS_RULES_URL = "https://www.txcourts.gov/rules-forms/rules-standards/";

const SRC = TXCOURTS_RULES_URL;

export const DEFAULT_TEXAS_RULES: TexasRule[] = [
  { id: "trcp", title: "Texas Rules of Civil Procedure", lastAmended: "March 1, 2026", pdfUrl: "https://www.txcourts.gov/media/1462348/texas-rules-of-civil-procedure-march-1-2026.pdf", sourceUrl: SRC },
  { id: "trap", title: "Texas Rules of Appellate Procedure", lastAmended: "January 1, 2026", pdfUrl: "https://www.txcourts.gov/media/1457526/texas-rules-of-appellate-procedure.pdf", sourceUrl: SRC },
  { id: "tre", title: "Texas Rules of Evidence", lastAmended: "September 1, 2025", pdfUrl: "https://www.txcourts.gov/media/1456691/texas-rules-of-evidence-effective-912025.pdf", sourceUrl: SRC },
  { id: "efile-criminal", title: "Statewide Rules Governing Electronic Filing in Criminal Cases", lastAmended: "May 28, 2024", sourceUrl: SRC },
  { id: "trja", title: "Texas Rules of Judicial Administration", lastAmended: "September 1, 2025", sourceUrl: SRC },
  { id: "code-judicial-conduct", title: "Texas Code of Judicial Conduct", lastAmended: "June 12, 2026", sourceUrl: SRC },
  { id: "judicial-education", title: "Rules of Judicial Education", lastAmended: "November 29, 2023", sourceUrl: SRC },
  { id: "guardianship-education", title: "Education Rules on Guardianship, Alternatives to Guardianship, and Supports and Services for Proposed Wards and Wards", lastAmended: "November 29, 2023", sourceUrl: SRC },
  { id: "judge-discipline", title: "Disciplinary Rules for Judges and Judicial Candidates", lastAmended: "April 1, 2026", sourceUrl: SRC },
  { id: "jbcc", title: "Judicial Branch Certification Commission Rules", lastAmended: "December 19, 2025", sourceUrl: SRC },
  { id: "disciplinary-conduct", title: "Texas Disciplinary Rules of Professional Conduct", lastAmended: "March 7, 2025", sourceUrl: SRC },
  { id: "disciplinary-procedure", title: "Texas Rules of Disciplinary Procedure", lastAmended: "October 1, 2024", sourceUrl: SRC },
  { id: "judicial-bypass", title: "Judicial Bypass Rules under Ch. 33 of the Family Code", lastAmended: "September 6, 2022", sourceUrl: SRC },
  { id: "inmate-litigation", title: "Rules for Magistrates in Inmate Litigation and Litigation Involving Certain Civilly Committed Individuals", lastAmended: "December 1, 2023", sourceUrl: SRC },
];
