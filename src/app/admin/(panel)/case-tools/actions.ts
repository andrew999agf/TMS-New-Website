"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { canonicalMatter } from "@/lib/cases";

/**
 * "Case tools diagnostics" (bottom of the admin sidebar): one copyable text
 * report on the MECHANICS of the case-file tools — the button tree of every
 * case tool and its sub-tabs, how the tools link to one another (which key
 * each stores, which direct ids exist), live counts of how connected the
 * data actually is, and a masked roster of current matters showing which
 * tools each one has. Names, emails, parties and document contents are
 * never printed: matter codes keep their number and the initials only.
 */

/** "01319-Holocron Toy Store, LLC" → "01319-H.T.S.L."; anything else → first letter + length. */
function maskMatter(m: string): string {
  const s = (m || "").trim();
  if (!s) return "(blank)";
  const mm = /^([A-Za-z0-9.]+)\s*-\s*(.+)$/.exec(s);
  if (mm) return `${mm[1]}-${initials(mm[2])}`;
  return `${s[0]}…(${s.length})`;
}
const initials = (name: string) => name.split(/[\s,]+/).filter(Boolean).map((w) => w[0].toUpperCase() + ".").join("") || "?";
const maskCause = (c: string) => (c && c.length > 6 ? `${c.slice(0, 3)}…${c.slice(-3)}` : c ? "…" : "");

