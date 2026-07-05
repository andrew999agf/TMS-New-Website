/**
 * Patriot Series tournament engine. Generates complete bracket structures —
 * 2 to 32 teams — composing any of the stage formats:
 *
 *   · one warm-up (exhibition) game
 *   · two-game pool play (every team gets two seeding games)
 *   · group play in groups of four (round robin inside each group)
 *   · single-elimination knockout (byes for top seeds on non-power-of-two)
 *   · double-elimination knockout (winners + elimination brackets, grand
 *     final with an if-necessary game)
 *
 * Any pool/group stage can feed either knockout. The data model follows the
 * open-source bracket libraries' shape (a match knows the match its winner
 * advances into — id/to here, id/nextMatchId there) so the renderer can draw
 * connector lines; games not yet played carry placeholder names like
 * "Winner G4" or "Group A · 1st" until results are filled in.
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
  /** Game id the LOSER drops into (double elimination bookkeeping). */
  loserTo?: string;
  /** Seed numbers, shown as small chips broadcast-style. */
  seedA?: number;
  seedB?: number;
  /** Warm-up/exhibition — excluded from standings. */
  exhibition?: boolean;
  note?: string;
};
export type BracketRound = { title: string; games: BracketGame[] };
export type BracketSection = { title?: string; rounds: BracketRound[] };
export type TournamentBracket = { sections: BracketSection[]; summary: string[] };

export type PoolFormat = "none" | "two-game" | "groups-of-4";
export type KnockoutFormat = "single" | "double";
export type TournamentFormat = { warmup?: boolean; pool?: PoolFormat; knockout: KnockoutFormat };

/** Which side won (or "none" while a generated game is still unplayed). */
export function gameResult(g: BracketGame): "a" | "b" | "draw" | "none" {
  if (g.winner) return g.winner;
  if (g.sa != null && g.sb != null) return g.sa === g.sb ? "draw" : g.sa > g.sb ? "a" : "b";
  return "none";
}

/* ------------------------------ internals ------------------------------ */

type Slot = { label: string; seed?: number; fromGame?: string; bye?: boolean };

/** Standard bracket seed placement (1 meets 2 only in the final). */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const m = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) next.push(s, m - s);
    order = next;
  }
  return order;
}

function roundTitle(slots: number, prefix: string, isFinal: boolean): string {
  if (isFinal) return prefix ? `${prefix} Final` : "Championship";
  if (slots >= 32) return `${prefix ? prefix + " " : ""}Round of ${slots}`;
  if (slots === 16) return `${prefix ? prefix + " " : ""}Round of 16`;
  if (slots === 8) return `${prefix ? prefix + " " : ""}Quarterfinals`;
  if (slots === 4) return `${prefix ? prefix + " " : ""}Semifinals`;
  return `${prefix ? prefix + " " : ""}Round`;
}

class Gen {
  private n = 0;
  games = new Map<string, BracketGame>();
  next(): string {
    this.n += 1;
    return `G${this.n}`;
  }
  add(g: BracketGame): BracketGame {
    this.games.set(g.id, g);
    return g;
  }
  link(fromId: string | undefined, toId: string) {
    if (!fromId) return;
    const g = this.games.get(fromId);
    if (g) g.to = toId;
  }
  linkLoser(fromId: string | undefined, toId: string) {
    if (!fromId) return;
    const g = this.games.get(fromId);
    if (g) g.loserTo = toId;
  }
}

/** Pair up slots into one round of games; byes/odd slots carry through. */
function playRound(gen: Gen, slots: Slot[], title: string, rounds: BracketRound[], opts?: { loserTag?: boolean }): Slot[] {
  const games: BracketGame[] = [];
  const advance: Slot[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const A = slots[i];
    const B = slots[i + 1];
    if (!B || B.bye) {
      advance.push(A);
      continue;
    }
    if (A.bye) {
      advance.push(B);
      continue;
    }
    const id = gen.next();
    const g = gen.add({
      id,
      a: A.label,
      b: B.label,
      seedA: A.seed,
      seedB: B.seed,
      ta: opts?.loserTag && A.fromGame ? undefined : A.fromGame && A.label.startsWith("Loser") ? A.label.replace("Loser G", "L") : undefined,
      tb: opts?.loserTag && B.fromGame ? undefined : B.fromGame && B.label.startsWith("Loser") ? B.label.replace("Loser G", "L") : undefined,
    });
    gen.link(A.fromGame, id);
    gen.link(B.fromGame, id);
    games.push(g);
    advance.push({ label: `Winner ${id}`, fromGame: id });
  }
  if (games.length) rounds.push({ title, games });
  return advance;
}

