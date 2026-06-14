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
    title: "Successful Defense of Two Appeals",
    stat: "2 of 2",
    statLabel: "Appeals defended — both affirmed",
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
      "Appellate counsel for the appellant in a dispute with JPMorgan Chase Bank, N.A. Prosecuted the appeal until the matter was resolved, then dismissed it.",
    detail:
      "Fifth Court of Appeals, No. 05-25-00712-CV (2025). Appellate counsel for the appellant in a dispute with JPMorgan Chase Bank, N.A.; prosecuted the appeal until the matter was resolved.",
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
    practiceSlug: "personal-injury-wrongful-death",
    sort: 7,
  },
  {
    category: "settlement",
    title: "Settlement — personal-injury matter",
    stat: "$100,000+",
    year: "2025",
    practiceSlug: "personal-injury-wrongful-death",
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
    practiceSlug: "personal-injury-wrongful-death",
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
    practiceSlug: "personal-injury-wrongful-death",
    sort: 18,
  },
];