/** The case-file tools as the sidebar shows them, with the tabs inside each. */
const TREE: { tool: string; href: string; key: string; tabs: string[]; note: string }[] = [
  { tool: "Matters / Cases (the hub)", href: "/admin/cases", key: "case_hub.matter (unique; canonical Clio code)", tabs: ["Case list", "Case detail: parties, cause no., court, county, retainer", "Pleadings bucket (feeds AI.fred case context)", "Links out to each tool for the matter"], note: "Source of truth. Every other tool files under this key via getOrCreateCaseForMatter()." },
  { tool: "Contacts", href: "/admin/contacts", key: "none — standalone directory", tabs: ["Kinds: current/past/prospective client, attorney, staff, opposing party, witness, litigation support, court/clerk"], note: "Not tied to a matter. Case parties live separately in case_hub.parties (JSON)." },
  { tool: "Time Tracker 4.0", href: "/admin/time-tracker-4", key: "time_entries.matter (free text, Clio display number) · time_matters.display_number", tabs: ["Entries", "Matters list", "Export"], note: "Read-only here. Never modified by any other tool." },
  { tool: "Share Folders", href: "/admin/share-folders", key: "share_folders.matter + case_number", tabs: ["Folder list", "Folder: Documents (tree, links, TOC)", "Download package", "Recipients", "Recipient activity + access log CSV", "Diagnostics"], note: "Creating a folder with a matter calls the hub (creates the case if missing)." },
  { tool: "Pre-Trial Checklist", href: "/admin/pre-trial", key: "trial_cases.matter + cause_number", tabs: ["Case list", "Checklist", "Proof Matrix", "Witnesses & Exhibits", "Transcripts"], note: "Own witness/exhibit/claim tables (trial_*), separate from the Exhibit Reviewer's." },
  { tool: "Discovery Reviewer", href: "/admin/discovery-reviewer", key: "discovery_sets.matter + cause_number", tabs: ["Set list", "Received (red)", "Staged (yellow)", "Produced (green)", "Opposing production (grey)", "Contents & notes", "Diagnostics"], note: "Productions hang off the set (productions.set_id). Exhibits assembled here carry into the Exhibit Reviewer." },
  { tool: "Exhibit Reviewer", href: "/admin/exhibit-reviewer", key: "exhibit_sets.matter + cause_number", tabs: ["Set list", "Reader / Grid", "Exhibit sticker", "Share (public, OC, recipients)", "Print prep", "Exhibit list"], note: "Own witnesses/claims/elements per set (exhibit_*)." },
  { tool: "Litigation Support", href: "/admin/litigation-support", key: "dwq_packages.matter (the Word form bank, lit_files, is matter-free)", tabs: ["DWQ & Records Subpoenas", "Word Form Bank", "Notices of Deposition (Oral)", "Written Discovery — ROGs · RFPs · RFAs", "Disclosures & Expert Designations", "Trial & Hearing Subpoenas", "Discovery Motions — Compel · Quash · Protect", "Service & Deadline Tracker"], note: "" },
  { tool: "Docs & Templates", href: "/admin/documents", key: "generated_docs.matter (templates themselves are matter-free)", tabs: ["Template bank", "Generated documents"], note: "" },
  { tool: "Case Portal", href: "/admin/case-portal", key: "portal_matters.clio_matter + direct ids: exhibit_set_id, share_folder_id", tabs: ["Groups → matters", "Matter: Dashboard", "Correspondence", "Client Documents (Pleadings · Discovery · Exhibits)", "Time"], note: "The only tool that stores DIRECT ids to another tool's rows, besides the matter key." },
  { tool: "AI.fred (Assistant)", href: "/admin/assistant", key: "none stored — case chip resolves the matter at run time", tabs: ["General", "Drafting", "Coding (permission-gated)", "Case chip / tools over firm data"], note: "Reads the hub, pleadings, share folders, discovery and exhibits through its tools." },
  { tool: "Map Overlay", href: "/admin/map-overlay", key: "none", tabs: ["Projects"], note: "Not matter-linked." },
];

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export async function caseToolsDiagnostics(): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!isFullAdmin(session.role)) return { ok: false, error: "Not allowed." };
  if (!db) return { ok: false, error: "Database not configured." };
  const L: string[] = [];
  const q = async (s: ReturnType<typeof sql>): Promise<Row[]> => { try { const r = await db!.execute(s); return Array.from(r as unknown as Iterable<Row>); } catch (err) { return [{ __error: (err as Error).message }]; } };
  /** First row of a query, never undefined (an empty result reads as an error row). */
  const one = async (s: ReturnType<typeof sql>): Promise<Row> => (await q(s))[0] ?? { __error: "no rows" };

  try {
    L.push(`CASE TOOLS DIAGNOSTICS — ${new Date().toISOString()}`);
    L.push("Mechanics only: no names, emails, parties or document contents. Matter codes show the number and initials.");
    L.push("");
    L.push("BUTTON TREE (sidebar · Case & Trial Tools)");
    for (const t of TREE) {
      L.push(`  ${t.tool}  ${t.href}`);
      L.push(`    key it files under: ${t.key}`);
      for (const tab of t.tabs) L.push(`    · ${tab}`);
      if (t.note) L.push(`    note: ${t.note}`);
    }

    L.push("");
    L.push("HOW THEY CONNECT");
    L.push("  One join key: the Clio matter code (e.g. 01319-Client) as stored in case_hub.matter.");
    L.push("  Tools store that same string in their own `matter` column; they resolve it with resolveMatterKey()");
    L.push("  (exact → canonical (strips ' — description') → case-insensitive → bare number prefix) and create the hub row if missing.");
    L.push("  Cause numbers are copied into each tool (not joined on). Contacts and Intake have no matter link. Case Portal also keeps");
    L.push("  direct ids to an exhibit set and a share folder. Discovery → Exhibit carry-over is by copying files/AI records, not by id.");

    // Live connectedness per table.
    const tables: { label: string; table: string; col: string }[] = [
      { label: "Share folders", table: "share_folders", col: "matter" },
      { label: "Discovery sets", table: "discovery_sets", col: "matter" },
      { label: "Exhibit sets", table: "exhibit_sets", col: "matter" },
      { label: "Pre-trial cases", table: "trial_cases", col: "matter" },
      { label: "Lit-support DWQ packages", table: "dwq_packages", col: "matter" },
      { label: "Generated documents", table: "generated_docs", col: "matter" },
      { label: "Time entries (read-only)", table: "time_entries", col: "matter" },
      { label: "Portal matters", table: "portal_matters", col: "clio_matter" },
    ];
    L.push("");
    L.push("LIVE CONNECTEDNESS (rows · with a matter · linked to a hub case · stray keys · blank)");
    const hub = await one(sql`select count(*)::int as total, count(*) filter (where archived) as archived, count(*) filter (where retainer_paid) as retainer, count(*) filter (where cause_number <> '') as with_cause, count(*) filter (where court <> '') as with_court from case_hub`);
    L.push(`  Hub cases: ${n(hub.total)} total · ${n(hub.archived)} archived · ${n(hub.retainer)} retainer paid · ${n(hub.with_cause)} with cause no. · ${n(hub.with_court)} with court`);
    for (const t of tables) {
      const r = await one(sql.raw(`select count(*)::int as total,
        count(*) filter (where coalesce(${t.col},'') <> '') as with_matter,
        count(*) filter (where coalesce(${t.col},'') <> '' and exists (select 1 from case_hub h where lower(h.matter) = lower(split_part(t.${t.col}, ' — ', 1)))) as linked
        from ${t.table} t`));
      if (r.__error) { L.push(`  ${t.label}: (unavailable: ${String(r.__error).slice(0, 80)})`); continue; }
      const stray = n(r.with_matter) - n(r.linked);
      const blank = n(r.total) - n(r.with_matter);
      L.push(`  ${t.label}: ${n(r.total)} · ${n(r.with_matter)} · ${n(r.linked)} · ${stray}${stray ? " ⚠" : ""} · ${blank}`);
    }
    // Portal direct ids.
    const pm = await one(sql`select count(*)::int as total,
      count(*) filter (where exhibit_set_id is not null) as with_es, count(*) filter (where exhibit_set_id is not null and exists (select 1 from exhibit_sets e where e.id = p.exhibit_set_id)) as es_ok,
      count(*) filter (where share_folder_id is not null) as with_sf, count(*) filter (where share_folder_id is not null and exists (select 1 from share_folders s where s.id = p.share_folder_id)) as sf_ok
      from portal_matters p`);
    if (!pm.__error) L.push(`  Portal direct links: exhibit set ${n(pm.es_ok)}/${n(pm.with_es)} valid · share folder ${n(pm.sf_ok)}/${n(pm.with_sf)} valid${n(pm.with_es) - n(pm.es_ok) + n(pm.with_sf) - n(pm.sf_ok) ? " ⚠ dangling" : ""}`);
    const tm = await one(sql`select (select count(*) from time_matters)::int as matters, (select count(distinct matter) from time_entries where coalesce(matter,'')<>'')::int as used,
      (select count(distinct matter) from time_entries e where coalesce(matter,'')<>'' and not exists (select 1 from time_matters m where m.display_number = e.matter))::int as not_in_list`);
    if (!tm.__error && tm.matters !== undefined) L.push(`  Time Tracker: ${n(tm.matters)} matters in its list · ${n(tm.used)} distinct matters on entries · ${n(tm.not_in_list)} entry matters not in the list`);
    const cx = await one(sql`select count(*)::int as total, count(*) filter (where archived) as archived, count(distinct kind) as kinds from contacts`);
    if (!cx.__error) L.push(`  Contacts: ${n(cx.total)} (${n(cx.archived)} archived) across ${n(cx.kinds)} kinds · no matter link (by design today)`);
    const ik = await one(sql`select count(*)::int as total, count(*) filter (where status = 'new') as new, (select count(*) from engagement_letters)::int as engagements from intake_submissions`);
    if (!ik.__error) L.push(`  Intake: ${n(ik.total)} submissions (${n(ik.new)} new) · ${n(ik.engagements)} engagement letters · no matter link`);

    // Near-duplicate keys: same canonical code, different stored spellings.
    const dupes = await q(sql`select lower(split_part(matter,' — ',1)) as canon, count(distinct matter) as spellings, count(*) as nrows from (
        select matter from share_folders union all select matter from discovery_sets union all select matter from exhibit_sets union all select matter from trial_cases
        union all select matter from dwq_packages union all select matter from generated_docs union all select matter from case_hub
      ) u where coalesce(matter,'') <> '' group by 1 having count(distinct matter) > 1 order by 2 desc limit 20`);
    L.push("");
    L.push(`SPLIT KEYS (one case stored under more than one spelling): ${dupes.length && !dupes[0].__error ? dupes.length : 0}`);
    for (const d of dupes) if (!d.__error) L.push(`  ${maskMatter(String(d.canon))}: ${n(d.spellings)} spellings across ${n(d.nrows)} rows`);

    // Stray keys per tool (masked).
    L.push("");
    L.push("STRAY KEYS (used by a tool but no hub case):");
    let anyStray = false;
    for (const t of tables.filter((x) => x.table !== "time_entries")) {
      const rows = await q(sql.raw(`select distinct ${t.col} as m from ${t.table} t where coalesce(${t.col},'') <> '' and not exists (select 1 from case_hub h where lower(h.matter) = lower(split_part(t.${t.col}, ' — ', 1))) limit 15`));
      for (const r of rows) if (!r.__error) { anyStray = true; L.push(`  ${t.label}: ${maskMatter(String(r.m))}`); }
    }
    if (!anyStray) L.push("  (none)");

    // Roster.
    const cases = await q(sql`select h.id, h.matter, h.cause_number, h.court, h.county, h.archived, h.retainer_paid, jsonb_array_length(coalesce(h.parties,'[]'::jsonb)) as parties, h.created_at, h.updated_at,
        (select count(*) from share_folders x where lower(split_part(x.matter,' — ',1)) = lower(h.matter)) as sf,
        (select count(*) from discovery_sets x where lower(split_part(x.matter,' — ',1)) = lower(h.matter)) as ds,
        (select count(*) from exhibit_sets x where lower(split_part(x.matter,' — ',1)) = lower(h.matter)) as es,
        (select count(*) from trial_cases x where lower(split_part(x.matter,' — ',1)) = lower(h.matter)) as pt,
        (select count(*) from dwq_packages x where lower(split_part(x.matter,' — ',1)) = lower(h.matter)) as dwq,
        (select count(*) from generated_docs x where lower(split_part(x.matter,' — ',1)) = lower(h.matter)) as gd,
        (select count(*) from time_entries x where lower(split_part(x.matter,' — ',1)) = lower(h.matter) or lower(x.matter) = lower(split_part(h.matter,'-',1))) as te,
        (select count(*) from portal_matters x where lower(split_part(x.clio_matter,' — ',1)) = lower(h.matter)) as pm
      from case_hub h order by h.archived, h.updated_at desc limit 200`);
    L.push("");
    L.push("MATTERS ROSTER (masked) — tools attached: SF share folders · DS discovery sets · ES exhibit sets · PT pre-trial · LS lit-support (DWQ packages) · GD generated docs · TE time entries · CP portal");
    for (const c of cases) {
      if (c.__error) { L.push(`  (unavailable: ${String(c.__error).slice(0, 80)})`); break; }
      const tools = [["SF", n(c.sf)], ["DS", n(c.ds)], ["ES", n(c.es)], ["PT", n(c.pt)], ["LS", n(c.dwq)], ["GD", n(c.gd)], ["TE", n(c.te)], ["CP", n(c.pm)]] as const;
      const attached = tools.filter(([, v]) => v > 0);
      L.push(`  #${c.id} ${maskMatter(String(c.matter))}${c.archived ? " · archived" : ""} · cause ${maskCause(String(c.cause_number ?? "")) || "—"} · court ${c.court ? "set" : "—"} · county ${c.county ? "set" : "—"} · parties ${n(c.parties)} · retainer ${c.retainer_paid ? "paid" : "—"} · updated ${String(c.updated_at).slice(0, 10)}`);
      L.push(`      tools: ${attached.length ? attached.map(([k, v]) => `${k}${v}`).join(" ") : "(none — hub record only)"}`);
    }
    if (!cases.length) L.push("  (no cases yet)");
    L.push("");
    L.push("LEGEND: 'stray' = a tool row whose matter has no hub case (resolveMatterKey could not find one when it was saved, or the hub row was deleted). 'split' = the same case spelled two ways (the historical ' — description' tail). Both are candidates for a merge step.");
    return { ok: true, text: L.join("\n") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