/** Single-elimination knockout over the given entrant slots (byes for top seeds). */
function singleElim(gen: Gen, entrants: Slot[], titlePrefix = ""): { rounds: BracketRound[]; perRoundGames: BracketGame[][] } {
  const size = 2 ** Math.ceil(Math.log2(Math.max(entrants.length, 2)));
  const placed: Slot[] = seedOrder(size).map((seed) =>
    seed <= entrants.length ? { ...entrants[seed - 1], seed: entrants[seed - 1].seed ?? seed } : { label: "BYE", bye: true },
  );
  const rounds: BracketRound[] = [];
  const perRoundGames: BracketGame[][] = [];
  let slots = placed;
  let remaining = size;
  while (slots.length > 1) {
    const before = rounds.length;
    slots = playRound(gen, slots, roundTitle(remaining, titlePrefix, remaining === 2), rounds);
    perRoundGames.push(rounds.length > before ? rounds[rounds.length - 1].games : []);
    remaining = remaining / 2;
  }
  return { rounds, perRoundGames };
}

/** Double elimination: winners bracket, elimination bracket, grand final + if-necessary. */
function doubleElim(gen: Gen, entrants: Slot[]): BracketSection[] {
  const winners = singleElim(gen, entrants, "Winners");
  // Rename the last winners round from "Winners Final".
  const winnersRounds = winners.rounds;

  const loserSlot = (g: BracketGame): Slot => ({ label: `Loser ${g.id}`, fromGame: undefined });
  const elimRounds: BracketRound[] = [];
  let lbRound = 0;

  // Elimination round 1: losers of winners round 1 (reversed to avoid instant rematusts).
  let alive: Slot[] = winners.perRoundGames[0].map(loserSlot).reverse();
  winners.perRoundGames[0].forEach((g) => void g);
  if (alive.length > 1) {
    lbRound += 1;
    const ids: string[] = [];
    alive = playRoundTracked(gen, alive, `Elimination Round ${lbRound}`, elimRounds, ids);
    winners.perRoundGames[0]
      .slice()
      .reverse()
      .forEach((g, i) => gen.linkLoser(g.id, ids[Math.floor(i / 2)] ?? ids[ids.length - 1]));
  }
  // Each later winners round drops its losers in, then survivors consolidate.
  for (let r = 1; r < winners.perRoundGames.length; r++) {
    const drops = winners.perRoundGames[r].map(loserSlot).reverse();
    if (drops.length === 0) continue;
    const merged: Slot[] = [];
    const width = Math.max(alive.length, drops.length);
    for (let i = 0; i < width; i++) {
      if (i < drops.length) merged.push(drops[i]);
      if (i < alive.length) merged.push(alive[i]);
    }
    if (merged.length > 1) {
      lbRound += 1;
      const ids: string[] = [];
      alive = playRoundTracked(gen, merged, `Elimination Round ${lbRound}`, elimRounds, ids);
      winners.perRoundGames[r].forEach((g, i) => gen.linkLoser(g.id, ids[Math.min(Math.floor(i / 2), ids.length - 1)]));
    } else {
      alive = merged;
    }
    if (alive.length > 1 && r < winners.perRoundGames.length - 1) {
      lbRound += 1;
      alive = playRoundTracked(gen, alive, `Elimination Round ${lbRound}`, elimRounds, []);
    }
  }
  // Consolidate any stragglers down to one elimination champion.
  while (alive.length > 1) {
    lbRound += 1;
    alive = playRoundTracked(gen, alive, `Elimination Round ${lbRound}`, elimRounds, []);
  }
  if (elimRounds.length) elimRounds[elimRounds.length - 1].title = "Elimination Final";

  // Grand final: winners champ vs elimination champ, plus the if-necessary game.
  const wbChamp = winnersRounds[winnersRounds.length - 1]?.games.slice(-1)[0];
  const lbChamp = alive[0];
  const gfId = gen.next();
  gen.add({
    id: gfId,
    a: lbChamp?.label ?? "Elimination champ",
    b: wbChamp ? `Winner ${wbChamp.id}` : "Winners champ",
    ta: lbChamp?.fromGame ? `W${lbChamp.fromGame.replace("G", "")}` : undefined,
    note: "Elimination-bracket champ must win twice; winners-bracket champ needs one.",
  });
  gen.link(wbChamp?.id, gfId);
  gen.link(lbChamp?.fromGame, gfId);
  const ifId = gen.next();
  gen.add({ id: ifId, a: `Winner ${gfId}`, b: `Loser ${gfId}`, note: "If-necessary game — played only if the elimination champ wins the first final." });
  gen.link(gfId, ifId);
  winnersRounds.push({ title: "Championship", games: [gen.games.get(gfId)!, gen.games.get(ifId)!] });

  return [
    { title: "Winners Bracket", rounds: winnersRounds },
    { title: "Elimination Bracket", rounds: elimRounds },
  ];
}

/** playRound that also reports the created game ids (for loser-drop links). */
function playRoundTracked(gen: Gen, slots: Slot[], title: string, rounds: BracketRound[], ids: string[]): Slot[] {
  const before = rounds.length;
  const out = playRound(gen, slots, title, rounds);
  if (rounds.length > before) for (const g of rounds[rounds.length - 1].games) ids.push(g.id);
  return out;
}

