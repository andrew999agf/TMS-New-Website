/**
 * Patriot Series site settings — stored as JSON rows in the shared `settings`
 * table (same mechanism as the firm site), edited from the Patriot admin panel
 * and read by the public Patriot pages. Pure types/constants so both client and
 * server can import them.
 */

export interface PatriotBranding {
  /** Tournament logo shown on the watch page. */
  tournamentLogo?: string;
  /** Browser-tab favicon for patriotseriestexas.com. */
  favicon?: string;
  /** Social-share (OpenGraph) image used when the site is shared. */
  socialShare?: string;
}

export interface PatriotTeam {
  id: string;
  name: string;
  abbreviation?: string;
  logo?: string;
}

export const PATRIOT_BRANDING_KEY = "patriot.branding";
export const PATRIOT_TEAMS_KEY = "patriot.teams";

/** The Patriot Series team roster. Used as the default until logos are uploaded
 * / teams are edited and saved from the admin panel. */
export const DEFAULT_PATRIOT_TEAMS: PatriotTeam[] = [
  { id: "minutemen", abbreviation: "MIN", name: "Minutemen" },
  { id: "ironsides", abbreviation: "IRN", name: "Ironsides" },
  { id: "eagles", abbreviation: "EAG", name: "Eagles" },
  { id: "pirates", abbreviation: "PIR", name: "Pirates" },
  { id: "lake-monsters", abbreviation: "LKM", name: "Lake Monsters" },
  { id: "big-red", abbreviation: "RED", name: "Big Red" },
  { id: "colonels", abbreviation: "COL", name: "Colonels" },
  { id: "founding-fathers", abbreviation: "FF", name: "Founding Fathers" },
  { id: "dragons", abbreviation: "DRG", name: "Dragons" },
  { id: "girls-team", abbreviation: "GIRL", name: "Girls Team" },
  { id: "tribe", abbreviation: "TRB", name: "Tribe" },
  { id: "whalers", abbreviation: "WHL", name: "Whalers" },
  { id: "vikings", abbreviation: "VIK", name: "Vikings" },
  { id: "musketeers", abbreviation: "MUSK", name: "3 Musketeers" },
  { id: "landscapers", abbreviation: "LND", name: "Landscapers" },
  { id: "irrigators", abbreviation: "IRR", name: "Irrigators" },
  { id: "neighbors", abbreviation: "NBR", name: "the Neighbors" },
  { id: "spartans", abbreviation: "SPA", name: "Spartans" },
  { id: "rangers", abbreviation: "RNG", name: "Rangers" },
  { id: "bears", abbreviation: "BRS", name: "Bears" },
  { id: "celtics", abbreviation: "CEL", name: "Celtics" },
  { id: "stihl", abbreviation: "STL", name: "Stihl" },
  { id: "oilers", abbreviation: "OIL", name: "Oilers" },
  { id: "unicorns", abbreviation: "UNI", name: "Unicorns" },
];

/* Image collections + people, edited from the admin and shown across the site. */
export const PATRIOT_BANNERS_KEY = "patriot.banners"; // string[] — hero banner images (Ken Burns)
export const PATRIOT_STADIUM_KEY = "patriot.stadium"; // string[] — stadium gallery photos

export interface PatriotPlayer {
  id: string;
  name: string;
  team?: string; // org / where they play now
  note?: string; // short blurb
  photo?: string;
}
export const PATRIOT_PLAYERS_KEY = "patriot.players"; // PatriotPlayer[] — players in the pros

/* Per-page public visibility, toggled from the admin Visibility tab. Watch (/)
 * is always shown. Records starts hidden (personal stats kept "in the background"). */
export const PATRIOT_PAGES_KEY = "patriot.pages";
export type PatriotPageKey = "teams" | "past-tournaments" | "records" | "stadium" | "news";
export const DEFAULT_PAGE_VISIBILITY: Record<PatriotPageKey, boolean> = {
  teams: true,
  "past-tournaments": true,
  records: true,
  stadium: true,
  news: true,
};

/* Tournament news articles, edited from the admin News tab. Each article is
 * tagged with a tournament year so coverage links appear on that year's row
 * of the Past Tournaments page. Banner photos are uploaded from the admin. */
