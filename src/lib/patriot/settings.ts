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
