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
];
