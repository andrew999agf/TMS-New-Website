"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Archive, Trash2, Loader2, Check, Users } from "lucide-react";
import { updateTimeEntry, setTimeEntriesArchived, deleteTimeEntry } from "@/app/admin/(panel)/time-tracker/actions";

export type ReviewEntry = {
  id: number;
  person: string;
  ownerName: string;
  matter: string;
  entryDate: string;
  activityDescription: string;
  note: string;
  price: number;
  quantity: number;
  activityUserName: string;
  nonBillable: boolean;
};

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function BillingReview({ entries, people, matters, initialUser, initialDate }: { entries: ReviewEntry[]; people: string[]; matters: { displayNumber: string; description: string }[]; initialUser: string; initialDate: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(entries);
  useEffect(() => { setRows(entries); }, [entries]);

  const [person, setPerson] = useState(initialUser && people.includes(initialUser) ? initialUser : "All");
  const [from, setFrom] = useState(initialDate || todayIso());
  const [to, setTo] = useState(initialDate || todayIso());
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return rows
      .filter((e) => (person === "All" ? true : e.person === person))
      .filter((e) => e.entryDate >= from && e.entryDate <= to)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || a.person.localeCompare(b.person));
  }, [rows, person, from, to]);

  const totals = useMemo(() => {
    let b = 0, n = 0, dollars = 0;
    for (const e of filtered) {
      const q = e.quantity || 0;
      if (e.nonBillable) n += q; else { b += q; dollars += q * (e.price || 0); }
    }
    return { billable: b, nonBillable: n, total: b + n, dollars, count: filtered.length };
  }, [filtered]);
  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function patchLocal(id: number, patch: Partial<ReviewEntry>) {
    setRows((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  async function save(id: number, patch: Partial<ReviewEntry>) {
    setSavingId(id);
    const res = await updateTimeEntry(id, {
      matter: patch.matter, activityDescription: patch.activityDescription, note: patch.note,
      price: patch.price, quantity: patch.quantity, activityUserName: patch.activityUserName, nonBillable: patch.nonBillable,
    });
    setSavingId(null);
    if (res.ok) { setSavedId(id); setTimeout(() => setSavedId((s) => (s === id ? null : s)), 1200); }
  }
  function archive(id: number) {
    setRows((cur) => cur.filter((e) => e.id !== id));
    setTimeEntriesArchived([id], true).then(() => router.refresh());
  }
  function remove(id: number) {
    if (!confirm("Delete this time entry? This can't be undone.")) return;
    setRows((cur) => cur.filter((e) => e.id !== id));
    deleteTimeEntry(id).then(() => router.refresh());
  }

  // Move between employees (skips "All").
  const idx = people.indexOf(person);
  const stepPerson = (dir: number) => {
    if (person === "All") { if (people.length) setPerson(dir > 0 ? people[0] : people[people.length - 1]); return; }
    const next = idx + dir;
    if (next < 0) setPerson("All");
    else if (next >= people.length) setPerson("All");
    else setPerson(people[next]);
  };

  const preset = (label: string, f: () => { from: string; to: string }) => (
    <button onClick={() => { const r = f(); setFrom(r.from); setTo(r.to); }} className="rounded-md border border-[var(--c-border)] px-2.5 py-1 text-xs hover:bg-[var(--c-surface2)]">{label}</button>
  );
  const weekRange = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; const mon = new Date(d); mon.setDate(d.getDate() - day); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; return { from: iso(mon), to: iso(sun) }; };
  const monthRange = () => { const d = new Date(); const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }; };

  const cell = "border-b border-[var(--c-border)] px-2 py-1.5 align-top";
  const inp = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-[var(--c-border)] focus:border-[var(--c-accent)] focus:bg-[var(--c-bg)] outline-none";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--c-ink-muted)]">Employee</label>
          <div className="flex items-center gap-1">
            <button onClick={() => stepPerson(-1)} title="Previous" className="rounded-md border border-[var(--c-border)] p-1.5 hover:bg-[var(--c-surface2)]"><ChevronLeft size={15} /></button>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className="min-w-[12rem] rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm">
              <option value="All">All employees</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => stepPerson(1)} title="Next" className="rounded-md border border-[var(--c-border)] p-1.5 hover:bg-[var(--c-surface2)]"><ChevronRight size={15} /></button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--c-ink-muted)]">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--c-ink-muted)]">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-center gap-1.5 pb-0.5">
          {preset("Today", () => ({ from: todayIso(), to: todayIso() }))}
          {preset("This week", weekRange)}
          {preset("This month", monthRange)}
        </div>
      </div>

      {/* Totals */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium"><Users size={14} className="text-[var(--c-accent)]" /> {person === "All" ? "All employees" : person}</span>
        <span><span className="text-[var(--c-ink-muted)]">Billable</span> <strong>{totals.billable.toFixed(2)}</strong></span>
        <span><span className="text-[var(--c-ink-muted)]">Non-billable</span> <strong>{totals.nonBillable.toFixed(2)}</strong></span>
        <span><span className="text-[var(--c-ink-muted)]">Total</span> <strong>{totals.total.toFixed(2)} hrs</strong></span>
        <span className="rounded-md bg-[var(--c-accent)]/10 px-2 py-0.5"><span className="text-[var(--c-ink-muted)]">Billable value</span> <strong className="text-[var(--c-accent)]">{money(totals.dollars)}</strong></span>
        <span className="text-[var(--c-ink-muted)]">{totals.count} {totals.count === 1 ? "entry" : "entries"}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--c-border)]">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-[var(--c-surface2)] text-left text-xs text-[var(--c-ink-muted)]">
            <tr>
              <th className="px-2 py-2 font-medium">Date</th>
              {person === "All" && <th className="px-2 py-2 font-medium">Person</th>}
              <th className="px-2 py-2 font-medium">Matter</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="px-2 py-2 font-medium text-right">Hours</th>
              <th className="px-2 py-2 font-medium text-right" title="The rate billed to the client on this entry (per hour)">Rate&nbsp;(billed/hr)</th>
              <th className="px-2 py-2 font-medium text-right">Amount</th>
              <th className="px-2 py-2 font-medium text-center">Billable</th>
              <th className="px-2 py-2 font-medium text-right">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={person === "All" ? 9 : 8} className="px-3 py-10 text-center text-[var(--c-ink-muted)]">No live entries for this selection.</td></tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="bg-[var(--c-surface)]">
                <td className={`${cell} whitespace-nowrap text-[var(--c-ink-muted)]`}>{fmtDate(e.entryDate)}</td>
                {person === "All" && <td className={`${cell} whitespace-nowrap`}>{e.person}</td>}
                <td className={cell}>
                  <input list="billing-matters" defaultValue={e.matter} onChange={(ev) => patchLocal(e.id, { matter: ev.target.value })} onBlur={(ev) => save(e.id, { ...e, matter: ev.target.value })} className={`${inp} min-w-[9rem]`} />
                </td>
                <td className={cell}>
                  <input defaultValue={e.activityDescription} onChange={(ev) => patchLocal(e.id, { activityDescription: ev.target.value })} onBlur={(ev) => save(e.id, { ...e, activityDescription: ev.target.value })} className={`${inp} min-w-[12rem]`} />
                </td>
                <td className={`${cell} text-right`}>
                  <input type="number" step="0.1" inputMode="decimal" defaultValue={e.quantity} onChange={(ev) => patchLocal(e.id, { quantity: Number(ev.target.value) })} onBlur={(ev) => save(e.id, { ...e, quantity: Number(ev.target.value) })} className={`${inp} w-20 text-right`} />
                </td>
                <td className={`${cell} text-right`}>
                  <span className="inline-flex items-center gap-0.5"><span className="text-[var(--c-ink-muted)]">$</span>
                    <input type="number" step="1" inputMode="decimal" defaultValue={e.price} onChange={(ev) => patchLocal(e.id, { price: Number(ev.target.value) })} onBlur={(ev) => save(e.id, { ...e, price: Number(ev.target.value) })} className={`${inp} w-24 text-right`} />
                  </span>
                </td>
                <td className={`${cell} whitespace-nowrap text-right font-medium ${e.nonBillable ? "text-[var(--c-ink-muted)] line-through" : "text-[var(--c-ink)]"}`}>{money((e.quantity || 0) * (e.price || 0))}</td>
                <td className={`${cell} text-center`}>
                  <input type="checkbox" checked={!e.nonBillable} onChange={(ev) => { const nb = !ev.target.checked; patchLocal(e.id, { nonBillable: nb }); save(e.id, { ...e, nonBillable: nb }); }} />
                </td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  {savingId === e.id ? <Loader2 size={14} className="inline animate-spin text-[var(--c-ink-muted)]" /> : savedId === e.id ? <Check size={14} className="inline text-green-600" /> : null}
                  <button onClick={() => archive(e.id)} title="Archive (remove from live)" className="ml-1 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><Archive size={15} /></button>
                  <button onClick={() => remove(e.id)} title="Delete" className="rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="billing-matters">
          {matters.map((m) => <option key={m.displayNumber} value={m.displayNumber}>{m.description}</option>)}
        </datalist>
      </div>
      <p className="text-xs text-[var(--c-ink-muted)]">Edits save automatically as you leave a field. Archiving removes an entry from the live list (it&apos;s kept, not deleted). Only live entries are shown here.</p>
    </div>
  );
}
