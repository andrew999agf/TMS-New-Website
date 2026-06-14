/**
 * VERIFIED FIRM FACTS — the only source of truth (build spec Section 6).
 *
 * Nothing factual about the firm may originate anywhere else. Items still
 * needing the attorney's confirmation are tagged inline with VERIFY so they
 * surface in COMPLIANCE.md and the human punch list.
 */

export const FIRM = {
  name: "T. Maxwell Smith, PLLC",
  shortName: "T. Maxwell Smith",
  attorney: {
    fullName: "Thomas Maxwell Smith",
    displayName: "T. Maxwell Smith",
    nickname: "Max",
    barNumber: "24110379",
    admittedYear: "2018",
    title: "Trial Attorney & Founder",
  },
  email: "max@texaslawsmith.com",
  fax: "(817) 348-8328",
  paymentUrlPlaceholder: "", // [HUMAN: supply current Clio payment link]
  domain: "texaslawsmith.com", // confirm
} as const;

export type Mailing = { line: string; city: string; state: string; zip: string };

export type Office = {
  id: string;
  name: string;
  role: string;
  county?: string;
  street: string;
  street2?: string;
  mailing?: Mailing;
  city: string;
  state: string;
  zip: string;
  phone: string;
  isHub?: boolean;
  isPrincipal?: boolean;
  byAppointment?: boolean;
  note?: string;
};

const FW_MAILING: Mailing = { line: "PO Box 11009", city: "Fort Worth", state: "Texas", zip: "76110" };

export const OFFICES: Office[] = [
  {
    id: "fort-worth",
    name: "Fort Worth",
    role: "Litigation Hub",
    street: "1612 Summit Ave., Suite 200",
    city: "Fort Worth",
    state: "Texas",
    zip: "76102",
    mailing: FW_MAILING,
    phone: "(817) 348-8325",
    isHub: true,
    note: "VERIFY suite number and phone with Max.",
  },
  {
    id: "meridian",
    name: "Bosque County",
    role: "Principal Office",
    county: "Bosque County",
    street: "115 W. River Street",
    mailing: { line: "PO Box 123", city: "Meridian", state: "Texas", zip: "76665" },
    city: "Meridian",
    state: "Texas",
    zip: "76665",
    phone: "(254) 435-4288",
    isPrincipal: true,
  },
  {
    id: "weatherford",
    name: "Weatherford",
    role: "By Appointment",
    county: "Parker County",
    street: "100 Austin Avenue, Suite 101",
    city: "Weatherford",
    state: "Texas",
    zip: "76086",
    mailing: FW_MAILING,
    phone: "(817) 475-5522",
    byAppointment: true,
  },
];

export const PRINCIPAL_OFFICE = OFFICES.find((o) => o.isPrincipal)!;

/** Litigation experience by county (Section 6.3). */
export const LITIGATION_COUNTIES = [
  "Collin",
  "Denton",
  "Wise",
  "Tarrant",
  "Dallas",
  "Kaufman",
  "Johnson",
  "Parker",
  "Bosque",
  "Hamilton",
  "Harris",
  "Travis",
  "Hill",
  "Hood",
  "McLennan",
  "Somervell",
  "Coryell",
  "Grayson",
];

export const PROBATE_COUNTIES = ["Bosque", "Johnson", "Tarrant", "Dallas"];

export const FEDERAL_COURTS = [
  "U.S. District Court, Northern District of Texas",
  "U.S. Court of Appeals for the Fifth Circuit",
];

/** Banks / debt buyers litigated opposite (Section 6.3). */
export const OPPOSING_INSTITUTIONS = [
  "Discover Bank",
  "Capital One",
  "Bank of America",
  "JPMorgan Chase",
  "Barclays",
  "LVNV Funding",
  "Midland Credit Management",
];

export const BAR_ADMISSIONS = [
  { court: "State Bar of Texas", year: "2018" },
  {
    court: "U.S. District Court, Northern District of Texas",
    year: "2019",
    note: "Has litigated in that court.",
  },
  { court: "U.S. Court of Appeals for the Fifth Circuit", year: "2025" },
];

export const EDUCATION = [
  {
    school: "Texas Tech University School of Law",
    degree: "J.D.",
    year: "2018",
  },
  {
    school: "Texas Tech University, Rawls College of Business",
    degree: "M.B.A.",
    year: "2014",
  },
  {
    school: "Southwestern University",
    degree: "B.A., History",
    year: "2013",
    note: "Completed in three calendar years. Varsity baseball.",
  },
];

export const MEMBERSHIPS = [
  "Texas Trial Lawyers Association",
  "Tarrant County Trial Lawyers Association",
  "Tarrant County Criminal Defense Lawyers Association",
  "Tarrant County Bar Association",
  "St. Thomas More Society",
  "Meridian Chamber of Commerce",
  "Clifton Chamber of Commerce",
  "Valley Mills Chamber of Commerce",
  "Cranfills Gap Chamber of Commerce",
  "Clifton Lions Club",
];

/** Vetted quotes (Section 2). */
export const QUOTES = {
  clayton: {
    text: "A born Texan has instilled in his system a mind-set of no retreat or no surrender.",
    attribution: "Bill W. Clayton, former Speaker of the Texas House",
  },
  handshake: {
    text: "There are not many places left in the world where you can look a man in the eye, shake his hand, and feel comfortable that he will uphold his side of the deal. Bosque County is still one of those places.",
    attribution: "Max Smith",
  },
};

export const NELSON_VIDEO_URL = "https://www.youtube.com/watch?v=prwS1L_KLPo";
export const NELSON_VIDEO_ID = "prwS1L_KLPo";
