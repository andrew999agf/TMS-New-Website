/* Ad-hoc validation of the Voice 4.0 pure logic against the spec test plan.
 * Run: npx tsx scripts/test-voice4.ts   (not part of the build) */
import {
  parseHours, parseDate, parseBillable, matchCategory, extractCore,
  resolveMatter, isYes, isNo, isDiscard, type Matter,
} from "../src/lib/voice/match4";

const CATEGORIES = [
  "APPELLATE", "CLIENT RELATIONS", "CORRESPONDENCE", "DEPOSITION", "DISCOVERY",
  "DOCUMENT PREPARATION", "DOCUMENT REVIEW", "EMAIL", "IN COURT", "RESEARCH",
  "TELEPHONE CALL", "TRAVEL TIME", "ZOOM CONFERENCE",
];
const MATTERS: Matter[] = [
  { displayNumber: "0042 - Nelson, John", description: "Cause No. 2023-CV-1187, 200th District Court" },
  { displayNumber: "0107 - Smith, Robert", description: "Personal injury, Judge Alvarez" },
  { displayNumber: "0108 - Smith, Jennifer", description: "Family law matter" },
  { displayNumber: "0205 - Smith, Daniel", description: "Estate planning" },
  { displayNumber: "0311 - Garcia, Maria", description: "Docket No. 19-4456" },
  { displayNumber: "0044 - O'Brien, Patrick", description: "Contract dispute" },
];

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  →  got: ${JSON.stringify(got)}`); }
}

console.log("\n§4 TIME PARSING");
const timeCases: [string, number][] = [
  ["half an hour", 0.5], ["a half hour", 0.5], ["point five", 0.5], ["oh point five", 0.5],
  ["zero point five", 0.5], ["point 5", 0.5], ["a quarter hour", 0.25], ["fifteen minutes", 0.25],
  ["45 minutes", 0.75], ["three quarters of an hour", 0.75], ["an hour", 1], ["one hour", 1],
  ["an hour and a half", 1.5], ["one and a half hours", 1.5], ["90 minutes", 1.5],
  ["1.2 hours", 1.2], ["1.2", 1.2], ["two hours", 2],
];
for (const [s, exp] of timeCases) ok(`"${s}" → ${exp}`, parseHours(s) === exp, parseHours(s));

console.log("\n§5 DATE PARSING (resolves to a concrete date)");
ok('"today" resolves', !!parseDate("today"));
ok('"yesterday" resolves', !!parseDate("yesterday"));
ok('"Monday" resolves to a past Monday', (() => { const d = parseDate("monday"); if (!d) return false; const [y,m,dd]=d.split("-").map(Number); const dt=new Date(y,m-1,dd); return dt.getDay()===1 && dt.getTime() < Date.now(); })());
ok('"3 days ago" resolves', !!parseDate("3 days ago"));
ok('"6/5" resolves (US M/D)', parseDate("6/5")?.endsWith("-06-05") ?? false, parseDate("6/5"));
ok('"June 5th" resolves', parseDate("june 5th")?.endsWith("-06-05") ?? false, parseDate("june 5th"));
ok('no date → undefined (caller defaults today)', parseDate("just some words") === undefined);

console.log("\n§4 CATEGORY + BILLABLE");
ok('"telephone call with..." → TELEPHONE CALL', matchCategory("telephone call with opposing counsel", CATEGORIES) === "TELEPHONE CALL");
ok('"emailed the client" → EMAIL', matchCategory("emailed the client", CATEGORIES) === "EMAIL");
ok('"did some research" → RESEARCH', matchCategory("did some research", CATEGORIES) === "RESEARCH");
ok('"non-billable" → nonBillable true', parseBillable("make it non-billable") === true);
ok('"bill it" → nonBillable false', parseBillable("bill it") === false);

console.log("\n§4 COMBINED PARSE (any order)");
const c1 = extractCore("Telephone call with opposing counsel about the deposition, half an hour, Nelson", CATEGORIES);
ok("ex1 category=TELEPHONE CALL", c1.category === "TELEPHONE CALL", c1.category);
ok("ex1 hours=0.5", c1.hours === 0.5, c1.hours);
ok("ex1 client contains 'nelson'", /nelson/i.test(c1.rawClient ?? ""), c1.rawClient);
const c2 = extractCore("Half an hour for Robert Smith yesterday, research", CATEGORIES);
ok("ex2 hours=0.5", c2.hours === 0.5, c2.hours);
ok("ex2 category=RESEARCH", c2.category === "RESEARCH", c2.category);
ok("ex2 date=yesterday set", !!c2.date, c2.date);
ok("ex2 client=robert smith", /robert\s+smith/i.test(c2.rawClient ?? ""), c2.rawClient);
const c3 = extractCore("Email, non-billable", CATEGORIES);
ok("ex3 category=EMAIL", c3.category === "EMAIL", c3.category);
ok("ex3 nonBillable=true", c3.nonBillable === true, c3.nonBillable);
ok("ex3 no client residual", !c3.rawClient, c3.rawClient);

console.log("\n§6 MATTER MATCHING");
ok('"Nelsen" (misspelled) → Nelson auto-selects', (() => { const r = resolveMatter("nelsen", MATTERS); return r.kind === "auto" && r.displayNumber.includes("Nelson"); })(), resolveMatter("nelsen", MATTERS));
ok('"robert smith" → Robert Smith (auto or ranked first)', (() => { const r = resolveMatter("robert smith", MATTERS); if (r.kind === "auto") return r.displayNumber.includes("Robert"); if (r.kind === "pick") return r.candidates[0].displayNumber.includes("Robert"); return false; })(), resolveMatter("robert smith", MATTERS));
ok('"smith" → top-5 picker with multiple Smiths', (() => { const r = resolveMatter("smith", MATTERS); return r.kind === "pick" && r.candidates.filter(c => /smith/i.test(c.displayNumber)).length >= 3; })(), resolveMatter("smith", MATTERS));
ok('"garcia" (unique) → auto-selects', (() => { const r = resolveMatter("garcia", MATTERS); return r.kind === "auto" && r.displayNumber.includes("Garcia"); })());
ok('"maria" (first-name only) → finds Garcia', (() => { const r = resolveMatter("maria", MATTERS); return (r.kind === "auto" && r.displayNumber.includes("Garcia")) || (r.kind === "pick" && r.candidates.some(c => c.displayNumber.includes("Garcia"))); })());
ok('gibberish → none (re-ask)', resolveMatter("zxqwplld", MATTERS).kind === "none");
ok('matching ignores the matter number', (() => { const r = resolveMatter("nelson", MATTERS); return r.kind === "auto" && r.displayNumber.startsWith("0042"); })());

console.log("\n§7/§8 NOTE + CONFIRM WORDS");
ok('note "No objection was filed" is NOT a discard', !isDiscard("No objection was filed"));
ok('"No further action required" is NOT yes/no-cancel for note', !isDiscard("No further action required"));
ok('"cancel" IS discard', isDiscard("cancel"));
ok('"start over" IS discard', isDiscard("start over"));
ok('"yes" is save', isYes("yes"));
ok('"that\'s right" is save', isYes("that's right"));
ok('"no" alone is a negative (→ menu, not discard)', isNo("no") && !isDiscard("no"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
