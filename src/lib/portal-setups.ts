/**
 * Client set-ups the firm handed over as an outline, so the office can stand
 * a Client Case Portal group up with one click instead of keying it in. Each
 * runs once (the action skips a group that already has matters). Remove an
 * entry once it has been applied in production.
 */
export type ClientSetup = {
  group: string;
  kind: "single" | "family";
  parentName: string;
  parentContact: string;
  notes: string;
  companies: { name: string; kind?: "company" | "partnership" | "trust" | "estate" | "other"; aka?: string; notes?: string }[];
  matters: {
    clio: string; title: string; company: string; posture: "transactional" | "pre-litigation" | "litigation";
    driveFolder?: string; notes?: string;
    requests?: { title: string; details?: string }[];
    firmTasks?: string[]; clientTasks?: string[];
  }[];
};

const MANUEL = "Manuel Oldsmobile, Inc. d/b/a Manuel Auto Group";
const INSTACAR = "Instacar Rental, LLC";
/** Personal matters attach to the parent directly (no entity). */
const PERSONAL = "";

export const CLIENT_SETUPS: Record<string, ClientSetup> = {
  manuel: {
    group: "Michael Manuel Entities",
    kind: "family",
    parentName: "Michael Manuel",
    parentContact: "Mike Manuel, 214-972-5710 — via Amber Brawley, Manuel Auto Group LTD",
    notes: "Entity note: \"Manuel Auto Group\" / \"Manuel Auto Group, LTD\" is believed to be an assumed name or misnomer for Manuel Oldsmobile, Inc. — treat as one entity. Confirm via Texas SOS and Tarrant County assumed-name records.",
    companies: [
      { name: MANUEL, aka: "Manuel Auto Group; Manuel Auto Group, LTD", notes: "Assumed name / misnomer believed to be Manuel Oldsmobile, Inc. Confirm via Texas SOS and Tarrant County assumed-name records. Employer of record at 8075 Boulevard 26, NRH; TWC has 5925 E. Belknap, Haltom City on file." },
      { name: INSTACAR },
    ],
    matters: [
      {
        clio: "01473", title: "Rene Zuniga v. Manuel Auto Group — Cause No. 096-368163-25, 96th District Court, Tarrant County (debt defense)", company: MANUEL, posture: "litigation",
        driveFolder: "2026-Lit (096-368163-25)",
        notes: "Petition names \"Manuel Auto Group, LTD\" — if confirmed a misnomer, address capacity/misnomer in the answer.",
        firmTasks: ["Confirm entity status via Texas SOS and Tarrant County assumed-name records", "Address capacity / misnomer in the answer if confirmed"],
      },
      { clio: "01533", title: "Manuel Auto v. Alexus Shaiquandria Wade", company: MANUEL, posture: "litigation", driveFolder: "", notes: "Needs a working folder.", firmTasks: ["Create the working folder"] },
      {
        clio: "01537", title: "Change registered agent to T. Maxwell Smith, PLLC", company: MANUEL, posture: "transactional", driveFolder: "2026-Gen Business",
        notes: "Conditional on documentation of the transfer to Michael Manuel.",
        requests: [{ title: "Documentation of the transfer of the company to Michael Manuel", details: "Whatever shows the ownership transfer — assignment, stock transfer, minutes, or closing documents. The registered-agent change is conditional on this." }],
      },
      {
        clio: "01538", title: "TWC wage claims by Raul Rodriguez — Wage Claim Nos. 25-060485-8 and 25-061034-3", company: MANUEL, posture: "pre-litigation", driveFolder: "2026-TWC Raul Rodriguez",
        notes: "Determination Nos. 000658631 and 000658632; both dismissed 9/30/2026 (independent contractor / duplicate). 21-day appeal window ran ~10/21/2026. TWC mailed to 5925 E. Belknap, Haltom City; employer of record at 8075 Boulevard 26, NRH.",
        firmTasks: ["Confirm no appeal was filed by Rodriguez after the 10/21/2026 window", "Send address update to TWC (8075 Boulevard 26, NRH)"],
      },
      {
        clio: "01539", title: "Claim against Raul Rodriguez — unpermitted structure removal and loss of use", company: MANUEL, posture: "pre-litigation", driveFolder: "",
        notes: "Cost to remove the partially built unpermitted structure and loss of use of the building (city permit issue). Needs a working folder.",
        requests: [
          { title: "Contract with Raul Rodriguez", details: "The agreement for the structure, including any change orders or texts/emails that set the scope and price." },
          { title: "Invoices and proof of payment", details: "Everything paid to Rodriguez and anything paid to others to remove or correct the work." },
          { title: "City notices and permit correspondence", details: "Any notice, citation, stop-work order, or permit denial from the city." },
        ],
        firmTasks: ["Create the working folder"],
      },
      {
        clio: "01511", title: "Personal injury claim — Domonique Wesley, DOI 3/3/2026, 3000 W. Camp Wisdom Rd, Grand Prairie (pre-lit)", company: INSTACAR, posture: "pre-litigation", driveFolder: "2026-Pre Lit (Collision-3.3.26)",
        requests: [
          { title: "Rental agreement and renter identification for the vehicle involved" },
          { title: "Insurance declarations page in force on 3/3/2026" },
          { title: "Any incident report, photos, or correspondence about the 3/3/2026 collision" },
        ],
      },
      {
        clio: "01540", title: "Bell Subrogation Services (State Farm – Murfreesboro) demand — Claim No. 530J3F497, Bell No. 2026026719, DOL 7/8/2026, $10,416.91", company: INSTACAR, posture: "pre-litigation", driveFolder: "2026-Bell Subrogation",
        notes: "Letter threatens a DMV license/registration suspension request. Client wants to dispute and learn the basis.",
        requests: [
          { title: "The Bell Subrogation demand letter and anything received since", details: "The full packet, including the envelope or email it arrived in." },
          { title: "Rental records for the vehicle on 7/8/2026", details: "Which vehicle, who rented it, the rental agreement, and the renter's driver's license and insurance on file." },
          { title: "Instacar's insurance policy and declarations page in force on 7/8/2026" },
        ],
        firmTasks: ["Request the full claim file from Bell: police report, driver/vehicle ID, estimate, proof of payment", "Verify Instacar vehicle/renter involvement and applicable coverage", "Respond to the suspension threat"],
      },
      {
        clio: "01541", title: "2015 Irrevocable Trust and related matters (Estate of Rosalie Waters Manuel), Tarrant County", company: PERSONAL, posture: "transactional", driveFolder: "2026-Obtain 2015 Irrevocable Trust and Transfer Docs",
        notes: "Consider renaming the working folder to include the estate and the Clio number.",
        requests: [
          { title: "The 2015 Irrevocable Trust instrument", details: "The signed trust agreement and any amendments or restatements." },
          { title: "Transfer documents", details: "Deeds, assignments, account retitling, or other documents moving assets into or out of the trust." },
          { title: "Estate papers for Rosalie Waters Manuel", details: "Will, letters testamentary or of administration, and the probate cause number if one exists." },
        ],
      },
    ],
  },
};
