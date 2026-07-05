/** Sanity harness for the tournament generator: every team count 2–32 across
 *  every format combination — unique game ids, valid advancement links, every
 *  team appearing, and knockout convergence to a single champion. */
import { generateTournament, type TournamentFormat } from "../src/lib/patriot/tournament";

let failures = 0;
const fmts: TournamentFormat[] = [];
for (const warmup of [false, true])
  for (const pool of ["none", "two-game", "groups-of-4"] as const)
    for (const knockout of ["single", "double"] as const) fmts.push({ warmup, pool, knockout });

for (let n = 2; n <= 32; n++) {
  const teams = Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
  for (const fmt of fmts) {
    const label = `n=${n} warmup=${fmt.warmup} pool=${fmt.pool} ko=${fmt.knockout}`;
    try {
      const t = generateTournament(teams, fmt);
      const games = t.sections.flatMap((s) => s.rounds.flatMap((r) => r.games));
      const ids = new Set(games.map((g) => g.id));
      if (ids.size !== games.length) throw new Error("duplicate game ids");
      for (const g of games) {
        if (g.to && !ids.has(g.to)) throw new Error(`bad to-link ${g.id}->${g.to}`);
        if (g.loserTo && !ids.has(g.loserTo)) throw new Error(`bad loserTo ${g.id}->${g.loserTo}`);
        if (g.a === g.b) throw new Error(`self-match in ${g.id}`);
      }
      // Every real team must appear somewhere.
      const names = new Set(games.flatMap((g) => [g.a, g.b]));
      for (const team of teams) if (!names.has(team)) throw new Error(`missing ${team}`);
      // The knockout must converge to exactly one terminal game (the final /
      // if-necessary game) with no onward winner link.
      const koSections = t.sections.filter((s) => !s.title || ["Knockout", "Winners Bracket", "Elimination Bracket"].includes(s.title));
      const koGames = koSections.flatMap((s) => s.rounds.flatMap((r) => r.games));
      const terminal = koGames.filter((g) => !g.to);
      if (terminal.length !== 1) throw new Error(`expected 1 terminal knockout game, got ${terminal.length}`);
      // No empty rounds anywhere.
      for (const s of t.sections) for (const r of s.rounds) if (r.games.length === 0) throw new Error(`empty round ${r.title}`);
    } catch (err) {
      failures++;
      console.error(`FAIL ${label}: ${(err as Error).message}`);
    }
  }
}
console.log(failures === 0 ? `ALL PASS — ${31 * fmts.length} combinations` : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
