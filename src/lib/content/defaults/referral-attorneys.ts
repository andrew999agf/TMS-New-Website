/** Default stable of referral attorneys (mostly Fort Worth / Weatherford /
 *  Bosque County, Texas). Seeded once by the DB sync; the admin can edit,
 *  add, and remove them afterward. Contact fields are filled only where they
 *  could be confirmed — unconfirmed fields are intentionally left blank. */

export type ReferralAttorneySeed = {
  name: string;
  firm?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  practiceArea?: string;
};

// Contact details confirmed via official firm sites and authoritative
// directories (State Bar of Texas, Super Lawyers, Justia, Martindale, Avvo).
// Unconfirmed fields are left blank rather than guessed. A few list names are
// spelling variants of the confirmed attorney (noted in `firm`).
export const REFERRAL_ATTORNEYS: ReferralAttorneySeed[] = [
  { name: "Weston Legal", firm: "Weston Legal, PLLC", address: "177 W Gray St, Houston, TX 77019", phone: "713-623-4242", website: "westonlegal.com", practiceArea: "Debt Relief / Bankruptcy" },
  { name: "James Foley", firm: "Foley Law PLLC", address: "4116 W Vickery Blvd, Fort Worth, TX 76107", phone: "817-738-1633", website: "foleylawpllc.com", practiceArea: "Consumer Debt Defense" },
  { name: "Landon Loker", firm: "Loker Law Firm, PLLC", address: "3108 W 6th St, Suite 207, Fort Worth, TX 76107", phone: "817-952-9072", website: "lokerlawfirm.com", practiceArea: "Criminal Defense / DWI / Family Law" },
  { name: "Darbie Bowman", firm: "Law Office of Darbie Bowman", address: "114 S Erath St, Meridian, TX 76665", phone: "254-435-2578", practiceArea: "Criminal Defense / Family Law" },
  { name: "Brittany Lannen", firm: "Lannen Law, PLLC", address: "401 East Avenue C, Valley Mills, TX 76689", phone: "254-301-9195", email: "info@lannenlawpllc.com", website: "lannenlawpllc.com", practiceArea: "Criminal Defense / Family Law" },
  { name: "Pete Rowe", firm: "Law Office of Pete Rowe, P.C.", address: "15150 Preston Rd, Suite 300, Dallas, TX 75248", phone: "817-637-3830", email: "pete@peteroweattorney.com", website: "peteroweattorney.com", practiceArea: "Family Law / Litigation" },
  { name: "Jerome Styrsky", firm: "Law Office of Jerome A. Styrsky", address: "11 N Houston St, Fort Worth, TX 76102", phone: "817-334-0061", website: "jeromestyrskylaw.com", practiceArea: "Family Law / Estate Planning" },
  { name: "Roger Philip", firm: "Roger W. Phillips, Attorney at Law", address: "211 S Rusk St, Weatherford, TX 76086", phone: "817-599-9993", website: "rogerwphillipsattorneyatlaw.com", practiceArea: "Criminal Defense / DWI / Probate" },
  { name: "Emery Shannon", firm: "Law Offices of Emery C. Shannon, P.C.", address: "1332 Teasley Lane, Suite 100, Denton, TX 76205", phone: "940-800-8005", practiceArea: "Debt Defense / Bankruptcy" },
  { name: "J.N. Richards Law, P.C.", firm: "J.N. Richards Law, P.C.", address: "518 E Tyler St, Athens, TX 75751", website: "jnr.law", practiceArea: "Business & Real Estate Litigation" },
  { name: "Bob Haslam", firm: "The Haslam Firm", address: "610 Grove St, Fort Worth, TX 76102", phone: "817-330-6615", website: "haslam.law", practiceArea: "Personal Injury / Wrongful Death" },
  { name: "Anderson Injury Law", firm: "Anderson Injury Lawyers", address: "1310 W El Paso St, Fort Worth, TX 76102", phone: "817-294-1900", website: "maafirm.com", practiceArea: "Personal Injury" },
  { name: "Justin Sisemore", firm: "The Sisemore Law Firm, P.C.", address: "603 E Belknap St, Suite 100, Fort Worth, TX 76102", phone: "817-336-4444", website: "thetxattorneys.com", practiceArea: "Family Law" },
  { name: "Jason Nag", firm: "The Law Office of Jason Nash, PLLC", address: "601 Jameson St, Weatherford, TX 76086", phone: "817-757-7062", email: "jnash@jasonnashlaw.com", website: "jasonnashlaw.com", practiceArea: "Family Law / Litigation" },
  { name: "Frank Sellers", firm: "Sellers Law Firm, PC", address: "1612 Summit Ave, Suite 200, Fort Worth, TX 76102", phone: "817-928-4222", website: "sellerstriallaw.com", practiceArea: "Criminal Defense" },
  { name: "Nickols, White, and Solomon", firm: "Nickols White Solomon, PLLC", address: "4200 W Vickery Blvd, Suite 200, Fort Worth, TX 76107", phone: "817-617-7500", website: "nwslawfirm.com", practiceArea: "Criminal Defense" },
  { name: "John Jose", firm: "Jose & Vaughn, PLLC", address: "100 Lexington St, Suite 70, Fort Worth, TX 76102", phone: "817-704-2911", website: "joseandvaughn.com", practiceArea: "Personal Injury / Wrongful Death" },
];
