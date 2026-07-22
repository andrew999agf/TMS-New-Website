"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarClock, Check, Download, Printer } from "lucide-react";
import { getPunchRange, savePayrollSchedule, type PayrollSchedule, type RangePunch } from "@/app/admin/(panel)/timeclock/actions";

const IN = "border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-xs";
const CT = "America/Chicago";

/* ------------------------------ payday math ------------------------------ */

const dayMs = 86_400_000;
const atNoon = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function nextPayday(cfg: PayrollSchedule, todayIso: string): Date {
  const today = atNoon(todayIso);
  if (cfg.frequency === "semimonthly") {
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    if (d <= 1) return new Date(y, m, 1, 12);
    if (d <= 15) return new Date(y, m, 15, 12);
    return new Date(y, m + 1, 1, 12);
  }
  const anchor = atNoon(cfg.anchorPayday);
  if (cfg.frequency === "monthly") {
    const dom = anchor.getDate();
    const cand = new Date(today.getFullYear(), today.getMonth(), dom, 12);
    return cand >= today ? cand : new Date(today.getFullYear(), today.getMonth() + 1, dom, 12);
  }
  const period = cfg.frequency === "weekly" ? 7 : 14;
  const diff = Math.round((today.getTime() - anchor.getTime()) / dayMs);
  const k = diff <= 0 ? 0 : Math.ceil(diff / period);
  return new Date(anchor.getTime() + k * period * dayMs);
}

const fmtLong = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const daysUntil = (d: Date, todayIso: string) => Math.round((d.getTime() - atNoon(todayIso).getTime()) / dayMs);

/* ------------------------------ payroll card ------------------------------ */

