"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, Eye, FileDown, FileText, Plus, Save, Trash2 } from "lucide-react";
import { saveContract } from "@/app/admin/(panel)/intake/contract/actions";
import { letterNotes, money, resolvedStartWhen, type ContractData } from "@/lib/engagement/tml-fields";

type Props = {
  leadId: number; backHref: string; partnerName: string; initial: ContractData; saved: boolean; updatedNote: string;
  /** What the person wrote on the intake form, shown beside the blanks for reference. */
  intake: { label: string; value: string }[];
};

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";
const lab = "mb-1 block text-xs font-semibold";

/** Fill in the blanks of the Texas Mexico Law engagement letter, then download it as Word or PDF. */
export function ContractBuilder({ leadId, backHref, partnerName, initial, saved, updatedNote, intake }: Props) {
  const [d, setD] = useState<ContractData>(initial);
  const [dirty, setDirty] = useState(!saved);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ContractData>(k: K, v: ContractData[K]) => { setD((p) => ({ ...p, [k]: v })); setDirty(true); setMsg(null); };
  const notes = useMemo(() => letterNotes(d), [d]);
  const missing = notes.blank;
  const miss = (k: string) => missing.some((m) => m.key === k);
  const cls = (k: string) => `${input} ${miss(k) ? "border-amber-400 bg-amber-50/40" : ""}`;
  const file = (format: "docx" | "pdf", inline = false) => `/admin/intake/contract/${leadId}/file?format=${format}${inline ? "&inline=1" : ""}`;

  // Downloads are made from what is saved, so save first if anything changed.
  const withSave = (then?: () => void) => {
    setMsg(null);
    start(async () => {
      if (dirty) {
        const r = await saveContract({ leadId, data: d });
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        setDirty(false);
        setMsg({ ok: true, text: r.blanks === 0 ? "Saved." : `Saved. ${r.blanks} field${r.blanks === 1 ? "" : "s"} will print blank.` });
      }
      then?.();
    });
  };
  const paid = d.schedule.reduce((t, r) => t + (Number(r.amount.replace(/[$,\s]/g, "")) || 0), 0), ret = Number(d.retainer.replace(/[$,\s]/g, "")) || 0;
  const section = (title: string, children: React.ReactNode, note?: string) => (
    <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">{note}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
  const pair = (kEn: "matterEn" | "matterTypeEn" | "exclusionsEn" | "tasksEn", kEs: "matterEs" | "matterTypeEs" | "exclusionsEs" | "tasksEs", label: string, opts: { rows?: number; phEn?: string; phEs?: string; optional?: boolean } = {}) => (
    <div>
      <p className={lab}>{label}{opts.optional ? <span className="font-normal text-[var(--c-ink-muted)]"> (optional)</span> : null}</p>
      <div className="grid gap-2 md:grid-cols-2">
        {([[kEn, "English", opts.phEn], [kEs, "Español", opts.phEs]] as const).map(([k, tag, ph]) => (
          <label key={k} className="block"><span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">{tag}</span>
            {opts.rows ? <textarea rows={opts.rows} className={cls(k)} value={d[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} data-testid={`ct-${k}`} />
              : <input className={cls(k)} value={d[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} data-testid={`ct-${k}`} />}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8" data-testid="contract-builder">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><ArrowLeft size={13} /> Back to the {partnerName} tab</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl">Engagement letter — {d.clientName || "new client"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--c-ink-muted)]">Your Word letter for {partnerName} cases, English and Spanish. What the person entered on the intake form is already filled in; complete the rest. Whatever you download is a finished letter: no yellow and no placeholders. Optional parts you leave empty are left out, and any other empty field prints blank.</p>
          {updatedNote && <p className="mt-1 text-xs text-[var(--c-ink-muted)]" data-testid="ct-updated">{updatedNote}</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          {section("Client and address", <>
            <div className="grid gap-3 md:grid-cols-[10rem_1fr_1fr]">
              <label><span className={lab}>Letter date</span><input type="date" className={cls("date")} value={d.date} onChange={(e) => set("date", e.target.value)} data-testid="ct-date" /></label>
              <label><span className={lab}>Client name</span><input className={cls("clientName")} value={d.clientName} onChange={(e) => set("clientName", e.target.value)} data-testid="ct-clientName" /></label>
              <label><span className={lab}>Client email <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></span><input type="email" className={cls("clientEmail")} value={d.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} data-testid="ct-clientEmail" /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_12rem_5rem_7rem]">
              <label><span className={lab}>Street address</span><input className={cls("street")} value={d.street} onChange={(e) => set("street", e.target.value)} data-testid="ct-street" /></label>
              <label><span className={lab}>City</span><input className={cls("city")} value={d.city} onChange={(e) => set("city", e.target.value)} data-testid="ct-city" /></label>
              <label><span className={lab}>State</span><input className={cls("city")} value={d.state} onChange={(e) => set("state", e.target.value)} data-testid="ct-state" /></label>
              <label><span className={lab}>ZIP</span><input className={cls("city")} value={d.zip} onChange={(e) => set("zip", e.target.value)} data-testid="ct-zip" /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
              <label><span className={lab}>Greeting</span><select className={cls("lastName")} value={d.title} onChange={(e) => set("title", e.target.value)} data-testid="ct-title"><option value="">Full name, no title</option><option value="Mr.">Mr. / Sr.</option><option value="Ms.">Ms. / Sra.</option></select></label>
              <label><span className={lab}>Last name for the greeting</span><input className={cls("lastName")} value={d.lastName} onChange={(e) => set("lastName", e.target.value)} disabled={!d.title} data-testid="ct-lastName" /></label>
            </div>
          </>)}

          {section("The matter (the RE line)", <>
            <label className="block"><span className={lab}>Case style or matter</span><input className={cls("caseStyle")} value={d.caseStyle} onChange={(e) => set("caseStyle", e.target.value)} placeholder="Ridgeline Properties LLC v. Maria Lopez; or Estate of Juan Lopez" data-testid="ct-caseStyle" /></label>
            <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
              <label><span className={lab}>Court <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></span><input className={cls("court")} value={d.court} onChange={(e) => set("court", e.target.value)} disabled={d.noCourt} placeholder="County Court at Law No. 1; Cause No. …" data-testid="ct-court" /></label>
              <label><span className={lab}>County</span><input className={cls("county")} value={d.county} onChange={(e) => set("county", e.target.value)} placeholder="Tarrant" data-testid="ct-county" /></label>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={d.noCourt} onChange={(e) => set("noCourt", e.target.checked)} data-testid="ct-noCourt" /> Nothing is filed yet — leave the court out of the RE line</label>
          </>)}

          {section("Scope of representation", <>
            {pair("matterEn", "matterEs", "“My office will represent you in …”", { phEn: "defending the lawsuit filed against you by Ridgeline Properties LLC", phEs: "la defensa de la demanda presentada en su contra por Ridgeline Properties LLC" })}
            {pair("matterTypeEn", "matterTypeEs", "Matter type (the heading above the task list)", { optional: true, phEn: "Civil Defense", phEs: "Defensa civil" })}
            {pair("tasksEn", "tasksEs", "Specific task or tasks, one per line (they go ahead of the three standard items; with none, the list is just the standard items)", { optional: true, rows: 3, phEn: "Draft and file an original answer", phEs: "Redactar y presentar una contestación original" })}
            {pair("exclusionsEn", "exclusionsEs", "Other exclusions", { optional: true, phEn: "any counterclaim against third parties", phEs: "cualquier reconvención contra terceros" })}
          </>, "The Spanish half of the letter needs its own wording for these.")}

          {section("Fees", <>
            <div className="grid gap-3 md:grid-cols-3">
              <label><span className={lab}>Retainer ($)</span><input className={cls("retainer")} value={d.retainer} onChange={(e) => set("retainer", e.target.value)} inputMode="decimal" placeholder="5,000" data-testid="ct-retainer" /></label>
              <label><span className={lab}>Minimum trust balance ($) <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></span><input className={cls("minBalance")} value={d.minBalance} onChange={(e) => set("minBalance", e.target.value)} inputMode="decimal" placeholder="1,500" data-testid="ct-minBalance" /></label>
              <label><span className={lab}>Trial retainer ($) <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></span><input className={cls("trialRetainer")} value={d.trialRetainer} onChange={(e) => set("trialRetainer", e.target.value)} inputMode="decimal" placeholder="7,500" data-testid="ct-trialRetainer" /></label>
            </div>
            <div>
              <p className={lab}>Payment plan <span className="font-normal text-[var(--c-ink-muted)]">(optional — with no rows, the schedule is left out of the letter)</span></p>
              <div className={`space-y-2 rounded-md p-2 ${miss("schedule") ? "border border-amber-400 bg-amber-50/40" : "border border-[var(--c-border)]"}`} data-testid="ct-schedule">
                {d.schedule.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input type="date" className={`${input} w-44`} value={r.date} onChange={(e) => set("schedule", d.schedule.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} aria-label={`Payment ${i + 1} date`} data-testid={`ct-sched-date-${i}`} />
                    <input className={`${input} w-36`} value={r.amount} onChange={(e) => set("schedule", d.schedule.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" placeholder="Amount" aria-label={`Payment ${i + 1} amount`} data-testid={`ct-sched-amount-${i}`} />
                    <button type="button" onClick={() => set("schedule", d.schedule.filter((_, j) => j !== i))} className="rounded p-1.5 text-[var(--c-ink-muted)] hover:bg-[var(--c-bg)]" aria-label={`Remove payment ${i + 1}`}><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button type="button" onClick={() => set("schedule", [...d.schedule, { date: d.schedule.length === 0 ? d.openUntil : "", amount: d.schedule.length === 0 ? d.retainer : "" }])} className="inline-flex items-center gap-1 text-[var(--c-accent)] hover:underline" data-testid="ct-sched-add"><Plus size={13} /> Add a payment</button>
                  {d.schedule.length > 0 && ret > 0 && <span className={Math.abs(paid - ret) < 0.005 ? "text-emerald-700" : "text-amber-800"} data-testid="ct-sched-sum">Payments total ${money(String(paid))}{Math.abs(paid - ret) < 0.005 ? ", the full retainer." : `; the retainer is $${money(d.retainer)}.`}</span>}
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label><span className={lab}>Attorney rate ($/hour)</span><input className={input} value={d.attorneyRate} onChange={(e) => set("attorneyRate", e.target.value)} inputMode="decimal" data-testid="ct-attorneyRate" /></label>
              <label><span className={lab}>Contract / associate rate ($/hour)</span><input className={input} value={d.associateRate} onChange={(e) => set("associateRate", e.target.value)} inputMode="decimal" data-testid="ct-associateRate" /></label>
              <label><span className={lab}>Office staff rate ($/hour)</span><input className={input} value={d.staffRate} onChange={(e) => set("staffRate", e.target.value)} inputMode="decimal" data-testid="ct-staffRate" /></label>
            </div>
            <p className="text-xs text-[var(--c-ink-muted)]">Standard rates are ${money(d.standardAttorneyRate)} (attorney) and ${money(d.standardAssociateRate)} (contract / associate). A rate below the standard shows the standard struck through beside it, as in your letter; at or above it, only the rate shows.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label><span className={lab}>Representation begins when</span><select className={cls("startWhen")} value={d.startWhen} onChange={(e) => set("startWhen", e.target.value as ContractData["startWhen"])} data-testid="ct-startWhen"><option value="">Automatic: {resolvedStartWhen({ startWhen: "", schedule: d.schedule }) === "first" ? "the first scheduled payment has been received" : "the retainer has been paid in full"}</option><option value="full">the retainer has been paid in full</option><option value="first">the first scheduled payment has been received</option></select></label>
              <label><span className={lab}>Offer open until (5:00 p.m.)</span><input type="date" className={cls("openUntil")} value={d.openUntil} onChange={(e) => set("openUntil", e.target.value)} data-testid="ct-openUntil" /></label>
            </div>
          </>)}

          {section("Associated counsel", <>
            <label className="block"><span className={lab}>Associated counsel <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></span><input className={input} value={d.associatedCounsel} onChange={(e) => set("associatedCounsel", e.target.value)} placeholder="Name of the other attorney or firm" data-testid="ct-associatedCounsel" /></label>
            <p className="text-xs text-[var(--c-ink-muted)]">Left empty, the letter reads “My office may associate other counsel at its discretion.”</p>
          </>)}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className={`rounded-lg border p-4 ${missing.length === 0 ? "border-emerald-300 bg-emerald-50 text-[#1c1917]" : "border-amber-300 bg-amber-50 text-[#1c1917]"}`} data-testid="ct-status">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">{missing.length === 0 ? <><CheckCircle2 size={16} className="text-emerald-700" /> Ready to download</> : <><CircleAlert size={16} className="text-amber-700" /> {missing.length} field{missing.length === 1 ? "" : "s"} will print blank</>}</p>
            {missing.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs" data-testid="ct-missing">{missing.map((m) => <li key={m.key}>{m.label}</li>)}</ul>}
            {missing.length > 0 && <p className="mt-2 text-[11px] leading-relaxed">You can still download: these print as an empty space, with no placeholder and no highlight.</p>}
          </div>
          {notes.omitted.length > 0 && (
            <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="ct-omitted">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Left out of this letter</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">{notes.omitted.map((m) => <li key={m.key}>{m.label}</li>)}</ul>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">Fill a field in to put its part back.</p>
            </div>
          )}
          <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
            <div className="flex flex-col gap-2">
              <button type="button" disabled={pending || !dirty} onClick={() => withSave()} className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-50" data-testid="ct-save"><Save size={15} /> {pending ? "Saving…" : dirty ? "Save" : "Saved"}</button>
              <button type="button" disabled={pending} onClick={() => withSave(() => { window.location.href = file("docx"); })} className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="ct-docx"><FileText size={15} /> Download Word</button>
              <button type="button" disabled={pending} onClick={() => withSave(() => { window.location.href = file("pdf"); })} className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="ct-pdf"><FileDown size={15} /> Download PDF</button>
              <button type="button" disabled={pending} onClick={() => withSave(() => { window.open(file("pdf", true), "_blank", "noopener"); })} className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--c-border)] px-4 py-2 text-sm hover:border-[var(--c-accent)] disabled:opacity-50" data-testid="ct-preview"><Eye size={15} /> Preview the PDF</button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">Downloading saves first. The PDF takes a few seconds. Both come from your Word letter, so the letterhead, footers and formatting are yours.</p>
            {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid="ct-msg">{msg.text}</p>}
          </div>
          {intake.length > 0 && (
            <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="ct-intake">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">From the intake form</p>
              <dl className="mt-2 space-y-2 text-xs">{intake.map((x) => <div key={x.label}><dt className="text-[var(--c-ink-muted)]">{x.label}</dt><dd className="whitespace-pre-wrap leading-relaxed">{x.value}</dd></div>)}</dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
