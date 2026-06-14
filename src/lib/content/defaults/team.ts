/**
 * Team members — leads with Max, then the Texas staff. Source is the firm's
 * supplied bios; OCR artifacts cleaned and one court location corrected (the
 * Seventh Court of Appeals sits in Amarillo, matching our verified facts).
 *
 * VERIFY: Frankie Moreno's listed email is on the richardsandsmith.com domain;
 * confirm whether it should be a texaslawsmith.com address before launch.
 */
import type {
  TeamExperience,
  TeamEducation,
  TeamMatter,
} from "@/db/schema";

export type TeamMemberSeed = {
  slug: string;
  name: string;
  role: string;
  isAttorney: boolean;
  isLead: boolean;
  teamLabel: string;
  office?: string;
  email?: string;
  directPhone?: string;
  barNumber?: string;
  languages?: string;
  photo?: string;
  bioProfessional?: string;
  bioBeyond?: string;
  bioPersonal?: string;
  experience?: TeamExperience[];
  education?: TeamEducation[];
  representativeMatters?: TeamMatter[];
  services?: string[];
  practiceAreas?: string[];
  memberships?: string[];
  barAdmissions?: string[];
  courtAdmissions?: string[];
  sort: number;
};

export const TEAM: TeamMemberSeed[] = [
  {
    slug: "thomas-maxwell-smith",
    name: "Thomas Maxwell Smith",
    role: "Founding & Managing Attorney",
    isAttorney: true,
    isLead: true,
    teamLabel: "Texas Team",
    office: "Fort Worth",
    email: "max@texaslawsmith.com",
    directPhone: "(817) 348-8325",
    barNumber: "24110379",
    sort: 1,
    bioProfessional:
      "Max Smith was born and raised in Fort Worth, Texas. He attended Arlington Heights High School in southwest Fort Worth, where he graduated in 2010. From there Max traveled to Georgetown, Texas, where he earned an undergraduate degree in History at Southwestern University in 2013. Following his undergraduate studies, Max went out west to Lubbock, Texas, where he obtained an M.B.A. from Texas Tech's Rawls College of Business in 2014 and then a J.D. from Texas Tech University School of Law in 2018. He is licensed to practice law in the State of Texas, the United States District Court for the Northern District of Texas, and the United States Court of Appeals for the Fifth Circuit.",
    bioBeyond:
      "Outside the practice, Max and his wife can be found rooting on the Texas Christian University football, baseball, and basketball teams. They also maintain the family tradition of working the Smith family farm and small cattle operation, which has endured for more than a century in Bosque County. In 2023, Max ran a primary campaign for Bosque County Attorney.",
    bioPersonal:
      "Max was born and raised in southwest Fort Worth, attended Saint Andrews Catholic School and Church, and is an Eagle Scout. He played baseball at Southwestern University before earning his M.B.A. and J.D. from Texas Tech.",
    representativeMatters: [
      {
        title: "Foday S. Fofanah and Hawa Fofanah v. Rockwall Rental Properties, LP",
        cite: "05-25-00536-CV",
        court: "Fifth Court of Appeals at Dallas, Texas",
        description:
          "Appellate counsel for Rockwall Rental Properties, LP in appellate proceedings before the Fifth Court of Appeals at Dallas.",
      },
      {
        title: "Jeremy Scot Nelson v. City of Lubbock",
        cite: "07-23-00209-CV",
        court: "Seventh Court of Appeals at Amarillo, Texas",
        description:
          "Appellate counsel for Jeremy Scot Nelson in oral argument before the Seventh Court of Appeals at Amarillo.",
      },
      {
        title: "Foday S. Fofanah and Hawa Fofanah v. Rockwall Rental Properties, LP",
        cite: "05-24-01265-CV",
        court: "Fifth Court of Appeals at Dallas, Texas",
        description:
          "Appellate counsel for Rockwall Rental Properties, LP in appellate proceedings before the Fifth Court of Appeals at Dallas.",
      },
    ],
    experience: [
      {
        title: "Associate Attorney",
        org: "Puls Haney Lyster, PLLC",
        dates: "November 2018 – October 2019",
        location: "Fort Worth, Texas",
        bullets: [
          "Represented clients across general civil litigation, criminal defense, family law, and personal injury matters in Texas state court and the Federal Northern District of Texas.",
        ],
      },
    ],
    practiceAreas: [
      "Business-Related Matters",
      "Civil Litigation",
      "Estate Planning & Probate Matters",
      "Plaintiff's Litigation, Personal Injury & Wrongful Death",
    ],
    services: [
      "Business formations, contracts, and transactional counsel",
      "Civil and commercial litigation at every state court level and in federal court",
      "Plaintiff's personal injury and wrongful death representation",
      "Real estate, trustee counsel, water law, and administrative matters",
    ],
    education: [
      { degree: "Juris Doctor (J.D.)", school: "Texas Tech University School of Law", year: "2018", location: "Lubbock, Texas" },
      { degree: "Master of Business Administration (M.B.A.)", school: "Texas Tech University – Rawls College of Business", year: "2014", location: "Lubbock, Texas" },
      { degree: "Bachelor of Arts, History", school: "Southwestern University", year: "2013", location: "Georgetown, Texas", note: "Member, Southwestern University Baseball" },
      { degree: "High School Diploma", school: "Arlington Heights High School", year: "2010", location: "Fort Worth, Texas" },
    ],
    barAdmissions: ["State Bar of Texas — 2018"],
    courtAdmissions: [
      "U.S. District Court, Northern District of Texas — 2019",
      "U.S. Court of Appeals for the Fifth Circuit — 2025",
    ],
    memberships: [
      "Tarrant County Bar Association",
      "Texas Trial Lawyers Association",
      "Tarrant County Trial Lawyers Association",
      "Tarrant County Criminal Defense Lawyers Association",
      "St. Thomas More Society",
      "Meridian Chamber of Commerce",
      "Clifton Lions Club",
    ],
  },
  {
    slug: "frankie-moreno",
    name: "Frankie Moreno",
    role: "Legal Assistant",
    isAttorney: false,
    isLead: false,
    teamLabel: "Texas Team",
    office: "Tarrant County",
    email: "frankie@richardsandsmith.com", // VERIFY: old-firm domain?
    directPhone: "(817) 348-8325",
    languages: "Fluent in Spanish",
    sort: 2,
    bioProfessional:
      "Frankie Moreno is a Legal Assistant at T. Maxwell Smith, PLLC, supporting the firm's litigation and transactional work across Texas and based out of Tarrant County. Frankie keeps cases moving — from intake and discovery through hearing preparation — and is the steady operational hand behind the firm's daily docket. Fluent in Spanish.",
    services: [
      "Case intake, file opening, and conflicts checks",
      "Drafting and e-filing pleadings and discovery in Texas debt-defense and small-claims matters",
      "Calendaring deadlines, hearings, and depositions",
      "Coordinating with clients, courts, opposing counsel, and process servers",
      "Trial-binder preparation and exhibit organization",
    ],
    experience: [
      {
        title: "Legal Assistant",
        org: "Law Office of Jerry Jarzombek, PLLC",
        dates: "January 2008 – July 2023",
        location: "Fort Worth, Texas",
        bullets: [
          "Legal assistant to Jerry Jarzombek for over a decade. Handled intake, client billing, calendaring, and other duties.",
        ],
      },
    ],
  },
  {
    slug: "susan-godwin",
    name: "Susan Godwin",
    role: "Administrative Assistant",
    isAttorney: false,
    isLead: false,
    teamLabel: "Texas Team",
    office: "Meridian",
    email: "susangodwin@sbcglobal.net",
    directPhone: "(254) 435-2344",
    sort: 3,
    bioProfessional:
      "Susan Godwin anchors the firm's Meridian, Texas office. Susan brings more than thirty years of executive support experience to the firm — for more than three decades she served as the administrative assistant to the owner of a successful oil and gas exploration company, where she earned a reputation for discretion, precision, and dependability. She is the face of the Meridian office and often the first voice clients hear when they call.",
    bioPersonal:
      "Susan is a fixture in the Meridian community, known for her warmth and her steady, professional handling of every client and matter that comes through the door.",
    services: [
      "Front-of-house client reception in Meridian",
      "Executive support to the managing attorney",
      "Document handling and file organization",
      "Preparation of correspondence",
    ],
    experience: [
      {
        title: "Administrative Assistant to the Owner",
        org: "Oil & Gas Exploration Company",
        dates: "30+ years",
        location: "Meridian, Bosque County, Texas",
        bullets: ["Provided executive support to the owner of a successful oil and gas exploration company."],
      },
    ],
  },
  {
    slug: "andrew-bergeron",
    name: "Andrew Bergeron",
    role: "Legal Assistant",
    isAttorney: false,
    isLead: false,
    teamLabel: "Texas Team",
    office: "Fort Worth",
    sort: 4,
    bioProfessional:
      "Andrew Bergeron is a Legal Assistant at T. Maxwell Smith, PLLC, where he supports the firm's attorney and casework. Andrew prepares initial drafts of motions, pleadings, discovery requests, and correspondence, and helps prepare cases for trial. His role demands precision and organization, and he brings each of those qualities to bear on every file he touches.",
    bioBeyond:
      "Andrew served as President of the National Honor Society at Keller Central High School and as a Local and Area 7 Officer for Future Business Leaders of America. He is currently studying Economics at The University of Texas at Austin.",
    bioPersonal:
      "Andrew is a quick study who has earned increasing responsibility on the team. He is committed to a career in law and approaches his work with the same focus and energy that defined his student leadership.",
    services: [
      "Drafting motions, pleadings, and discovery in compliance with Texas court rules",
      "Drafting wills, trusts, Lady Bird deeds, and probate filings",
      "Legal research and case-law analysis",
      "Trial preparation and exhibit organization",
      "Client, court, and opposing-counsel communication",
      "Hearing and deposition scheduling",
    ],
    experience: [
      {
        title: "Law Clerk Intern",
        org: "T. Maxwell Smith, PLLC",
        dates: "January 2025 – May 2025",
        location: "Fort Worth, Texas",
        bullets: [
          "Prepared initial drafts of wills, trusts, Lady Bird deeds, probate filings, motions, objections, and summary-judgment filings under attorney supervision.",
          "Conducted legal research to expand his understanding of the Texas legal landscape.",
        ],
      },
    ],
    education: [
      { degree: "B.A. Economics (in progress)", school: "The University of Texas at Austin", year: "Aug. 2025 – present" },
      { degree: "High School Diploma", school: "Keller Central High School", year: "2025" },
    ],
    memberships: [
      "National Honor Society — Past President",
      "Future Business Leaders of America (FBLA) — Past Local & Area 7 Officer",
      "University of Texas Pre-Law Honor Society — Spring 2026 Inaugural Mock Trial Competition",
    ],
  },
];

export function getTeamMemberSeed(slug: string) {
  return TEAM.find((m) => m.slug === slug);
}