export function PayrollScheduleCard({ initial }: { initial: PayrollSchedule }) {
  const [cfg, setCfg] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const todayIso = toIso(new Date());

  const payday = nextPayday(cfg, todayIso);
  const deadline = new Date(payday.getTime() - cfg.leadDays * dayMs);
  const dLeft = daysUntil(deadline, todayIso);
  const tone = dLeft < 0 ? "text-[var(--c-error)]" : dLeft <= 2 ? "text-amber-600" : "text-[var(--c-ink-muted)]";

  function save() {
    setError(null);
    start(async () => {
      try {
        const res = await savePayrollSchedule(cfg);
        if (!res.ok) setError(res.error ?? "Couldn't save.");
        else {
          setSaved(true);
          setTimeout(() => setSaved(false), 2200);
        }
      } catch {
        // Never escalate to the error page — a stale tab after a deploy is the
        // usual culprit; a refresh re-links the form to the live server.
        setError("Save didn't go through. Refresh this page and try again.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <CalendarClock size={15} className="text-[var(--c-accent)]" /> Payroll schedule
      </p>
      <p className="text-sm">
        Next payday: <strong>{fmtLong(payday)}</strong>
        <span className={`ml-3 ${tone}`}>
          Payroll deadline: <strong>{fmtLong(deadline)}</strong>
          {dLeft >= 0 ? ` (${dLeft === 0 ? "today" : `in ${dLeft} day${dLeft === 1 ? "" : "s"}`})` : " — overdue"}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Pay frequency</span>
          <select value={cfg.frequency} onChange={(e) => setCfg((c) => ({ ...c, frequency: e.target.value as PayrollSchedule["frequency"] }))} className={IN}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="semimonthly">Twice a month (1st &amp; 15th)</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        {cfg.frequency !== "semimonthly" && (
          <label className="text-xs">
            <span className="mb-1 block text-[var(--c-ink-muted)]">A known payday (anchors the pattern)</span>
            <input type="date" value={cfg.anchorPayday} onChange={(e) => setCfg((c) => ({ ...c, anchorPayday: e.target.value }))} className={IN} />
          </label>
        )}
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Finalize payroll (days before)</span>
          <input type="number" min={0} max={14} value={cfg.leadDays} onChange={(e) => setCfg((c) => ({ ...c, leadDays: parseInt(e.target.value, 10) || 0 }))} className={`${IN} w-24`} />
        </label>
        <button onClick={save} disabled={pending} className="rounded bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {saved ? <Check size={12} className="mr-0.5 inline" /> : null} {saved ? "Saved" : "Save schedule"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
    </div>
  );
}

/* ------------------------------ report card ------------------------------ */

type PeopleMode = "all" | "with-hours" | "selected";

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: CT, weekday: "short", month: "numeric", day: "numeric" }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: CT, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const hoursOf = (p: RangePunch) => (p.clockOut ? Math.max(0, (new Date(p.clockOut).getTime() - new Date(p.clockIn).getTime()) / 3_600_000) : null);
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function TimeClockReportCard({ people }: { people: { id: number; name: string }[] }) {
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 13 * dayMs);
  const [from, setFrom] = useState(toIso(twoWeeksAgo));
  const [to, setTo] = useState(toIso(today));
  const [mode, setMode] = useState<PeopleMode>("with-hours");
  const [selected, setSelected] = useState<number[]>(people.map((p) => p.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const label = useMemo(() => `${from} to ${to}`, [from, to]);

  /** Fetch, filter by the people mode, and group per person. */
  async function collect(): Promise<{ name: string; rows: RangePunch[]; total: number }[] | null> {
    setError(null);
    let res: Awaited<ReturnType<typeof getPunchRange>>;
    try {
      res = await getPunchRange(`${from}T00:00:00`, `${to}T23:59:59`);
    } catch {
      setError("Couldn't load the data. Refresh this page and try again.");
      return null;
    }
    if (res.error) {
      setError(res.error);
      return null;
    }
    const byId = new Map<number, RangePunch[]>();
    for (const p of res.punches) byId.set(p.adminId, [...(byId.get(p.adminId) ?? []), p]);
    // Roster: hourly staff plus anyone with punches in range (covers ex-hourly).
    const roster = new Map<number, string>(people.map((p) => [p.id, p.name]));
    for (const p of res.punches) if (!roster.has(p.adminId)) roster.set(p.adminId, p.name);
    let list = [...roster.entries()].map(([id, name]) => {
      const rows = byId.get(id) ?? [];
      const total = rows.reduce((n, p) => n + (hoursOf(p) ?? 0), 0);
      return { id, name, rows, total };
    });
    if (mode === "with-hours") list = list.filter((x) => x.rows.length > 0);
    if (mode === "selected") list = list.filter((x) => selected.includes(x.id));
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (list.length === 0) setError("No one matches that filter in this range.");
    return list.map(({ name, rows, total }) => ({ name, rows, total }));
  }

  function downloadCsv() {
    start(async () => {
      const groups = await collect();
      if (!groups || groups.length === 0) return;
      const lines = ["Person,Date,Day,Clock In,Clock Out,Hours"];
      let grand = 0;
      for (const g of groups) {
        for (const p of g.rows) {
          const h = hoursOf(p);
          lines.push([g.name, fmtDate(p.clockIn), fmtDay(p.clockIn), fmtTime(p.clockIn), p.clockOut ? fmtTime(p.clockOut) : "STILL CLOCKED IN", h != null ? h.toFixed(2) : ""].map(csvCell).join(","));
        }
        lines.push([g.name, "TOTAL", "", "", "", g.total.toFixed(2)].map(csvCell).join(","));
        grand += g.total;
      }
      lines.push(["ALL SELECTED", "TOTAL", "", "", "", grand.toFixed(2)].map(csvCell).join(","));
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement("a");
      aEl.href = url;
      aEl.download = `time-clock-${from}_${to}.csv`;
      aEl.click();
      URL.revokeObjectURL(url);
    });
  }

  function printReport() {
    start(async () => {
      const groups = await collect();
      if (!groups || groups.length === 0) return;
      let grand = 0;
      const sections = groups
        .map((g) => {
          grand += g.total;
          const rows = g.rows
            .map((p) => {
              const h = hoursOf(p);
              return `<tr><td>${fmtDay(p.clockIn)}</td><td>${fmtTime(p.clockIn)}</td><td>${p.clockOut ? fmtTime(p.clockOut) : "<em>still clocked in</em>"}</td><td class="r">${h != null ? h.toFixed(2) : "—"}</td></tr>`;
            })
            .join("");
          return `<h2>${esc(g.name)} <span class="tot">${g.total.toFixed(2)} hrs</span></h2>${
            g.rows.length
              ? `<table><tr><th>Day</th><th>In</th><th>Out</th><th class="r">Hours</th></tr>${rows}</table>`
              : `<p class="none">No punches in this period.</p>`
          }`;
        })
        .join("");
      const w = window.open("", "_blank");
      if (!w) {
        setError("Pop-up blocked — allow pop-ups to print the report.");
        return;
      }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Time Clock Report</title><style>
        body{font-family:Georgia,'Times New Roman',serif;color:#161616;max-width:7.5in;margin:24px auto;padding:0 16px}
        .hd{border-bottom:2px solid #7a1f2b;padding-bottom:8px;margin-bottom:4px}
        .hd h1{margin:0;font-size:20px}
        .hd p{margin:2px 0 0;color:#666;font-size:12px}
        h2{font-size:14px;margin:20px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
        h2 .tot{float:right;font-weight:bold}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th{color:#777;text-align:left;font-weight:600;padding:3px 10px 3px 0;border-bottom:1px solid #ddd}
        td{padding:3px 10px 3px 0;border-bottom:1px solid #f0f0f0}
        .r{text-align:right}
        .grand{margin-top:18px;font-size:14px;font-weight:bold;border-top:2px solid #7a1f2b;padding-top:8px}
        .none{color:#888;font-size:12px;margin:2px 0 0}
        @media print{body{margin:0 auto}}
      </style></head><body>
        <div class="hd"><h1>T. Maxwell Smith, PLLC — Time Clock Report</h1>
        <p>Period: ${esc(label)} (Central Time) · Generated ${new Date().toLocaleString()}</p></div>
        ${sections}
        <div class="grand">Total — all listed staff: ${grand.toFixed(2)} hours</div>
      </body></html>`);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
      <p className="mb-2 text-sm font-semibold">Payroll report</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={IN} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Through</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={IN} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--c-ink-muted)]">Include</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as PeopleMode)} className={IN}>
            <option value="with-hours">Only people with hours</option>
            <option value="all">All employees</option>
            <option value="selected">Specific people…</option>
          </select>
        </label>
        <button onClick={downloadCsv} disabled={pending} className="flex items-center gap-1.5 rounded bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          <Download size={12} /> CSV
        </button>
        <button onClick={printReport} disabled={pending} className="flex items-center gap-1.5 rounded border border-[var(--c-border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--c-accent)] disabled:opacity-50">
          <Printer size={12} /> Print / PDF
        </button>
      </div>
      {mode === "selected" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {people.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setSelected((sel) => (on ? sel.filter((x) => x !== p.id) : [...sel, p.id]))}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${on ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-accent)]" : "border-[var(--c-border)] text-[var(--c-ink-muted)]"}`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[var(--c-error)]">{error}</p>}
      <p className="mt-2 text-[11px] text-[var(--c-ink-muted)]">Times in Central Time. Use the browser print dialog&apos;s &quot;Save as PDF&quot; for a PDF copy.</p>
    </div>
  );
}
