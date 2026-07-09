"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { updatePunch, addPunch, deletePunch } from "@/app/admin/(panel)/timeclock/actions";

export type PunchView = { id: number; adminId: number; name: string; clockIn: string; clockOut: string | null };

const CT = "America/Chicago";
const IN = "border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-xs";

/** Local-device datetime-local input value for an ISO instant. */
function toInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

/** The punch's week bucket: its Monday's date in Central Time. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short" }).format(d));
  const [y, m, day] = ymd.split("-").map(Number);
  const mon = new Date(Date.UTC(y, m - 1, day) - Math.max(dow, 0) * 86_400_000);
  return mon.toISOString().slice(0, 10);
}
const fmtWeek = (key: string) => {
  const mon = new Date(`${key}T12:00:00Z`);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  const f = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  return `Week of ${f(mon)} – ${f(sun)}`;
};
const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short", month: "numeric", day: "numeric" }).format(new Date(iso));
const hoursOf = (p: PunchView): number | null => (p.clockOut ? Math.max(0, (new Date(p.clockOut).getTime() - new Date(p.clockIn).getTime()) / 3_600_000) : null);

function PunchRow({ p, canEdit, showName }: { p: PunchView; canEdit: boolean; showName: boolean }) {
  const [inVal, setInVal] = useState(toInput(p.clockIn));
  const [outVal, setOutVal] = useState(p.clockOut ? toInput(p.clockOut) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dirty = inVal !== toInput(p.clockIn) || outVal !== (p.clockOut ? toInput(p.clockOut) : "");
  const hrs = hoursOf(p);

  function save() {
    setError(null);
    start(async () => {
      const res = await updatePunch(p.id, new Date(inVal).toISOString(), fromInput(outVal));
      if (!res.ok) setError(res.error ?? "Couldn't save.");
    });
  }

  return (
    <tr className="border-t border-[var(--c-border)]">
      {showName && <td className="px-3 py-2 text-sm font-medium whitespace-nowrap">{p.name}</td>}
      <td className="px-3 py-2 text-xs text-[var(--c-ink-muted)] whitespace-nowrap">{fmtDay(p.clockIn)}</td>
      <td className="px-3 py-2">
        {canEdit ? <input type="datetime-local" value={inVal} onChange={(e) => setInVal(e.target.value)} className={IN} /> : new Date(p.clockIn).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </td>
      <td className="px-3 py-2">
        {canEdit ? (
          <input type="datetime-local" value={outVal} onChange={(e) => setOutVal(e.target.value)} className={IN} />
        ) : p.clockOut ? (
          new Date(p.clockOut).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        ) : (
          <span className="text-xs text-amber-600">on the clock</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums">
        {hrs != null ? hrs.toFixed(2) : <span title="No clock-out yet"><AlertTriangle size={14} className="inline text-amber-500" /></span>}
      </td>
      {canEdit && (
        <td className="px-3 py-2 whitespace-nowrap">
          {dirty && (
            <button onClick={save} disabled={pending} className="mr-2 rounded bg-[var(--c-success,#15803d)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
              <Check size={12} className="mr-0.5 inline" /> Save
            </button>
          )}
          <button
            onClick={() => { if (confirm("Delete this punch?")) start(async () => { await deletePunch(p.id); }); }}
            disabled={pending}
            className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"
            title="Delete punch"
          >
            <Trash2 size={14} />
          </button>
          {error && <span className="ml-2 text-xs text-[var(--c-error)]">{error}</span>}
        </td>
      )}
    </tr>
  );
}

/**
 * Time-clock history and fix-entry tools. Full admins see everyone and can
 * correct times, add a forgotten shift, or delete a bad punch; hourly staff
 * see their own history read-only. Grouped by Central-Time week to match the
 * Monday email report.
 */
export function TimeClockManager({ punches, people, canEdit }: { punches: PunchView[]; people: { id: number; name: string }[]; canEdit: boolean }) {
  const [addFor, setAddFor] = useState(people[0]?.id ?? 0);
  const [addIn, setAddIn] = useState("");
  const [addOut, setAddOut] = useState("");
  const [pending, start] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const map = new Map<string, PunchView[]>();
    for (const p of punches) map.set(weekKey(p.clockIn), [...(map.get(weekKey(p.clockIn)) ?? []), p]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [punches]);

  const showName = canEdit || new Set(punches.map((p) => p.adminId)).size > 1;

  function add() {
    setAddError(null);
    if (!addFor || !addIn) { setAddError("Pick a person and a clock-in time."); return; }
    start(async () => {
      const res = await addPunch(addFor, new Date(addIn).toISOString(), addOut ? new Date(addOut).toISOString() : null);
      if (!res.ok) setAddError(res.error ?? "Couldn't add.");
      else { setAddIn(""); setAddOut(""); }
    });
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
          <p className="mb-2 text-sm font-semibold">Add a missed shift</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-[var(--c-ink-muted)]">Person</span>
              <select value={addFor} onChange={(e) => setAddFor(Number(e.target.value))} className={IN}>
                {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[var(--c-ink-muted)]">Clock in</span>
              <input type="datetime-local" value={addIn} onChange={(e) => setAddIn(e.target.value)} className={IN} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[var(--c-ink-muted)]">Clock out (blank = still on)</span>
              <input type="datetime-local" value={addOut} onChange={(e) => setAddOut(e.target.value)} className={IN} />
            </label>
            <button onClick={add} disabled={pending} className="rounded bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Plus size={12} className="mr-0.5 inline" /> Add punch
            </button>
          </div>
          {addError && <p className="mt-2 text-xs text-[var(--c-error)]">{addError}</p>}
        </div>
      )}

      {weeks.length === 0 && <p className="text-sm text-[var(--c-ink-muted)]">No punches yet. The clock button in the sidebar records the first one.</p>}

      {weeks.map(([key, list]) => {
        const total = list.reduce((n, p) => n + (hoursOf(p) ?? 0), 0);
        const open = list.some((p) => !p.clockOut);
        return (
          <div key={key} className="overflow-hidden rounded-lg border border-[var(--c-border)]">
            <div className="flex items-center justify-between bg-[var(--c-surface-2,#efeae0)] px-4 py-2.5">
              <span className="text-sm font-semibold">{fmtWeek(key)}</span>
              <span className="text-xs text-[var(--c-ink-muted)]">
                {total.toFixed(2)} hrs{open ? " · has an open shift" : ""}
              </span>
            </div>
            <table className="w-full bg-[var(--c-surface)] text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--c-ink-muted)]">
                  {showName && <th className="px-3 pt-2 font-semibold">Person</th>}
                  <th className="px-3 pt-2 font-semibold">Day</th>
                  <th className="px-3 pt-2 font-semibold">In</th>
                  <th className="px-3 pt-2 font-semibold">Out</th>
                  <th className="px-3 pt-2 text-right font-semibold">Hours</th>
                  {canEdit && <th className="px-3 pt-2" />}
                </tr>
              </thead>
              <tbody>
                {list
                  .sort((a, b) => b.clockIn.localeCompare(a.clockIn))
                  .map((p) => <PunchRow key={`${p.id}-${p.clockIn}-${p.clockOut ?? ""}`} p={p} canEdit={canEdit} showName={showName} />)}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-xs text-[var(--c-ink-muted)]">Times shown in your device&apos;s timezone; weeks run Monday–Sunday (Central) to match the emailed report.</p>
    </div>
  );
}
