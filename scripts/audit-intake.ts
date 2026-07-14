/** Static audit of every intake branch: step/field integrity, duplicate field
 *  names that would clobber answers, broken showIf references, missing
 *  required contact/consent machinery, and option-less choice fields. */
import { BRANCHES, COMMON_STEPS, type Step, type Field, type Condition } from "../src/lib/intake/config";

const FIELD_TYPES = new Set(["text","textarea","tel","email","date","select","radio","checklist","yesno","repeater","party","gifts","residuary","files"]);
let problems = 0;
const warn = (msg: string) => { problems++; console.log("  ✗ " + msg); };

for (const b of BRANCHES) {
  const steps: Step[] = [...b.steps, ...COMMON_STEPS.map((s) => b.commonOverrides?.[s.id] ?? s)];
  console.log(`\n${b.id} (${b.label}) — ${steps.length} steps`);

  const stepIds = new Set<string>();
  const fieldNames = new Map<string, string>(); // name -> step id
  const allNames = new Set<string>();
  for (const s of steps) {
    if (stepIds.has(s.id)) warn(`duplicate step id "${s.id}"`);
    stepIds.add(s.id);
    if (!s.title) warn(`step "${s.id}" missing title`);
    if (!s.fields?.length) warn(`step "${s.id}" has no fields`);
    for (const f of s.fields as Field[]) {
      if (!f.name?.trim()) warn(`step "${s.id}": field with empty name`);
      if (!f.label?.trim()) warn(`step "${s.id}": field "${f.name}" missing label`);
      if (!FIELD_TYPES.has(f.type)) warn(`step "${s.id}": field "${f.name}" has unknown type "${f.type}"`);
      if (["radio","select","checklist"].includes(f.type) && !f.options?.length) warn(`step "${s.id}": ${f.type} "${f.name}" has no options`);
      if (fieldNames.has(f.name) && fieldNames.get(f.name) !== s.id) warn(`field name "${f.name}" duplicated across steps ("${fieldNames.get(f.name)}" and "${s.id}") — later answer clobbers earlier`);
      fieldNames.set(f.name, s.id);
      allNames.add(f.name);
    }
  }
  // showIf references must point at real fields.
  const conds = (c?: Condition | Condition[]) => (c ? (Array.isArray(c) ? c : [c]) : []);
  for (const s of steps) {
    for (const c of conds(s.showIf)) if (!allNames.has(c.field)) warn(`step "${s.id}" showIf references unknown field "${c.field}"`);
    for (const f of s.fields) for (const c of conds(f.showIf)) if (!allNames.has(c.field)) warn(`field "${f.name}" showIf references unknown field "${c.field}"`);
  }
  // Contact + consent machinery.
  for (const req of ["name","phone","email"]) if (!allNames.has(req)) warn(`missing contact field "${req}"`);
  const consent = steps.flatMap((s) => s.fields).find((f) => f.name === "consent");
  if (!consent) warn("missing consent field");
  else if (!consent.required) warn("consent not required");
  if (problems === 0) console.log("  ✓ clean");
}
console.log(`\n${problems === 0 ? "ALL BRANCHES CLEAN" : problems + " problems found"}`);
process.exit(problems ? 1 : 0);