/** Round robin schedule (circle method) for one group. */
function roundRobin(gen: Gen, group: string[], groupName: string, roundsBag: Map<number, BracketGame[]>) {
  const teams = [...group];
  if (teams.length % 2 === 1) teams.push("BYE");
  const half = teams.length / 2;
  const fixed = teams[0];
  let rest = teams.slice(1);
  for (let r = 0; r < teams.length - 1; r++) {
    const lineup = [fixed, ...rest];
    for (let i = 0; i < half; i++) {
      const a = lineup[i];
      const b = lineup[teams.length - 1 - i];
      if (a === "BYE" || b === "BYE") continue;
      const g = gen.add({ id: gen.next(), a, b, note: `Group ${groupName}` });
      roundsBag.set(r, [...(roundsBag.get(r) ?? []), g]);
    }
    rest = [rest[rest.length - 1], ...rest.slice(0, -1)];
  }
}

/* ------------------------------ public API ------------------------------ */

export function generateTournament(teams: string[], fmt: TournamentFormat): TournamentBracket {
  const clean = teams.map((t) => t.trim()).filter(Boolean);
  if (clean.length < 2) throw new Error("At least 2 teams required.");
  if (clean.length > 32) throw new Error("At most 32 teams supported.");

  const gen = new Gen();
  const sections: BracketSection[] = [];
  const summary: string[] = [];

  // Warm-up exhibition.
  if (fmt.warmup) {
    const g = gen.add({
      id: gen.next(),
      a: clean[0],
      b: clean[1],
      exhibition: true,
      note: "Warm-up — exhibition only, does not count",
    });
    sections.push({ title: "Warm-Up", rounds: [{ title: "Exhibition", games: [g] }] });
    summary.push("Warm-up exhibition to shake the rust off before play counts.");
  }

  // Pool / group stage → knockout entrant placeholders.
  let entrants: Slot[] = clean.map((t, i) => ({ label: t, seed: i + 1 }));
  const pool = fmt.pool ?? "none";

  if (pool === "two-game") {
    const r1: BracketGame[] = [];
    const r2: BracketGame[] = [];
    for (let i = 0; i + 1 < clean.length; i += 2) r1.push(gen.add({ id: gen.next(), a: clean[i], b: clean[i + 1], seedA: i + 1, seedB: i + 2 }));
    for (let i = 1; i + 1 < clean.length; i += 2) r2.push(gen.add({ id: gen.next(), a: clean[i], b: clean[i + 1], seedA: i + 1, seedB: i + 2 }));
    if (clean.length > 2) r2.push(gen.add({ id: gen.next(), a: clean[clean.length - 1], b: clean[0], seedA: clean.length, seedB: 1 }));
    const poolRounds = [{ title: "Pool Game 1", games: r1 }, { title: "Pool Game 2", games: r2 }].filter((r) => r.games.length > 0);
    sections.push({ title: "Pool Play", rounds: poolRounds });
    entrants = clean.map((_, i) => ({ label: `Pool Seed ${i + 1}` }));
    summary.push("Two-game pool play seeds the knockout — every team gets two games before anything is on the line.");
  } else if (pool === "groups-of-4") {
    const groups: string[][] = [];
    for (let i = 0; i < clean.length; i += 4) groups.push(clean.slice(i, i + 4));
    // A trailing group of 1–2 folds into the previous group.
    if (groups.length > 1 && groups[groups.length - 1].length < 3) {
      const tail = groups.pop()!;
      groups[groups.length - 1].push(...tail);
    }
    const bag = new Map<number, BracketGame[]>();
    groups.forEach((g, gi) => roundRobin(gen, g, String.fromCharCode(65 + gi), bag));
    const rounds: BracketRound[] = [...bag.keys()].sort((a, b) => a - b).map((r) => ({ title: `Group Round ${r + 1}`, games: bag.get(r)! }));
    sections.push({ title: `Group Play — ${groups.length} group${groups.length === 1 ? "" : "s"}`, rounds });
    const firsts = groups.map((_, gi) => ({ label: `Group ${String.fromCharCode(65 + gi)} · 1st` }));
    const seconds = groups.map((_, gi) => ({ label: `Group ${String.fromCharCode(65 + gi)} · 2nd` })).reverse();
    entrants = [...firsts, ...seconds];
    summary.push(`Round-robin group play (${groups.map((g) => g.length).join("/")} per group); top two in each group advance, crossed 1st vs 2nd.`);
  }

  // Knockout.
  if (fmt.knockout === "double") {
    sections.push(...doubleElim(gen, entrants));
    summary.push("Double elimination — everybody has to lose twice, and the elimination-bracket survivor gets a real shot at the crown.");
  } else {
    const { rounds } = singleElim(gen, entrants, "");
    sections.push({ title: pool === "none" && !fmt.warmup ? undefined : "Knockout", rounds });
    summary.push("Single elimination — win or go home.");
  }

  return { sections, summary };
}
