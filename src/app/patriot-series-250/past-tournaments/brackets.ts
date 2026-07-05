/**
 * Bracket results for years where the original tournament poster (or the
 * broadcast) survives. Clicking a year's crest on Past Tournaments opens a
 * popup that draws the bracket poster-style: rounds left-to-right with
 * connector lines following each game's `to` link (winner advances into that
 * game). Double-elimination years stack sections — winners bracket on top,
 * elimination bracket below — and `ta`/`tb` tag where an entrant dropped from
 * (e.g. "L2" = loser of game 2), matching the hand-drawn posters.
 */

export type BracketGame = {
  /** Game id, e.g. "G7" — shown as a chip and used for connector lines. */
  id: string;
  a: string;
  b: string;
  sa?: number;
  sb?: number;
  /** Explicit winner when no scores were recorded. */
  winner?: "a" | "b";
  /** Entry tags per side, poster-style ("L2" = loser of G2). */
  ta?: string;
  tb?: string;
  /** Game id the winner advances into (connector line target). */
  to?: string;
  note?: string;
};
export type BracketRound = { title: string; games: BracketGame[] };
export type BracketSection = { title?: string; rounds: BracketRound[] };
export type TournamentBracket = { sections: BracketSection[]; summary: string[] };

export const BRACKETS: Record<number, TournamentBracket> = {
  2021: {
    sections: [
      {
        rounds: [
          {
            title: "First Round",
            games: [
              { id: "G1", a: "Whalers", b: "Dragons", sa: 10, sb: 3, to: "G5" },
              { id: "G2", a: "Celtics", b: "Bears", winner: "a", to: "G6" },
              { id: "G3", a: "Pirates", b: "Oilers", winner: "a", to: "G7" },
              { id: "G4", a: "Stihl", b: "Vikings", sa: 4, sb: 3, to: "G8" },
            ],
          },
          {
            title: "Quarterfinals",
            games: [
              { id: "G5", a: "Founding Fathers", b: "Whalers", winner: "a", to: "G9" },
              { id: "G6", a: "Celtics", b: "Minutemen", sa: 4, sb: 2, to: "G10" },
              { id: "G7", a: "Spartans", b: "Pirates", sa: 4, sb: 3, to: "G9" },
              { id: "G8", a: "3 Musketeers", b: "Stihl", sa: 9, sb: 2, to: "G10" },
            ],
          },
          {
            title: "Semifinals",
            games: [
              { id: "G9", a: "Founding Fathers", b: "Spartans", winner: "a", to: "G11" },
              { id: "G10", a: "3 Musketeers", b: "Celtics", winner: "a", to: "G11" },
            ],
          },
          {
            title: "Championship",
            games: [{ id: "G11", a: "Founding Fathers", b: "3 Musketeers", sa: 25, sb: 10 }],
          },
        ],
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
    sections: [
      {
        rounds: [
          {
            title: "Quarterfinals",
            games: [
              { id: "G1", a: "Ironsides", b: "Pirates", sa: 3, sb: 1, to: "G5" },
              { id: "G2", a: "Spartans", b: "Whalers", sa: 2, sb: 1, to: "G5" },
              { id: "G3", a: "Founding Fathers", b: "Dragons", sa: 7, sb: 2, to: "G6" },
              { id: "G4", a: "Lake Monsters", b: "Rangers", sa: 6, sb: 3, to: "G6" },
            ],
          },
          {
            title: "Semifinals",
            games: [
              { id: "G5", a: "Spartans", b: "Ironsides", sa: 5, sb: 4, to: "G7" },
              { id: "G6", a: "Founding Fathers", b: "Lake Monsters", winner: "a", to: "G7" },
            ],
          },
          {
            title: "Championship",
            games: [{ id: "G7", a: "Founding Fathers", b: "Spartans", winner: "a" }],
          },
        ],
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
    /* Double elimination, ten teams — game numbers follow the bracket poster
     * (G1–G18 plus the if-necessary game). */
    sections: [
      {
        title: "Winners Bracket",
        rounds: [
          {
            title: "Opening Round",
            games: [
              { id: "G1", a: "Minutemen", b: "Oilers", sa: 3, sb: 2, to: "G5", note: "4 innings — Raymond homered in his first-ever Patriot Series at-bat" },
              { id: "G2", a: "Ironsides", b: "Dragons", winner: "a", to: "G6" },
              { id: "G3", a: "Whalers", b: "Spartans", winner: "a", to: "G11" },
              { id: "G4", a: "Founding Fathers", b: "Unicorns", winner: "a", to: "G12" },
            ],
          },
          {
            title: "Round 2",
            games: [
              { id: "G5", a: "Minutemen", b: "Tribe", winner: "a", to: "G11" },
              { id: "G6", a: "Ironsides", b: "Pirates", winner: "a", to: "G12" },
            ],
          },
          {
            title: "Semifinals",
            games: [
              { id: "G11", a: "Minutemen", b: "Whalers", winner: "a", to: "G15" },
              { id: "G12", a: "Ironsides", b: "Founding Fathers", winner: "a", to: "G15" },
            ],
          },
          {
            title: "Winners Final",
            games: [{ id: "G15", a: "Minutemen", b: "Ironsides", winner: "a", to: "G18" }],
          },
          {
            title: "Championship",
            games: [
              { id: "G18", a: "Dragons", b: "Minutemen", sa: 10, sb: 9, ta: "W17", to: "G19", note: "Potter wins the rock-paper-scissors ruling at second, then walks it off against Smith" },
              { id: "G19", a: "Minutemen", b: "Dragons", sa: 4, sb: 1, note: "If-necessary game — Salas deals; Raymond adds a late homer, the tournament's first and last both his" },
            ],
          },
        ],
      },
      {
        title: "Elimination Bracket",
        rounds: [
          {
            title: "Round 1",
            games: [
              { id: "G7", a: "Dragons", b: "Tribe", winner: "a", ta: "L2", tb: "L5", to: "G9", note: "6 innings" },
              { id: "G8", a: "Oilers", b: "Pirates", winner: "a", ta: "L1", tb: "L6", to: "G10" },
            ],
          },
          {
            title: "Round 2",
            games: [
              { id: "G9", a: "Dragons", b: "Spartans", winner: "a", tb: "L3", to: "G13" },
              { id: "G10", a: "Oilers", b: "Unicorns", winner: "a", tb: "L4", to: "G14" },
            ],
          },
          {
            title: "Round 3",
            games: [
              { id: "G13", a: "Dragons", b: "Founding Fathers", winner: "a", tb: "L12", to: "G16" },
              { id: "G14", a: "Oilers", b: "Whalers", winner: "a", tb: "L11", to: "G16" },
            ],
          },
          {
            title: "Semifinal",
            games: [{ id: "G16", a: "Dragons", b: "Oilers", winner: "a", to: "G17" }],
          },
          {
            title: "Final",
            games: [{ id: "G17", a: "Dragons", b: "Ironsides", winner: "a", tb: "L15", note: "Winner advances to the championship (G18)" }],
          },
        ],
      },
    ],
    summary: [
      "Ten teams, double elimination. The Dragons lost their opener to Ironsides — then won six straight elimination games to reach the final, taking out the Tribe, Spartans, Founding Fathers, Oilers, and Ironsides along the way.",
      "The Minutemen never lost in the winners bracket: Oilers, Tribe, Whalers, and Ironsides in the winners final.",
      "Championship game one: with the Minutemen an out from the title, a too-close force out at second went to rock-paper-scissors. Brandon Potter's rock beat Max Smith's scissors — then Potter walked it off 10–9 against Smith, who had moved from short to the mound to face him.",
      "The if-necessary game: Michael Salas pitched the Minutemen to a 4–1 clincher, with Raymond's late homer closing the book — the rookie hit the tournament's first and last home runs.",
      "Home Run Tally — Brandon P. 16 · Max S. 11 · Paul H. 5 · Brent (Colonels) 5 · Michael (Vegas) 4 · DJ 4 · Drew B. 4 · Bobby P. 2 · Raymond G. 2 · Mark H. 2 · Brandon H. 2 · Michael (Texas) 2 · Jack 1.",
      "Honors — MVP: Max Smith · HR Champion & Defensive POY: Brandon Potter · Pitcher of the Year: Michael Salas · Rookie of the Year: Raymond.",
    ],
  },
};
