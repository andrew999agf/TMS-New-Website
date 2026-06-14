/**
 * Badge bar defaults — organizations, bar associations, and awards shown in a
 * strip below the hero. Seeded from the firm's memberships as text badges;
 * upload a logo in admin → Badges to replace the text with the org's seal.
 */
export type BadgeSeed = {
  name: string;
  logo?: string;
  url?: string;
  sort: number;
};

export const BADGES: BadgeSeed[] = [
  { name: "State Bar of Texas", sort: 1 },
  { name: "Texas Trial Lawyers Association", sort: 2 },
  { name: "Tarrant County Bar Association", sort: 3 },
  { name: "Tarrant County Trial Lawyers Association", sort: 4 },
  { name: "Tarrant County Criminal Defense Lawyers Association", sort: 5 },
  { name: "St. Thomas More Society", sort: 6 },
];
