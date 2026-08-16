/**
 * Case results — Section 6.4 substance, wording polished but never inflated.
 * Always rendered with the Section 15 results disclaimer. Never names the
 * firm's own client where the source uses a role description.
 */

export type ResultCategory = "marquee" | "appellate" | "settlement" | "jury" | "other";

export type CaseResultSeed = {
  category: ResultCategory;
  title: string;
  stat?: string;
  statLabel?: string;
  year?: string;
  summary?: string;
  detail?: string;
  cite?: string;
  link?: string;
  practiceSlug?: string;
  featuredHome?: boolean;
  sort: number;
};

export const CASE_RESULTS: CaseResultSeed[] = [
  {
    category: "marquee",
    title: "Client dismissed from $11.2M litigation on summary judgment",
    stat: "$11.2M",
    statLabel: "Claims dismissed with prejudice",
    year: "2026",
    summary:
      "Retained as defense counsel for a third-party defendant roughly sixty days before the jury-trial setting. Won traditional and no-evidence summary judgment dismissing every claim with prejudice. Our client owed nothing.",
    detail:
      "Star Café, LLC v. Johnny's Beer Garden LLC, Cause No. 141-350557-24, 141st Judicial District Court, Tarrant County, Texas. The motion dismissed fraud, conversion, fraudulent transfer, and conspiracy claims with prejudice (Feb. 27, 2026). The following month, the court entered judgment of $11,219,000 against other parties in the same case. Our client owed nothing.",
    cite: "Cause No. 141-350557-24, 141st Judicial District Court, Tarrant County",
    practiceSlug: "civil-commercial-litigation",
    featuredHome: true,
    sort: 1,
  },
  {
    category: "appellate",
    title: "Two Appeals Defended for the Property Owner",
    stat: "Both Affirmed",
    statLabel: "Two appeals defended on the same property",
    year: "2025–2026",
    summary:
      "Defended a property owner (appellee) through two separate appeals arising from post-foreclosure litigation. Both judgments affirmed; petition for review dismissed by the Supreme Court of Texas.",
    detail:
      "Fifth Court of Appeals at Dallas. Both judgments affirmed (Nov. 7, 2025 and Apr. 15, 2026). Petition for review dismissed by the Supreme Court of Texas.",
    cite: "Nos. 05-24-01265-CV; 05-25-00536-CV; Tex. No. 26-0119",
    practiceSlug: "appellate-law",
    featuredHome: true,
    sort: 2,
  },
  {
    category: "appellate",
    title: "Return of Garnished Funds",
    stat: "Funds returned",
    statLabel: "Garnishment dissolved",
    year: "2024",
    summary:
      "Represented the judgment-debtor side in garnishment litigation. The writ of garnishment was dissolved, a bill of review was granted vacating the underlying 2006 judgment, and the court ordered the garnished funds released to our client. The creditor's appeal was dismissed as moot.",
    detail:
      "Second Court of Appeals, Fort Worth, No. 02-23-00138-CV (Dec. 19, 2024). Writ dissolved; bill of review granted vacating the 2006 judgment; garnished funds released to our client; creditor's appeal dismissed as moot.",
    cite: "Second Court of Appeals, Fort Worth, No. 02-23-00138-CV",
    practiceSlug: "garnishments",
    featuredHome: true,
    sort: 3,
  },
  {
    category: "appellate",
    title: "Appeal prosecuted to resolution against a national bank",
    year: "2025",
    summary:
      "Appellate counsel for the appellant in a dispute with a national bank Prosecuted the appeal until the matter was resolved, then dismissed it.",
    detail:
      "Fifth Court of Appeals, No. 05-25-00712-CV (2025). Appellate counsel for the appellant in a dispute with a national bank; prosecuted the appeal until the matter was resolved.",
    cite: "Fifth Court of Appeals, No. 05-25-00712-CV",
    practiceSlug: "appellate-law",
    sort: 4,
  },
  {
    category: "appellate",
    title: "Oral argument before the Seventh Court of Appeals",
    year: "2024",
    summary:
      "Argued before the Seventh Court of Appeals (Amarillo) in a civil appeal. Watch the full argument.",
    detail:
      "Jeremy Scot Nelson v. The City of Lubbock, No. 07-23-00209-CV (argued 2024). Presented as advocacy and experience.",
    cite: "Seventh Court of Appeals, No. 07-23-00209-CV",
    link: "https://www.youtube.com/watch?v=prwS1L_KLPo",
    practiceSlug: "appellate-law",
    sort: 5,
  },
  // Settlements & recoveries (no party names)
  {
    category: "settlement",
    title: "Settlement — partnership fraud dispute",
    stat: "$100,000+",
    year: "2026",
    practiceSlug: "civil-commercial-litigation",
    sort: 6,
  },
  {
    category: "settlement",
    title: "Recovery — uninsured/underinsured motorist claim",
    stat: "$100,000+",
    year: "2026",
    practiceSlug: "personal-injury",
    sort: 7,
  },
  {
    category: "settlement",
    title: "Settlement — personal-injury matter",
    stat: "$100,000+",
    year: "2025",
    practiceSlug: "personal-injury",
    sort: 8,
  },
  {
    category: "settlement",
    title: "Settlement — contract dispute",
    stat: "$10,000+",
    year: "2025",
    practiceSlug: "civil-commercial-litigation",
    sort: 9,
  },
  {
    category: "settlement",
    title: "Settlement — defamation matter",
    stat: "$10,000+",
    year: "2026",
    practiceSlug: "civil-commercial-litigation",
    sort: 10,
  },
  {
    category: "settlement",
    title: "Numerous additional five-figure personal-injury settlements",
    practiceSlug: "personal-injury",
    sort: 11,
  },
  // Jury-trial record
  {
    category: "jury",
    title: "DWI — second-chair trial counsel — acquittal",
    year: "2019",
    detail: "Tarrant County (Nov. 4–5, 2019). Acquittal.",
    practiceSlug: "criminal-defense",
    sort: 12,
  },
  {
    category: "jury",
    title: "Assault–bodily injury — second-chair trial counsel",
    year: "2019",
    detail: "Tarrant County (Nov. 21–22, 2019).",
    practiceSlug: "criminal-defense",
    sort: 13,
  },
  {
    category: "jury",
    title: "Assault–bodily injury (family violence) — second-chair — hung jury",
    year: "2019",
    detail: "Tarrant County (Dec. 16–17, 2019). Hung jury.",
    practiceSlug: "criminal-defense",
    sort: 14,
  },
  {
    category: "jury",
    title: "Criminal defense jury trial — second-chair trial counsel",
    year: "2020",
    detail: "Tarrant County (Jan. 13, 2020).",
    practiceSlug: "criminal-defense",
    sort: 15,
  },
  {
    category: "jury",
    title: "DWI — second-chair trial counsel",
    year: "2020",
    detail: "Tarrant County (Feb. 4, 2020).",
    practiceSlug: "criminal-defense",
    sort: 16,
  },
  {
    category: "jury",
    title: "Assault–bodily injury — lead trial counsel — acquittal",
    year: "2022",
    detail: "Tarrant County (2022). Lead trial counsel. Acquittal.",
    practiceSlug: "criminal-defense",
    sort: 17,
  },
  {
    category: "jury",
    title: "Traffic-ticket jury trial won — strengthened a related injury case",
    summary:
      "A small case tried like a big one, because it was connected to a big one. The verdict materially strengthened a client's ongoing personal-injury case — the seamless web in action.",
    practiceSlug: "personal-injury",
    sort: 18,
  },
  {
    category: "appellate",
    title: "Consumer credit-card appeals against national banks",
    stat: "3 appeals",
    statLabel: "Consumer-side appeals vs. national card issuers",
    year: "2023–2026",
    summary:
      "Appellate counsel for consumers in credit-card collection cases against national issuers — a restricted appeal from a default judgment, and direct appeals from contract judgments out of Tarrant, Dallas, and Grayson County courts.",
    detail:
      "Diaz v. Capital One Bank (USA), N.A., No. 02-23-00481-CV (Second Court of Appeals, Fort Worth, from the 96th District Court, Tarrant County, 2023); Smegner v. Discover Bank, No. 05-25-00189-CV (Fifth Court of Appeals, restricted appeal from the 101st Judicial District Court, Dallas County, 2025); Anderson v. Discover Bank, No. 05-26-00818-CV (Fifth Court of Appeals, from Grayson County Court at Law No. 1, 2026).",
    cite: "Nos. 02-23-00481-CV; 05-25-00189-CV; 05-26-00818-CV",
    practiceSlug: "consumer-debt-defense",
    sort: 19,
  },
  {
    category: "appellate",
    title: "Criminal appeal and petition for discretionary review",
    year: "2024–2025",
    summary:
      "Briefed a criminal direct appeal in the Fort Worth Court of Appeals — a prohibited-substance-in-a-correctional-facility conviction out of Parker County — then took the fight to the Court of Criminal Appeals on a petition for discretionary review.",
    detail:
      "Cox v. The State of Texas, No. 02-24-00045-CR (Second Court of Appeals, Fort Worth, from the 43rd District Court, Parker County); petition for discretionary review, No. PD-0128-25 (Tex. Crim. App. 2025).",
    cite: "No. 02-24-00045-CR; Tex. Crim. App. No. PD-0128-25",
    practiceSlug: "criminal-defense",
    sort: 20,
  },
  {
    category: "appellate",
    title: "Petition practice in the Supreme Court of Texas",
    stat: "3 petitions",
    statLabel: "Petitions for review in the Supreme Court of Texas",
    year: "2023–2026",
    summary:
      "Repeat petition-for-review practice before the Supreme Court of Texas, spanning commercial-finance, governmental-immunity, and real-property appeals.",
    detail:
      "M.D.H. Oilfield Services LLC v. De Lage Landen Financial Services, Inc., No. 23-0531 (2023, from No. 02-22-00139-CV, Tarrant County); Nelson v. City of Lubbock, No. 25-0453 (2025, from No. 07-23-00209-CV, Lubbock County); Fofanah v. Rockwall Rental Properties, LP, No. 26-0119 (2026, from No. 05-24-01265-CV, Kaufman County).",
    cite: "Tex. Nos. 23-0531; 25-0453; 26-0119",
    practiceSlug: "appellate-law",
    sort: 21,
  },
  {
    category: "appellate",
    title: "No-evidence summary judgment defended on appeal",
    stat: "Affirmed",
    statLabel: "Take-nothing judgment affirmed in full",
    year: "2026",
    summary:
      "Appellate counsel for the property owners (appellees). After a no-evidence summary judgment dismissed the neighbors' negligence and gross-negligence claims over a fallen tree limb, defended that judgment on appeal — and the court affirmed in every respect, taxing all appellate costs against the appellants.",
    detail:
      "Posey v. Crocker, No. 12-26-00107-CV (Twelfth Court of Appeals, Tyler, mem. op. July 22, 2026), affirming a take-nothing no-evidence summary judgment from the 173rd District Court, Henderson County (Tr. Ct. No. CV23-0171-392). The court held the appellants presented nothing for review on the merits of the summary judgment and that their response evidence suffered substantive defects — unauthenticated exhibits and untimely-disclosed witnesses — that were not curable by continuance under Rule 166a(f). Judgment affirmed; all appellate costs taxed against the appellants.",
    cite: "Twelfth Court of Appeals, No. 12-26-00107-CV",
    practiceSlug: "appellate-law",
    sort: 22,
  },
];