export interface PatriotArticle {
  id: string; // slug, used in the /news/[slug] URL
  title: string;
  dek?: string; // one-line subhead shown on cards and under the headline
  date: string; // display date, e.g. "July 4, 2026"
  tournamentYear?: number;
  banner?: string; // uploaded banner photo URL
  /** Article text — blank line between paragraphs. */
  body: string;
}
export const PATRIOT_NEWS_KEY = "patriot.news";

export const DEFAULT_PATRIOT_NEWS: PatriotArticle[] = [
  {
    id: "2026-minutemen-repeat-champions",
    title: "Minutemen Repeat: Back-to-Back Champions After a Game One for the Ages",
    dek: "Brandon Potter won a rock-paper-scissors showdown and then walked it off — but Michael Salas and Raymond slammed the door in game two as the Minutemen went back-to-back.",
    date: "July 4, 2026",
    tournamentYear: 2026,
    body: `The Minutemen are champions of the 19th Annual Patriot Series — but the Dragons made them earn it in one of the wildest finals this tournament has ever seen.

Facing elimination math — the Dragons needed to beat the Minutemen twice — game one delivered instant history. With the Minutemen an out away from the title, a bang-bang force out at second base was too close to call, and the call went to the tournament's highest court: rock, paper, scissors. Brandon Potter threw rock. Max Smith threw scissors. Safe.

What happened next belongs in Patriot Series lore. Potter stepped to the plate, and Smith — refusing to let anyone else wear it — moved himself from shortstop to the pitcher's mound to face him. Potter hit a walk-off home run. Dragons 10, Minutemen 9, and suddenly it was a one-game season.

Game two belonged to the champions. Michael Salas delivered a dominant pitching performance, and Raymond — the rookie who homered in his first-ever Patriot Series at-bat in the opening round — put the exclamation point on the tournament with a late home run in the 4–1 clincher. The tournament's first home run and its last both came off the rookie's bat, and the Minutemen went back-to-back.

Tournament honors: MVP — Max Smith. Home Run Champion — Brandon Potter. Defensive Player of the Year — Brandon Potter. Pitcher of the Year — Michael Salas. Rookie of the Year — Raymond. Party Animal — to be announced.

Final home run tally: Brandon P. 16, Max S. 11, Paul H. 5, Brent 5, Michael (Vegas) 4, DJ 4, Drew B. 4, Bobby P. 2, Raymond G. 2, Mark H. 2, Brandon H. 2, Michael (Texas) 2, Jack 1.`,
  },
  {
    id: "2026-raymond-first-at-bat-homer",
    title: "Rookie Raymond Homers in His First-Ever Patriot Series At-Bat",
    dek: "The Minutemen newcomer went deep on the first swing of his Patriot Series career in a 3–2 first-round win over the Oilers.",
    date: "July 4, 2026",
    tournamentYear: 2026,
    body: `You only get one first at-bat, and Raymond made his unforgettable. The Patriot Series rookie stepped in for his first plate appearance in the yellow-bat big leagues and hit a home run — the first swing of his career, gone.

The blast proved to be the difference in a tight one. The Minutemen edged the Oilers 3–2 in their first-round matchup, with Raymond's homer providing the cushion the defending champions needed to survive the upset bid.

Not a bad way to introduce yourself at the 19th Annual — the USA 250 edition — of the Patriot Series.`,
  },
  {
    id: "2026-usa-250-tournament-underway",
    title: "The 19th Annual Patriot Series Is Underway",
    dek: "America turns 250, and Granbury's Fourth of July tradition plays on.",
    date: "July 4, 2026",
    tournamentYear: 2026,
    body: `The 19th Annual Patriot Series — the USA 250 edition — is underway in Granbury, Texas. Teams took the field on the nation's 250th birthday continuing a Fourth of July tradition that started as backyard pickup games in 2004 and has crowned a champion every year since 2007, save the 2020 COVID cancellation.

The Minutemen enter as defending champions. Follow the bracket through the day, and catch the live broadcast on the Watch page.`,
  },
];

/* Per-venue photo galleries (the "photo book" on the Stadium page). */
export const PATRIOT_PHOTOS_LAKESIDE_KEY = "patriot.photos.lakeside";
export const PATRIOT_PHOTOS_STIHL_KEY = "patriot.photos.stihl";
export const PATRIOT_PHOTOS_ALLEY_KEY = "patriot.photos.alley";
