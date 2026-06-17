"use client";

/**
 * Legal Time Tracker — database-backed. Logic, CSV/clipboard format, and the
 * 6-minute / 0.1-hour rounding are preserved from the firm's original tool.
 * Entries are owned by the logged-in user (their own active board); exporting
 * to CSV can archive them so nothing is billed twice. Activity users,
 * categories, and matters are shared firm-wide (admin-managed).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, X, Upload, Play, Square, RotateCcw, Save, Download, Copy, ChevronDown, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import {
  addTimeEntry, updateTimeEntry, deleteTimeEntry, setTimeEntriesArchived,
  addActivityUser, updateActivityUser, deleteActivityUser,
  addCategory, updateCategory, deleteCategory, replaceMatters,
  type TimeEntryInput,
} from "@/app/admin/(panel)/time-tracker/actions";
import { VoiceTimeEntry } from "@/components/admin/VoiceTimeEntry";

export type EntryView = {
  id: number; ownerId: number; ownerName: string; matter: string; entryDate: string;
  activityDescription: string; note: string; price: number; quantity: number;
  activityUserName: string; nonBillable: boolean; status: "active" | "archived";
  exportedAt: string | null; exportedBy: string | null;
};
type AUser = { id: number; name: string; rate: number };
type Me = { id: number; name: string; admin: boolean };

const CSV_HEADERS = ["matter", "date", "activity_description", "note", "price", "quantity", "type", "activity_user", "non_billable", "ultims_activity_code", "ultims_task_code", "ultims_expense_code"];
const K_TIMER = "tms_tt_timer";

const fix = (n: number, d = 1) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
const getUserRole = (u: string) => (u.includes("Attorney") ? "Attorney" : "Legal Assistant");
const roundUpTo6 = (ms: number) => fix(Math.ceil(ms / 60000 / 6) * 0.1, 1);
const createActivityDescription = (cat: string, notes: string, user: string) => `${cat} - ${user.split(" (")[0]} (${getUserRole(user)}) - ${notes}`;
const formatTime = (ms: number) => { const t = Math.floor(ms / 1000); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60; return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`; };
const csvCell = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
const csvDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };
const todayISO = () => new Date().toISOString().split("T")[0];
function parseCSVLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out;
}

export function TimeTracker({ entries, activityUsers, categories, matters, me, owners }: {
  entries: EntryView[]; activityUsers: AUser[]; categories: { id: number; name: string }[];
  matters: { displayNumber: string; description: string }[]; me: Me; owners: { id: number; name: string }[];
}) {
  const router = useRouter();
  const matterList = useMemo(() => matters.map((m) => m.displayNumber), [matters]);
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const matterDesc = useMemo(() => Object.fromEntries(matters.map((m) => [m.displayNumber, m.description])), [matters]);
  const defaultUser = useMemo(() => activityUsers.find((u) => u.name.toLowerCase().startsWith(me.name.toLowerCase()))?.name ?? activityUsers[0]?.name ?? me.name, [activityUsers, me.name]);
  const getRate = useCallback((name: string) => activityUsers.find((u) => u.name === name)?.rate ?? 145, [activityUsers]);

  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "timer">("manual");
  const [view, setView] = useState<"active" | "archive">("active");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [exportPrompt, setExportPrompt] = useState<number[] | null>(null);

  const [ownerFilter, setOwnerFilter] = useState<number | "all">(me.id);
  const [archiveOwner, setArchiveOwner] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [manual, setManual] = useState({ matter: "", category: "", date: todayISO(), user: defaultUser, hours: "", rate: "", notes: "", nonBillable: false });
  const [tform, setTform] = useState({ matter: "", category: "", user: defaultUser, rate: "", notes: "", nonBillable: false });
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const note = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 2500); }, []);
  const run = useCallback((fn: () => Promise<unknown>) => { setPending(true); (async () => { await fn(); router.refresh(); setPending(false); })(); }, [router]);

  /* timer persistence + ticking */
  useEffect(() => {
    try {
      const s = localStorage.getItem(K_TIMER);
      if (s) {
        const d = JSON.parse(s);
        if (d.form) setTform((f) => ({ ...f, ...d.form }));
        if (d.running) { startRef.current = d.startTime; setElapsed(Date.now() - d.startTime); setRunning(true); setMode("timer"); }
        else if (d.elapsed) setElapsed(d.elapsed);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (running) { intervalRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 1000); return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }
  }, [running]);
  useEffect(() => {
    localStorage.setItem(K_TIMER, JSON.stringify({ running, elapsed, startTime: startRef.current, form: tform }));
  }, [running, elapsed, tform]);

  function startTimer() { startRef.current = Date.now() - elapsed; setRunning(true); }
  function stopTimer() { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); }
  function resetTimer() { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); setElapsed(0); }

  /* add entries */
  function saveTimerEntry() {
    if (!tform.matter) { alert("Please fill in Matter/Client field"); return; }
    const rate = parseFloat(tform.rate) || getRate(tform.user);
    const input: TimeEntryInput = {
      matter: tform.matter, entryDate: todayISO(), activityDescription: "",
      note: tform.notes ? createActivityDescription(tform.category, tform.notes, tform.user) : "",
      price: fix(rate, 2), quantity: roundUpTo6(elapsed), activityUserName: tform.user, nonBillable: tform.nonBillable,
    };
    run(() => addTimeEntry(input));
    setTform((f) => ({ ...f, notes: "", nonBillable: false }));
    resetTimer();
  }
  function addManualEntry() {
    const hours = parseFloat(manual.hours);
    if (!manual.matter || !hours) { alert("Please fill in Matter/Client and Hours fields"); return; }
    if (!manual.date) { alert("Please select a date"); return; }
    const rate = parseFloat(manual.rate) || getRate(manual.user);
    const desc = manual.notes ? createActivityDescription(manual.category, manual.notes, manual.user) : `${manual.category} - ${manual.user.split(" (")[0]} (${getUserRole(manual.user)})`;
    const input: TimeEntryInput = {
      matter: manual.matter, entryDate: manual.date, activityDescription: "", note: desc,
      price: fix(rate, 2), quantity: fix(Math.ceil(hours * 10) / 10, 1), activityUserName: manual.user, nonBillable: manual.nonBillable,
    };
    run(() => addTimeEntry(input));
    setManual((f) => ({ ...f, notes: "", nonBillable: false, hours: "", date: todayISO() }));
  }

  const edit = (id: number, patch: Partial<TimeEntryInput>) => run(() => updateTimeEntry(id, patch));
  const del = (id: number) => { if (confirm("Delete this entry?")) run(() => deleteTimeEntry(id)); };

  /* derived sets */
  const activeShown = entries.filter((e) => e.status === "active" && (!me.admin || ownerFilter === "all" || e.ownerId === ownerFilter));
  const archiveShown = entries.filter((e) => e.status === "archived"
    && (!me.admin || archiveOwner === "all" || e.ownerId === archiveOwner)
    && (!search || e.matter.toLowerCase().includes(search.toLowerCase()))
    && (!from || e.entryDate >= from) && (!to || e.entryDate <= to));

  const isNB = (e: EntryView) => e.nonBillable;
  const billable = activeShown.reduce((s, e) => s + (isNB(e) ? 0 : e.quantity), 0);
  const totalHours = activeShown.reduce((s, e) => s + e.quantity, 0);

  /* CSV */
  function buildCsv(list: EntryView[]) {
    return [CSV_HEADERS.join(","), ...list.map((e) => [
      csvCell(e.matter), csvDate(e.entryDate), csvCell(e.activityDescription), csvCell(e.note || ""),
      e.price, e.quantity || 0, "TimeEntry", csvCell(getUserRole(e.activityUserName)), e.nonBillable ? 1 : "", "", "", "",
    ].join(","))].join("\n");
  }
  function download(list: EntryView[], name: string) {
    const blob = new Blob([buildCsv(list)], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  function exportActive() {
    if (!activeShown.length) { alert("No entries to export"); return; }
    download(activeShown, `time_entries_${todayISO()}.csv`);
    setExportPrompt(activeShown.map((e) => e.id));
  }
  function exportArchive() {
    if (!archiveShown.length) { alert("No archived entries to export"); return; }
    download(archiveShown, `archived_time_${todayISO()}.csv`);
  }
  function copyActive() {
    if (!activeShown.length) { alert("No entries to copy"); return; }
    const tsv = activeShown.map((e) => [e.matter, csvDate(e.entryDate), e.activityDescription || "", e.note || "", e.price, e.quantity || 0, "TimeEntry", getUserRole(e.activityUserName), e.nonBillable ? 1 : "", "", "", ""].join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(() => note("Copied to clipboard")).catch(() => alert("Copy failed"));
  }

  /* matters upload (admin) */
  async function handleMatterFile(file?: File) {
    if (!file) return;
    setUploadStatus("Processing file…");
    try {
      if (!file.name.endsWith(".csv")) throw new Error("Please save as CSV.");
      const lines = (await file.text()).split("\n").map((l) => l.trim()).filter(Boolean);
      const headers = parseCSVLine(lines[0]);
      const dn = headers.indexOf("Display Number"); const di = headers.indexOf("Description");
      if (dn === -1) throw new Error("Display Number column not found.");
      const list: { displayNumber: string; description: string }[] = [];
      lines.slice(1).forEach((line) => { const c = parseCSVLine(line); const num = c[dn]?.trim() || ""; if (num) list.push({ displayNumber: num, description: di !== -1 ? c[di]?.trim() || "" : "" }); });
      run(() => replaceMatters(list));
      setUploadStatus(`Loaded ${list.length} matters`);
      setTimeout(() => setUploadStatus(""), 4000);
    } catch (err) { setUploadStatus(`Error: ${(err as Error).message}`); setTimeout(() => setUploadStatus(""), 5000); }
  }

  const input = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]";
  const cell = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-xs rounded outline-none focus:border-[var(--c-accent)]";
  const setUserRate = (which: "m" | "t", name: string) => which === "m"
    ? setManual((f) => ({ ...f, user: name, rate: f.rate || String(getRate(name)) }))
    : setTform((f) => ({ ...f, user: name, rate: f.rate || String(getRate(name)) }));

  return (
    <div className="max-w-6xl">
      {toast && <div className="fixed top-5 right-5 z-[9999] text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg" style={{ background: "var(--c-success)" }}>✓ {toast}</div>}

      {/* top bar */}
      <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {me.admin && (
              <label className="btn btn-outline text-sm py-2 px-3 cursor-pointer">
                <Upload size={15} /> Upload Clio Matters CSV
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleMatterFile(e.target.files?.[0])} />
              </label>
            )}
            <span className="text-xs text-[var(--c-ink-muted)]">{matterList.length} matters loaded{uploadStatus ? ` · ${uploadStatus}` : ""}</span>
          </div>
          {me.admin && <button onClick={() => setSettingsOpen(true)} className="btn btn-outline text-sm py-2 px-3"><Settings size={15} /> Settings</button>}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[{ v: fix(totalHours, 1), l: "Hours on Board" }, { v: activeShown.length, l: "Active Entries" }, { v: fix(billable, 1), l: "Billable Hours" }].map((s) => (
            <div key={s.l} className="rounded-lg bg-[var(--c-surface2)] p-4 text-center">
              <div className="font-[family-name:var(--font-display)] text-3xl text-[var(--c-accent)] leading-none">{s.v}</div>
              <div className="text-xs text-[var(--c-ink-muted)] mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* view + owner filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--c-surface2)]">
          <button onClick={() => setView("active")} className={`px-4 py-2 text-sm font-medium rounded-md ${view === "active" ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "text-[var(--c-ink-muted)]"}`}>Active Board</button>
          <button onClick={() => setView("archive")} className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-1.5 ${view === "archive" ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "text-[var(--c-ink-muted)]"}`}><Archive size={14} /> Archive</button>
        </div>
        {me.admin && view === "active" && (
          <label className="flex items-center gap-2 text-sm text-[var(--c-ink-muted)]">Viewing
            <select value={String(ownerFilter)} onChange={(e) => setOwnerFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-sm">
              <option value={me.id}>My board</option>
              <option value="all">All users</option>
              {owners.filter((o) => o.id !== me.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {view === "active" && (
        <>
          {/* mode toggle */}
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--c-surface2)] max-w-sm mx-auto mb-6">
            {(["manual", "timer"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2.5 text-sm font-medium rounded-md ${mode === m ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "text-[var(--c-ink-muted)]"}`}>{m === "manual" ? "Manual Entry" : "Timer Mode"}</button>
            ))}
          </div>

          {mode === "manual" ? (
            <section className="rounded-lg border border-[var(--c-border)] border-l-4 border-l-[var(--c-accent)] bg-[var(--c-surface)] p-6 mb-6 space-y-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl">Manual Entry</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Matter/Client">
                  <Combobox value={manual.matter} onChange={(v) => setManual((f) => ({ ...f, matter: v }))} options={matterList} placeholder="Start typing to search matters…" />
                  {matterDesc[manual.matter] && <Desc text={matterDesc[manual.matter]} />}
                </Field>
                <Field label="Category"><Combobox value={manual.category} onChange={(v) => setManual((f) => ({ ...f, category: v }))} options={categoryNames} placeholder="Start typing category…" /></Field>
              </div>
              <div className="grid sm:grid-cols-4 gap-4">
                <Field label="Date"><input type="date" className={input} value={manual.date} onChange={(e) => setManual((f) => ({ ...f, date: e.target.value }))} /></Field>
                <Field label="Activity User"><select className={input} value={manual.user} onChange={(e) => setUserRate("m", e.target.value)}>{activityUsers.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>
                <Field label="Hours"><input type="number" step="0.1" min="0.1" placeholder="0.5" className={input} value={manual.hours} onChange={(e) => setManual((f) => ({ ...f, hours: e.target.value }))} /></Field>
                <Field label="Hourly Rate ($)"><input type="number" step="0.01" placeholder="150" className={input} value={manual.rate} onChange={(e) => setManual((f) => ({ ...f, rate: e.target.value }))} /></Field>
              </div>
              <div className="grid sm:grid-cols-[3fr_1fr] gap-4 items-end">
                <Field label="Notes"><textarea rows={3} placeholder="Additional notes…" className={input} value={manual.notes} onChange={(e) => setManual((f) => ({ ...f, notes: e.target.value }))} /></Field>
                <label className="flex items-center gap-2 text-sm p-2.5 cursor-pointer"><input type="checkbox" className="accent-[var(--c-accent)]" checked={manual.nonBillable} onChange={(e) => setManual((f) => ({ ...f, nonBillable: e.target.checked }))} /> Non-Billable</label>
              </div>
              <button onClick={addManualEntry} disabled={pending} className="btn btn-accent text-sm disabled:opacity-50">Add Manual Entry</button>
            </section>
          ) : (
            <section className="rounded-lg border border-[var(--c-border)] border-l-4 border-l-[var(--c-accent)] bg-[var(--c-surface)] p-6 mb-6 space-y-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl">Timer Mode</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Matter/Client">
                  <Combobox value={tform.matter} onChange={(v) => setTform((f) => ({ ...f, matter: v }))} options={matterList} placeholder="Start typing to search matters…" />
                  {matterDesc[tform.matter] && <Desc text={matterDesc[tform.matter]} />}
                </Field>
                <Field label="Category"><Combobox value={tform.category} onChange={(v) => setTform((f) => ({ ...f, category: v }))} options={categoryNames} placeholder="Start typing category…" /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Activity User"><select className={input} value={tform.user} onChange={(e) => setUserRate("t", e.target.value)}>{activityUsers.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>
                <Field label="Hourly Rate ($)"><input type="number" step="0.01" placeholder="150" className={input} value={tform.rate} onChange={(e) => setTform((f) => ({ ...f, rate: e.target.value }))} /></Field>
              </div>
              <div className="grid sm:grid-cols-[3fr_1fr] gap-4 items-end">
                <Field label="Notes"><textarea rows={3} placeholder="Additional notes…" className={input} value={tform.notes} onChange={(e) => setTform((f) => ({ ...f, notes: e.target.value }))} /></Field>
                <label className="flex items-center gap-2 text-sm p-2.5 cursor-pointer"><input type="checkbox" className="accent-[var(--c-accent)]" checked={tform.nonBillable} onChange={(e) => setTform((f) => ({ ...f, nonBillable: e.target.checked }))} /> Non-Billable</label>
              </div>
              <div className={`text-center font-mono text-5xl my-4 ${running ? "text-[var(--c-error)] animate-pulse" : "text-[var(--c-ink)]"}`}>{formatTime(elapsed)}</div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={startTimer} disabled={running} className="btn text-sm text-white disabled:opacity-50" style={{ background: "var(--c-success)" }}><Play size={15} /> Start</button>
                <button onClick={stopTimer} disabled={!running} className="btn text-sm text-white disabled:opacity-50" style={{ background: "var(--c-error)" }}><Square size={15} /> Stop</button>
                <button onClick={resetTimer} className="btn btn-outline text-sm"><RotateCcw size={15} /> Reset</button>
                <button onClick={saveTimerEntry} disabled={running || elapsed === 0 || pending} className="btn btn-accent text-sm disabled:opacity-50"><Save size={15} /> Save Entry</button>
              </div>
            </section>
          )}

          {/* active table */}
          <EntriesTable list={activeShown} cell={cell} showOwner={me.admin && ownerFilter === "all"} onEdit={edit} onDelete={del} />

          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <button onClick={exportActive} disabled={pending} className="btn text-sm text-white disabled:opacity-50" style={{ background: "var(--c-success)" }}><Download size={15} /> Export to CSV</button>
            <button onClick={copyActive} className="btn btn-accent text-sm"><Copy size={15} /> Copy for Pasting</button>
          </div>
        </>
      )}

      {view === "archive" && (
        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl mr-auto flex items-center gap-2"><Archive size={18} /> Archived Entries</h2>
            <button onClick={() => setView("active")} className="btn btn-outline text-sm py-2 px-3"><ArrowLeft size={14} /> Active Board</button>
            <button onClick={exportArchive} className="btn btn-outline text-sm py-2 px-3"><Download size={14} /> Export shown</button>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            <input placeholder="Search matter…" value={search} onChange={(e) => setSearch(e.target.value)} className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-3 py-1.5 text-sm" />
            {me.admin && (
              <select value={String(archiveOwner)} onChange={(e) => setArchiveOwner(e.target.value === "all" ? "all" : Number(e.target.value))} className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-sm">
                <option value="all">All users</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)]">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-sm" /></label>
            <label className="flex items-center gap-1.5 text-sm text-[var(--c-ink-muted)]">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[var(--c-border)] bg-[var(--c-bg)] rounded px-2 py-1.5 text-sm" /></label>
            <span className="text-sm text-[var(--c-ink-muted)] self-center">{archiveShown.length} shown</span>
          </div>
          <EntriesTable list={archiveShown} cell={cell} showOwner={me.admin} readOnly onRestore={(id) => run(() => setTimeEntriesArchived([id], false))} onDelete={del} />
        </section>
      )}

      {/* export → archive prompt */}
      {exportPrompt && (
        <Modal onClose={() => setExportPrompt(null)}>
          <h3 className="font-[family-name:var(--font-display)] text-lg mb-2">Export complete</h3>
          <p className="text-sm text-[var(--c-ink-muted)] mb-5">Archive these {exportPrompt.length} entries now? Archiving clears them from your active board so they can&apos;t be billed twice. They stay searchable in the Archive.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setExportPrompt(null)} className="btn btn-outline text-sm py-2 px-4">Keep active</button>
            <button onClick={() => { const ids = exportPrompt; setExportPrompt(null); run(() => setTimeEntriesArchived(ids, true)); }} className="btn btn-accent text-sm py-2 px-4"><Archive size={15} /> Archive now</button>
          </div>
        </Modal>
      )}

      {/* settings (admin) */}
      {settingsOpen && me.admin && (
        <Modal onClose={() => setSettingsOpen(false)} wide>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-[family-name:var(--font-display)] text-xl">Settings</h3>
            <button onClick={() => setSettingsOpen(false)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={20} /></button>
          </div>
          <div className="space-y-8">
            <div>
              <h4 className="font-medium text-[var(--c-accent)] mb-1">Activity Users</h4>
              <p className="text-xs text-[var(--c-ink-muted)] mb-3">Shared list with default rates. Users without a login can still be listed here.</p>
              <ul className="space-y-2">
                {activityUsers.map((u) => <ActivityUserRow key={u.id} user={u} input={input} onSave={(name, rate) => run(() => updateActivityUser(u.id, name, rate))} onRemove={() => run(() => deleteActivityUser(u.id))} />)}
              </ul>
              <AddRow placeholder="User name (e.g., John Smith (Attorney))" withRate input={input} onAdd={(name, rate) => run(() => addActivityUser(name, rate ?? 145))} />
            </div>
            <div>
              <h4 className="font-medium text-[var(--c-accent)] mb-1">Categories</h4>
              <ul className="space-y-2">
                {categories.map((c) => <CategoryRow key={c.id} name={c.name} input={input} onSave={(v) => run(() => updateCategory(c.id, v))} onRemove={() => run(() => deleteCategory(c.id))} />)}
              </ul>
              <AddRow placeholder="Category (e.g., COURT APPEARANCE)" input={input} onAdd={(name) => run(() => addCategory(name))} />
            </div>
            <p className="text-xs text-[var(--c-ink-muted)]">Changes save immediately.</p>
          </div>
        </Modal>
      )}

      <VoiceTimeEntry
        matters={matters}
        categories={categoryNames}
        activityUsers={activityUsers}
        defaultUser={defaultUser}
        onAdd={(input) => run(() => addTimeEntry(input))}
      />
    </div>
  );
}

