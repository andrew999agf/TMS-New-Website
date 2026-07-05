/**
 * Bracket results for years where the original tournament poster (or the
 * broadcast) survives. Clicking a year's crest on Past Tournaments opens a
 * popup with these rounds — team logos come from the admin team list — plus
 * the game summary. Scores are shown when the poster records them; `winner`
 * marks games where only the outcome is known.
 */

export type BracketGame = {
  a: string;
  b: string;
  sa?: number;
  sb?: number;
  /** Explicit winner when no scores were recorded. */
  winner?: "a" | "b";
  note?: string;
};
export type BracketRound = { title: string; games: BracketGame[] };
export type TournamentBracket = { rounds: BracketRound[]; summary: string[] };

export const BRACKETS: Record<number, TournamentBracket> = {
  2021: {
    rounds: [
      {
        title: "First Round",
        games: [
          { a: "Whalers", b: "Dragons", sa: 10, sb: 3 },
          { a: "Celtics", b: "Bears", winner: "a" },
          { a: "Pirates", b: "Oilers", winner: "a" },
          { a: "Stihl", b: "Vikings", sa: 4, sb: 3 },
        ],
      },
      {
        title: "Quarterfinals",
        games: [
          { a: "Founding Fathers", b: "Whalers", winner: "a" },
          { a: "Celtics", b: "Minutemen", sa: 4, sb: 2 },
          { a: "Spartans", b: "Pirates", sa: 4, sb: 3 },
          { a: "3 Musketeers", b: "Stihl", sa: 9, sb: 2 },
        ],
      },
      {
        title: "Semifinals",
        games: [
          { a: "Founding Fathers", b: "Spartans", winner: "a" },
          { a: "3 Musketeers", b: "Celtics", winner: "a" },
        ],
      },
      {
        title: "Championship",
        games: [{ a: "Founding Fathers", b: "3 Musketeers", sa: 25, sb: 10 }],
      },
    ],
    summary: [
      "Twelve teams entered, with the top seeds drawing first-round byes.",
      "The Whalers opened with a 10–3 rout of the Dragons, while Stihl edged the Vikings 4–3.",
      "The Celtics knocked out the No. 3–seeded Minutemen 4–2, and the Spartans survived the Pirates 4–3.",
      "The 3 Musketeers pounded Stihl 9–2 and got past the Celtics to reach the final.",
      "Championship: the Founding Fathers overwhelmed the 3 Musketeers 25–10 — the most lopsided final in Series history.",
    ],
  },
  2022: {
    rounds: [
      {
        title: "Quarterfinals",
        games: [
          { a: "Ironsides", b: "Pirates", sa: 3, sb: 1 },
          { a: "Spartans", b: "Whalers", sa: 2, sb: 1 },
          { a: "Founding Fathers", b: "Dragons", sa: 7, sb: 2 },
          { a: "Lake Monsters", b: "Rangers", sa: 6, sb: 3 },
        ],
      },
      {
        title: "Semifinals",
        games: [
          { a: "Spartans", b: "Ironsides", sa: 5, sb: 4 },
          { a: "Founding Fathers", b: "Lake Monsters", winner: "a" },
        ],
      },
      {
        title: "Championship",
        games: [{ a: "Founding Fathers", b: "Spartans", winner: "a" }],
      },
    ],
    summary: [
      "Eight teams, straight knockout.",
      "The Founding Fathers announced themselves with a 7–2 win over the Dragons; the Lake Monsters handled the Rangers 6–3.",
      "Semifinal thriller: the Spartans edged Ironsides 5–4 after Ironsides had taken out the Pirates 3–1.",
      "Championship: the Founding Fathers beat the Spartans to repeat as champions.",
    ],
  },
  2026: {
    rounds: [
      {
        title: "First Round",
        games: [{ a: "Minutemen", b: "Oilers", sa: 3, sb: 2, note: "Raymond homered in his first-ever Patriot Series at-bat" }],
      },
      {
        title: "Championship Series",
        games: [
          { a: "Dragons", b: "Minutemen", sa: 10, sb: 9, note: "Potter wins the rock-paper-scissors ruling at second, then walks it off against Smith" },
          { a: "Minutemen", b: "Dragons", sa: 4, sb: 1, note: "Salas deals; Raymond adds a late homer — the tournament's first and last both his" },
        ],
      },
    ],
    summary: [
      "The Dragons had to beat the Minutemen twice in the final — and nearly did.",
      "Game one: with the Minutemen an out from the title, a too-close force out at second went to rock-paper-scissors. Brandon Potter's rock beat Max Smith's scissors — then Potter walked it off 10–9 against Smith, who had moved from short to the mound to face him.",
      "Game two: Michael Salas pitched the Minutemen to a 4–1 clincher, with Raymond's late homer closing the book — the rookie hit the tournament's first and last home runs.",
      "Honors — MVP: Max Smith · HR Champion & Defensive POY: Brandon Potter · Pitcher of the Year: Michael Salas · Rookie of the Year: Raymond.",
    ],
  },
};