/* ---------- subcomponents ---------- */
function EntriesTable({ list, cell, showOwner, readOnly, onEdit, onDelete, onRestore }: {
  list: EntryView[]; cell: string; showOwner?: boolean; readOnly?: boolean;
  onEdit?: (id: number, patch: Partial<TimeEntryInput>) => void; onDelete?: (id: number) => void; onRestore?: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--c-border)]">
      <table className="w-full text-xs" style={{ minWidth: 1000 }}>
        <thead>
          <tr className="text-left text-[var(--c-ink-muted)] border-b border-[var(--c-border)] bg-[var(--c-surface2)]">
            {showOwner && <th className="px-2 py-2 font-medium">User</th>}
            {["Matter", "Date", "Note", "Price", "Qty", "Activity User", "Non Bill.", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={9} className="px-2 py-8 text-center text-[var(--c-ink-muted)]">No entries.</td></tr>}
          {list.map((e) => (
            <tr key={e.id} className="border-b border-[var(--c-border)] last:border-0 align-top">
              {showOwner && <td className="px-2 py-2 whitespace-nowrap text-[var(--c-ink-muted)]">{e.ownerName}</td>}
              <td className="px-2 py-2 w-48">{readOnly ? e.matter : <input key={e.matter} className={cell} defaultValue={e.matter} onBlur={(ev) => ev.target.value !== e.matter && onEdit?.(e.id, { matter: ev.target.value })} />}</td>
              <td className="px-2 py-2 w-32">{readOnly ? csvDateDisplay(e.entryDate) : <input type="date" className={cell} defaultValue={e.entryDate} onChange={(ev) => onEdit?.(e.id, { entryDate: ev.target.value })} />}</td>
              <td className="px-2 py-2 w-72">{readOnly ? e.note : <input key={e.note} className={cell} defaultValue={e.note} onBlur={(ev) => ev.target.value !== e.note && onEdit?.(e.id, { note: ev.target.value })} />}</td>
              <td className="px-2 py-2 w-20">{readOnly ? e.price : <input type="number" step="0.01" className={cell} defaultValue={e.price} onBlur={(ev) => onEdit?.(e.id, { price: Math.round((parseFloat(ev.target.value) || 0) * 100) / 100 })} />}</td>
              <td className="px-2 py-2 w-16">{readOnly ? e.quantity : <input type="number" step="0.1" className={cell} defaultValue={e.quantity} onBlur={(ev) => onEdit?.(e.id, { quantity: Math.round((parseFloat(ev.target.value) || 0) * 10) / 10 })} />}</td>
              <td className="px-2 py-2 w-40">{readOnly ? e.activityUserName : <input key={e.activityUserName} className={cell} defaultValue={e.activityUserName} onBlur={(ev) => ev.target.value !== e.activityUserName && onEdit?.(e.id, { activityUserName: ev.target.value })} />}</td>
              <td className="px-2 py-2 text-center">{readOnly ? (e.nonBillable ? "Yes" : "") : <input type="checkbox" className="accent-[var(--c-accent)]" checked={e.nonBillable} onChange={(ev) => onEdit?.(e.id, { nonBillable: ev.target.checked })} />}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                {onRestore && <button onClick={() => onRestore(e.id)} title="Restore to active" className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] mr-2"><ArchiveRestore size={15} /></button>}
                {onDelete && <button onClick={() => onDelete(e.id)} title="Delete" className="h-6 w-6 rounded-full text-white inline-flex items-center justify-center" style={{ background: "var(--c-error)" }}>×</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const csvDateDisplay = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}.${d}.${y}`; };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium mb-1.5">{label}</label>{children}</div>;
}
function Desc({ text }: { text: string }) {
  return <div className="mt-2 p-3 rounded bg-[var(--c-surface2)] border border-[var(--c-accent)] text-xs leading-relaxed"><div className="font-semibold mb-1">Case Description:</div>{text}</div>;
}
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-[var(--c-surface)] rounded-lg w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto shadow-2xl p-6`}>{children}</div>
    </div>
  );
}
function Combobox({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  const [open, setOpen] = useState(false); const [hi, setHi] = useState(-1); const ref = useRef<HTMLDivElement>(null);
  const q = value.toLowerCase(); const matches = open ? (q ? options.filter((o) => o.toLowerCase().includes(q)) : options) : [];
  useEffect(() => { function d(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d); }, []);
  const select = (v: string) => { onChange(v); setOpen(false); setHi(-1); };
  return (
    <div ref={ref} className="relative">
      <input className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 pr-9 text-sm rounded outline-none focus:border-[var(--c-accent)] cursor-pointer" value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (!open && e.key === "ArrowDown") { setOpen(true); return; } if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); } else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && hi < matches.length) select(matches[hi]); } else if (e.key === "Escape" || e.key === "Tab") setOpen(false); }} />
      <ChevronDown size={15} className={`absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)] pointer-events-none transition-transform ${open ? "rotate-180" : ""}`} />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 max-h-52 overflow-y-auto rounded-b-md border border-t-0 border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
          {matches.map((o, i) => <div key={o} onClick={() => select(o)} onMouseEnter={() => setHi(i)} className={`px-3 py-2 text-sm cursor-pointer border-b border-[var(--c-border)] last:border-0 ${i === hi ? "bg-[var(--c-surface2)]" : ""}`}>{o}</div>)}
        </div>
      )}
    </div>
  );
}
function ActivityUserRow({ user, input, onSave, onRemove }: { user: AUser; input: string; onSave: (n: string, r: number) => void; onRemove: () => void }) {
  const [name, setName] = useState(user.name); const [rate, setRate] = useState(String(user.rate));
  const dirty = name !== user.name || rate !== String(user.rate);
  return (
    <li className="flex items-center gap-2 bg-[var(--c-surface2)] rounded p-2">
      <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" step="0.01" className={`${input} w-28`} value={rate} onChange={(e) => setRate(e.target.value)} />
      {dirty && <button onClick={() => onSave(name.trim(), parseFloat(rate) || 0)} className="text-xs px-2 py-1 rounded text-white shrink-0" style={{ background: "var(--c-success)" }}>Save</button>}
      <button onClick={() => { if (confirm("Remove this user?")) onRemove(); }} className="text-xs px-2 py-1 rounded text-white shrink-0" style={{ background: "var(--c-error)" }}>Remove</button>
    </li>
  );
}
function CategoryRow({ name, input, onSave, onRemove }: { name: string; input: string; onSave: (v: string) => void; onRemove: () => void }) {
  const [val, setVal] = useState(name);
  return (
    <li className="flex items-center gap-2 bg-[var(--c-surface2)] rounded p-2">
      <input className={input} value={val} onChange={(e) => setVal(e.target.value.toUpperCase())} />
      {val !== name && <button onClick={() => onSave(val.trim())} className="text-xs px-2 py-1 rounded text-white shrink-0" style={{ background: "var(--c-success)" }}>Save</button>}
      <button onClick={() => { if (confirm("Remove this category?")) onRemove(); }} className="text-xs px-2 py-1 rounded text-white shrink-0" style={{ background: "var(--c-error)" }}>Remove</button>
    </li>
  );
}
function AddRow({ placeholder, withRate, input, onAdd }: { placeholder: string; withRate?: boolean; input: string; onAdd: (name: string, rate?: number) => void }) {
  const [name, setName] = useState(""); const [rate, setRate] = useState("");
  return (
    <div className="flex gap-2 mt-3">
      <input className={input} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      {withRate && <input type="number" step="0.01" className={`${input} w-28`} placeholder="Rate ($)" value={rate} onChange={(e) => setRate(e.target.value)} />}
      <button onClick={() => { if (!name.trim()) { alert("Enter a value"); return; } onAdd(name.trim(), withRate ? parseFloat(rate) || 145 : undefined); setName(""); setRate(""); }} className="btn btn-accent text-sm shrink-0">Add</button>
    </div>
  );
}
