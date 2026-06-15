"use client";

/**
 * Legal Time Tracker — ported from the firm's standalone HTML tool. All logic,
 * the CSV/clipboard formats, the rounding rules, and the localStorage keys are
 * preserved exactly so existing data and downstream Clio imports keep working.
 * Only the interface is restyled to match the site. Data stays in this browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, X, Upload, Play, Square, RotateCcw, Save, Trash2, Download, Copy, ChevronDown } from "lucide-react";

type Entry = {
  id: number;
  matter: string;
  date: string; // MM.DD.YYYY
  activity_description: string;
  note: string;
  price: number;
  quantity: number;
  type: string;
  activity_user: string;
  non_billable: number | "";
  ultims_activity_code: string;
  ultims_task_code: string;
  ultims_expense_code: string;
};
type ActivityUser = { name: string; rate: number };

const K = {
  entries: "sentinalTimeTracker_entries",
  session: "sentinalTimeTracker_currentSession",
  matters: "sentinalTimeTracker_matters",
  matterDescriptions: "sentinalTimeTracker_matterDescriptions",
  activityUsers: "sentinalTimeTracker_activityUsers",
  categories: "sentinalTimeTracker_categories",
  mode: "sentinalTimeTracker_mode",
  autoBackup: "sentinalTimeTracker_autoBackup",
};

const DEFAULT_USERS: ActivityUser[] = [
  { name: "Max Smith (Attorney)", rate: 395 },
  { name: "Andrew Bergeron (Legal Assistant)", rate: 145 },
  { name: "Micah Walters (Legal Assistant)", rate: 145 },
  { name: "Austin Choate (Legal Assistant)", rate: 145 },
  { name: "Jessica Smith (Legal Assistant)", rate: 145 },
];
const DEFAULT_CATEGORIES = [
  "APPELLATE", "CLIENT RELATIONS", "CONSULTATION (EVIDENCE)", "CONSULTATION (EXPERT)",
  "CONSULTATION (MISC)", "CONSULTATION (INTAKE)", "CORRESPONDENCE", "DEPOSITION",
  "DISCOVERY", "DOCUMENT PREPARATION", "DOCUMENT REVIEW", "DRAFT REVIEW",
  "E-FILING", "EMAIL", "IN COURT", "INVESTIGATION", "JAIL VISIT", "MEDIATION",
  "MISCELLANEOUS", "PLEADING", "RESEARCH", "SERVICE", "SETTLEMENT",
  "TELEPHONE CALL", "TRAVEL TIME", "TRIAL PREPARATION", "ZOOM CONFERENCE",
];
const DEFAULT_USER = "Andrew Bergeron (Legal Assistant)";
const CSV_HEADERS = ["matter", "date", "activity_description", "note", "price", "quantity", "type", "activity_user", "non_billable", "ultims_activity_code", "ultims_task_code", "ultims_expense_code"];

/* ---------- pure helpers (identical behavior to the original) ---------- */
const fix = (num: number, decimals = 1) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
const formatDateForDisplay = (date: string) => { const [y, m, d] = date.split("-"); return `${m}.${d}.${y}`; };
const formatDateForInput = (s: string) => { if (s.includes(".")) { const [m, d, y] = s.split("."); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; } return s; };
const formatDateForClipboard = (s: string) => s.replace(/\./g, "/");
const getCurrentDate = () => { const n = new Date(); return `${(n.getMonth() + 1).toString().padStart(2, "0")}.${n.getDate().toString().padStart(2, "0")}.${n.getFullYear()}`; };
const getUserRole = (u: string) => (u.includes("Attorney") ? "Attorney" : "Legal Assistant");
const roundUpTo6 = (ms: number) => { const blocks = Math.ceil(ms / (1000 * 60) / 6); return fix(blocks * 0.1, 1); };
const createActivityDescription = (category: string, notes: string, activityUser: string) => `${category} - ${activityUser.split(" (")[0]} (${getUserRole(activityUser)}) - ${notes}`;
const formatTime = (ms: number) => { const t = Math.floor(ms / 1000); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60; return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`; };
function parseCSVLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') inQ = !inQ; else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out;
}
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function TimeTracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [matters, setMatters] = useState<string[]>([]);
  const [matterDescriptions, setMatterDescriptions] = useState<Record<string, string>>({});
  const [activityUsers, setActivityUsers] = useState<ActivityUser[]>(DEFAULT_USERS);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [mode, setMode] = useState<"manual" | "timer">("manual");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [backupStatus, setBackupStatus] = useState("Auto-backup: Never");
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forms
  const [manual, setManual] = useState({ matter: "", category: "", date: "", user: DEFAULT_USER, hours: "", rate: "", notes: "", nonBillable: false });
  const [timerForm, setTimerForm] = useState({ matter: "", category: "", user: DEFAULT_USER, rate: "", notes: "", nonBillable: false });

  const getDefaultRate = useCallback((name: string) => activityUsers.find((u) => u.name === name)?.rate ?? 145, [activityUsers]);

  const showNotification = useCallback((text: string, color = "var(--c-success)") => {
    setToast({ text, color });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshBackupStatus = useCallback(() => {
    const b = localStorage.getItem(K.autoBackup);
    if (b) { try { const d = JSON.parse(b); setBackupStatus(`Auto-backup: ${new Date(d.timestamp).toLocaleString()}`); } catch { /* ignore */ } }
    else setBackupStatus("Auto-backup: Never");
  }, []);

  /* ---------- load once ---------- */
  useEffect(() => {
    try {
      const e = localStorage.getItem(K.entries); if (e) setEntries(JSON.parse(e));
      const m = localStorage.getItem(K.matters); if (m) setMatters(JSON.parse(m));
      const md = localStorage.getItem(K.matterDescriptions); if (md) setMatterDescriptions(JSON.parse(md));
      const au = localStorage.getItem(K.activityUsers); if (au) setActivityUsers(JSON.parse(au));
      const c = localStorage.getItem(K.categories); if (c) setCategories(JSON.parse(c));
      const sm = localStorage.getItem(K.mode); if (sm === "timer" || sm === "manual") setMode(sm);
      const s = localStorage.getItem(K.session);
      if (s) {
        const sess = JSON.parse(s);
        if (sess.formData) {
          setTimerForm((f) => ({
            ...f,
            matter: sess.formData.matter || "",
            notes: sess.formData.notes || "",
            rate: sess.formData.rate || "",
            category: sess.formData.category || "APPELLATE",
            user: sess.formData.activityUser || DEFAULT_USER,
            nonBillable: sess.formData.nonBillable || false,
          }));
        }
        if (sess.isRunning) {
          setElapsed(sess.elapsedTime);
          startRef.current = Date.now() - sess.elapsedTime;
          setRunning(true);
          setMode("timer");
        }
      }
    } catch { /* ignore */ }
    refreshBackupStatus();
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- persist ---------- */
  useEffect(() => { if (loaded) localStorage.setItem(K.entries, JSON.stringify(entries)); }, [entries, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem(K.mode, mode); }, [mode, loaded]);
  useEffect(() => {
    if (!loaded) return;
    const session = {
      isRunning: running,
      elapsedTime: elapsed,
      formData: { matter: timerForm.matter, notes: timerForm.notes, rate: timerForm.rate, category: timerForm.category, activityUser: timerForm.user, nonBillable: timerForm.nonBillable },
    };
    localStorage.setItem(K.session, JSON.stringify(session));
  }, [running, elapsed, timerForm, loaded]);

  /* ---------- timer ticking ---------- */
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [running]);

  /* ---------- auto-backup every 5 min ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      if (!entries.length) return;
      localStorage.setItem(K.autoBackup, JSON.stringify({ entries, timestamp: new Date().toISOString(), matters }));
      refreshBackupStatus();
      showNotification("Auto-backup created");
    }, 300000);
    return () => clearInterval(id);
  }, [entries, matters, refreshBackupStatus, showNotification]);

  // default manual date
  useEffect(() => { if (loaded && !manual.date) setManual((f) => ({ ...f, date: new Date().toISOString().split("T")[0] })); }, [loaded, manual.date]);

  /* ---------- timer controls ---------- */
  function startTimer() { startRef.current = Date.now() - elapsed; setRunning(true); }
  function stopTimer() { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); }
  function resetTimer() { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); setElapsed(0); }

  /* ---------- add entries ---------- */
  function saveCurrentEntry() {
    if (!timerForm.matter) { alert("Please fill in Matter/Client field"); return; }
    const rate = parseFloat(timerForm.rate) || getDefaultRate(timerForm.user);
    const hours = roundUpTo6(elapsed);
    const desc = timerForm.notes ? createActivityDescription(timerForm.category, timerForm.notes, timerForm.user) : "";
    const entry: Entry = {
      id: Date.now(), matter: timerForm.matter, date: getCurrentDate(), activity_description: "", note: desc,
      price: fix(rate, 2), quantity: hours, type: "TimeEntry", activity_user: getUserRole(timerForm.user),
      non_billable: timerForm.nonBillable ? 1 : "", ultims_activity_code: "", ultims_task_code: "", ultims_expense_code: "",
    };
    setEntries((arr) => [...arr, entry]);
    setTimerForm((f) => ({ ...f, notes: "", nonBillable: false }));
    setElapsed(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
  }

  function addManualEntry() {
    const hours = parseFloat(manual.hours);
    if (!manual.matter || !hours) { alert("Please fill in Matter/Client and Hours fields"); return; }
    if (!manual.date) { alert("Please select a date"); return; }
    const rate = parseFloat(manual.rate) || getDefaultRate(manual.user);
    const roundedHours = fix(Math.ceil(hours * 10) / 10, 1);
    const desc = manual.notes
      ? createActivityDescription(manual.category, manual.notes, manual.user)
      : `${manual.category} - ${manual.user.split(" (")[0]} (${getUserRole(manual.user)})`;
    const entry: Entry = {
      id: Date.now(), matter: manual.matter, date: formatDateForDisplay(manual.date), activity_description: "", note: desc,
      price: fix(rate, 2), quantity: roundedHours, type: "TimeEntry", activity_user: getUserRole(manual.user),
      non_billable: manual.nonBillable ? 1 : "", ultims_activity_code: "", ultims_task_code: "", ultims_expense_code: "",
    };
    setEntries((arr) => [...arr, entry]);
    setManual((f) => ({ ...f, notes: "", nonBillable: false, hours: "", date: new Date().toISOString().split("T")[0] }));
  }

  function updateEntry(id: number, field: keyof Entry, value: string) {
    setEntries((arr) => arr.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e };
      if (field === "non_billable") next.non_billable = value === "1" ? 1 : "";
      else if (field === "price") next.price = fix(parseFloat(value) || 0, 2);
      else if (field === "quantity") next.quantity = fix(parseFloat(value) || 0, 1);
      else if (field === "date") next.date = formatDateForDisplay(value);
      else (next as Record<string, unknown>)[field] = value;
      return next;
    }));
  }

  function deleteEntry(id: number) { if (confirm("Delete this entry?")) setEntries((arr) => arr.filter((e) => e.id !== id)); }
  function clearAllEntries() { if (confirm("Clear all entries? This cannot be undone.")) setEntries([]); }

  /* ---------- CSV / clipboard (exact format) ---------- */
  function buildCsv(): string {
    return [
      CSV_HEADERS.join(","),
      ...entries.map((e) => [
        csvCell(e.matter), formatDateForClipboard(e.date), csvCell(e.activity_description), csvCell(e.note || ""),
        e.price, e.quantity || 0, e.type, csvCell(e.activity_user || "Andrew Bergeron (Legal Assistant)"),
        e.non_billable || "", e.ultims_activity_code || "", e.ultims_task_code || "", e.ultims_expense_code || "",
      ].join(",")),
    ].join("\n");
  }
  function downloadCsv(filename: string) {
    const blob = new Blob([buildCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function exportToSpreadsheet() {
    if (!entries.length) { alert("No entries to export"); return; }
    downloadCsv(`time_entries_${new Date().toISOString().split("T")[0]}.csv`);
  }
  function createManualBackup() {
    if (!entries.length) { alert("No entries to backup"); return; }
    downloadCsv(`manual_backup_${new Date().toISOString().split("T")[0]}.csv`);
  }
  function copyForPasting() {
    if (!entries.length) { alert("No entries to copy"); return; }
    const tsv = entries.map((e) => [
      e.matter, formatDateForClipboard(e.date), e.activity_description || "", e.note || "", e.price, e.quantity || 0,
      e.type, e.activity_user || "Legal Assistant", e.non_billable || "", e.ultims_activity_code || "", e.ultims_task_code || "", e.ultims_expense_code || "",
    ].join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(() => alert("Data copied to clipboard! Paste into Excel/Google Sheets.")).catch(() => {
      const ta = document.createElement("textarea"); ta.value = tsv; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); alert("Data copied to clipboard! Paste into Excel/Google Sheets.");
    });
  }
  function resetAllData() {
    if (!confirm("Reset ALL data? This cannot be undone. Create backup first?")) return;
    if (entries.length > 0 && confirm("Create backup before resetting?")) downloadCsv(`final_backup_${new Date().toISOString().split("T")[0]}.csv`);
    [K.entries, K.session, K.autoBackup, K.mode].forEach((k) => localStorage.removeItem(k));
    setEntries([]); resetTimer(); setMode("manual");
    setManual({ matter: "", category: "", date: new Date().toISOString().split("T")[0], user: DEFAULT_USER, hours: "", rate: "", notes: "", nonBillable: false });
    setTimerForm({ matter: "", category: "", user: DEFAULT_USER, rate: "", notes: "", nonBillable: false });
    refreshBackupStatus();
  }

  /* ---------- matter upload ---------- */
  async function handleMatterFile(file?: File) {
    if (!file) return;
    setUploadStatus("Processing file…");
    try {
      if (!file.name.endsWith(".csv")) throw new Error("Excel files not supported. Please save as CSV.");
      const text = await file.text();
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
      const headers = parseCSVLine(lines[0]);
      const dn = headers.indexOf("Display Number");
      const di = headers.indexOf("Description");
      if (dn === -1) throw new Error("Display Number column not found in CSV");
      const newMatters: string[] = []; const desc: Record<string, string> = {};
      lines.slice(1).forEach((line) => {
        const cols = parseCSVLine(line);
        const num = cols[dn]?.trim() || "";
        const d = di !== -1 ? cols[di]?.trim() || "" : "";
        if (num) { newMatters.push(num); if (d) desc[num] = d; }
      });
      setMatters(newMatters); setMatterDescriptions(desc);
      localStorage.setItem(K.matters, JSON.stringify(newMatters));
      localStorage.setItem(K.matterDescriptions, JSON.stringify(desc));
      setUploadStatus(`Loaded ${newMatters.length} matters`);
      setTimeout(() => setUploadStatus(""), 5000);
    } catch (err) {
      setUploadStatus(`Error: ${(err as Error).message}`);
      setTimeout(() => setUploadStatus(""), 5000);
    }
  }

  /* ---------- settings save ---------- */
  function saveSettings() {
    localStorage.setItem(K.activityUsers, JSON.stringify(activityUsers));
    localStorage.setItem(K.categories, JSON.stringify(categories));
    setSettingsOpen(false);
    showNotification("Settings saved successfully!");
  }

  /* ---------- stats ---------- */
  const isNB = (e: Entry) => e.non_billable === 1 || (e.non_billable as unknown) === "1";
  const billable = entries.reduce((s, e) => s + (isNB(e) ? 0 : e.quantity || 0), 0);
  const nonBillable = entries.reduce((s, e) => s + (isNB(e) ? e.quantity || 0 : 0), 0);
  const totalHours = billable + nonBillable;

  const input = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm rounded outline-none focus:border-[var(--c-accent)]";
  const editInput = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-xs rounded outline-none focus:border-[var(--c-accent)]";

  function setUserAndRate(which: "manual" | "timer", name: string) {
    if (which === "manual") setManual((f) => ({ ...f, user: name, rate: f.rate || String(getDefaultRate(name)) }));
    else setTimerForm((f) => ({ ...f, user: name, rate: f.rate || String(getDefaultRate(name)) }));
  }

  return (
    <div className="max-w-6xl">
      {toast && (
        <div className="fixed top-5 right-5 z-[9999] text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg" style={{ background: toast.color }}>
          ✓ {toast.text}
        </div>
      )}

      {/* Header / upload / stats */}
      <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <label className="btn btn-outline text-sm py-2 px-3 cursor-pointer">
              <Upload size={15} /> Upload Clio Open Matters Spreadsheet
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleMatterFile(e.target.files?.[0])} />
            </label>
            {uploadStatus && <p className="text-xs text-[var(--c-ink-muted)] mt-2">{uploadStatus}</p>}
            <p className="text-xs text-[var(--c-ink-muted)] mt-2">{backupStatus}</p>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="btn btn-outline text-sm py-2 px-3">
            <Settings size={15} /> Settings
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[
            { v: fix(totalHours, 1), l: "Hours Today" },
            { v: entries.length, l: "Total Entries" },
            { v: fix(billable, 1), l: "Billable Hours" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg bg-[var(--c-surface2)] p-4 text-center">
              <div className="font-[family-name:var(--font-display)] text-3xl text-[var(--c-accent)] leading-none">{s.v}</div>
              <div className="text-xs text-[var(--c-ink-muted)] mt-1">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={resetAllData} className="text-xs px-3 py-1.5 rounded border border-[var(--c-error)] text-[var(--c-error)] hover:bg-[var(--c-error)] hover:text-white transition-colors">Reset All Data</button>
          <button onClick={createManualBackup} className="text-xs px-3 py-1.5 rounded border border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Create Backup</button>
        </div>
      </section>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--c-surface2)] max-w-sm mx-auto mb-6">
        {(["manual", "timer"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${mode === m ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"}`}>
            {m === "manual" ? "Manual Entry" : "Timer Mode"}
          </button>
        ))}
      </div>

      {/* Manual */}
      {mode === "manual" && (
        <section className="rounded-lg border border-[var(--c-border)] border-l-4 border-l-[var(--c-accent)] bg-[var(--c-surface)] p-6 mb-6 space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Manual Entry</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Matter/Client">
              <Combobox value={manual.matter} onChange={(v) => setManual((f) => ({ ...f, matter: v }))} options={matters} placeholder="Start typing to search matters…" />
              {matterDescriptions[manual.matter] && <Desc text={matterDescriptions[manual.matter]} />}
            </Field>
            <Field label="Category">
              <Combobox value={manual.category} onChange={(v) => setManual((f) => ({ ...f, category: v }))} options={categories} placeholder="Start typing category…" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-4 gap-4">
            <Field label="Date"><input type="date" className={input} value={manual.date} onChange={(e) => setManual((f) => ({ ...f, date: e.target.value }))} /></Field>
            <Field label="Activity User">
              <select className={input} value={manual.user} onChange={(e) => setUserAndRate("manual", e.target.value)}>
                {activityUsers.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Hours"><input type="number" step="0.1" min="0.1" placeholder="0.5" className={input} value={manual.hours} onChange={(e) => setManual((f) => ({ ...f, hours: e.target.value }))} /></Field>
            <Field label="Hourly Rate ($)"><input type="number" step="0.01" placeholder="150" className={input} value={manual.rate} onChange={(e) => setManual((f) => ({ ...f, rate: e.target.value }))} /></Field>
          </div>
          <div className="grid sm:grid-cols-[3fr_1fr] gap-4 items-end">
            <Field label="Notes"><textarea rows={3} placeholder="Additional notes…" className={input} value={manual.notes} onChange={(e) => setManual((f) => ({ ...f, notes: e.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm p-2.5 cursor-pointer">
              <input type="checkbox" className="accent-[var(--c-accent)]" checked={manual.nonBillable} onChange={(e) => setManual((f) => ({ ...f, nonBillable: e.target.checked }))} /> Non-Billable
            </label>
          </div>
          <button onClick={addManualEntry} className="btn btn-accent text-sm">Add Manual Entry</button>
        </section>
      )}

      {/* Timer */}
      {mode === "timer" && (
        <section className="rounded-lg border border-[var(--c-border)] border-l-4 border-l-[var(--c-accent)] bg-[var(--c-surface)] p-6 mb-6 space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Timer Mode</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Matter/Client">
              <Combobox value={timerForm.matter} onChange={(v) => setTimerForm((f) => ({ ...f, matter: v }))} options={matters} placeholder="Start typing to search matters…" />
              {matterDescriptions[timerForm.matter] && <Desc text={matterDescriptions[timerForm.matter]} />}
            </Field>
            <Field label="Category">
              <Combobox value={timerForm.category} onChange={(v) => setTimerForm((f) => ({ ...f, category: v }))} options={categories} placeholder="Start typing category…" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Activity User">
              <select className={input} value={timerForm.user} onChange={(e) => setUserAndRate("timer", e.target.value)}>
                {activityUsers.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Hourly Rate ($)"><input type="number" step="0.01" placeholder="150" className={input} value={timerForm.rate} onChange={(e) => setTimerForm((f) => ({ ...f, rate: e.target.value }))} /></Field>
          </div>
          <div className="grid sm:grid-cols-[3fr_1fr] gap-4 items-end">
            <Field label="Notes"><textarea rows={3} placeholder="Additional notes…" className={input} value={timerForm.notes} onChange={(e) => setTimerForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm p-2.5 cursor-pointer">
              <input type="checkbox" className="accent-[var(--c-accent)]" checked={timerForm.nonBillable} onChange={(e) => setTimerForm((f) => ({ ...f, nonBillable: e.target.checked }))} /> Non-Billable
            </label>
          </div>
          <div className={`text-center font-mono text-5xl my-4 ${running ? "text-[var(--c-error)] animate-pulse" : "text-[var(--c-ink)]"}`}>{formatTime(elapsed)}</div>
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={startTimer} disabled={running} className="btn text-sm text-white disabled:opacity-50" style={{ background: "var(--c-success)" }}><Play size={15} /> Start Timer</button>
            <button onClick={stopTimer} disabled={!running} className="btn text-sm text-white disabled:opacity-50" style={{ background: "var(--c-error)" }}><Square size={15} /> Stop Timer</button>
            <button onClick={resetTimer} className="btn btn-outline text-sm"><RotateCcw size={15} /> Reset Timer</button>
            <button onClick={saveCurrentEntry} disabled={running || elapsed === 0} className="btn btn-accent text-sm disabled:opacity-50"><Save size={15} /> Save Entry</button>
          </div>
        </section>
      )}

      {/* Entries */}
      <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl mb-4">Today&apos;s Entries</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 980 }}>
            <thead>
              <tr className="text-left text-[var(--c-ink-muted)] border-b border-[var(--c-border)]">
                {["Matter", "Date", "Activity Description", "Note", "Price", "Qty", "Type", "Activity User", "Non Billable", ""].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={10} className="px-2 py-8 text-center text-[var(--c-ink-muted)]">No entries yet.</td></tr>}
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--c-border)] align-top">
                  <td className="px-2 py-2 w-48"><input className={editInput} value={e.matter} onChange={(ev) => updateEntry(e.id, "matter", ev.target.value)} /></td>
                  <td className="px-2 py-2 w-32"><input type="date" className={editInput} value={formatDateForInput(e.date)} onChange={(ev) => updateEntry(e.id, "date", ev.target.value)} /></td>
                  <td className="px-2 py-2 w-56"><input className={editInput} value={e.activity_description} onChange={(ev) => updateEntry(e.id, "activity_description", ev.target.value)} /></td>
                  <td className="px-2 py-2 w-56"><input className={editInput} value={e.note || ""} onChange={(ev) => updateEntry(e.id, "note", ev.target.value)} /></td>
                  <td className="px-2 py-2 w-20"><input type="number" step="0.01" className={editInput} value={e.price} onChange={(ev) => updateEntry(e.id, "price", ev.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input type="number" step="0.1" className={editInput} value={e.quantity || 0} onChange={(ev) => updateEntry(e.id, "quantity", ev.target.value)} /></td>
                  <td className="px-2 py-2 text-[var(--c-ink-muted)]">TimeEntry</td>
                  <td className="px-2 py-2 w-32"><input className={editInput} value={e.activity_user || "Legal Assistant"} onChange={(ev) => updateEntry(e.id, "activity_user", ev.target.value)} /></td>
                  <td className="px-2 py-2 w-16"><input className={editInput} value={e.non_billable === 1 ? "1" : ""} onChange={(ev) => updateEntry(e.id, "non_billable", ev.target.value)} /></td>
                  <td className="px-2 py-2"><button onClick={() => deleteEntry(e.id)} title="Delete entry" className="h-6 w-6 rounded-full text-white flex items-center justify-center" style={{ background: "var(--c-error)" }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Export */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={exportToSpreadsheet} className="btn text-sm text-white" style={{ background: "var(--c-success)" }}><Download size={15} /> Export to Google Sheets (CSV)</button>
        <button onClick={copyForPasting} className="btn btn-accent text-sm"><Copy size={15} /> Copy for Pasting</button>
        <button onClick={clearAllEntries} className="btn btn-outline text-sm"><Trash2 size={15} /> Clear All Entries</button>
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <div className="bg-[var(--c-surface)] rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] sticky top-0 bg-[var(--c-surface)]">
              <h2 className="font-[family-name:var(--font-display)] text-xl">Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-8">
              <div>
                <h3 className="font-medium text-[var(--c-accent)] mb-1">Activity Users</h3>
                <p className="text-xs text-[var(--c-ink-muted)] mb-3">Manage users and their default hourly rates.</p>
                <ul className="space-y-2">
                  {activityUsers.map((u, i) => (
                    <li key={i} className="flex items-center gap-2 bg-[var(--c-surface2)] rounded p-2">
                      <input className={input} value={u.name} onChange={(e) => setActivityUsers((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <input type="number" step="0.01" min="0" className={`${input} w-28`} value={u.rate} onChange={(e) => setActivityUsers((a) => a.map((x, j) => (j === i ? { ...x, rate: parseFloat(e.target.value) || 0 } : x)))} />
                      <button onClick={() => { if (confirm("Remove this user?")) setActivityUsers((a) => a.filter((_, j) => j !== i)); }} className="text-xs px-2 py-1 rounded text-white shrink-0" style={{ background: "var(--c-error)" }}>Remove</button>
                    </li>
                  ))}
                </ul>
                <AddUser onAdd={(name, rate) => setActivityUsers((a) => [...a, { name, rate }])} inputCls={input} />
              </div>
              <div>
                <h3 className="font-medium text-[var(--c-accent)] mb-1">Categories</h3>
                <p className="text-xs text-[var(--c-ink-muted)] mb-3">Manage activity categories for time entries.</p>
                <ul className="space-y-2">
                  {categories.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 bg-[var(--c-surface2)] rounded p-2">
                      <input className={input} value={c} onChange={(e) => setCategories((arr) => arr.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} />
                      <button onClick={() => { if (confirm("Remove this category?")) setCategories((arr) => arr.filter((_, j) => j !== i)); }} className="text-xs px-2 py-1 rounded text-white shrink-0" style={{ background: "var(--c-error)" }}>Remove</button>
                    </li>
                  ))}
                </ul>
                <AddCategory onAdd={(c) => setCategories((arr) => (arr.includes(c) ? arr : [...arr, c].sort()))} inputCls={input} />
              </div>
              <div className="text-center">
                <button onClick={saveSettings} className="btn text-sm text-white" style={{ background: "var(--c-success)" }}>Save Settings</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small subcomponents ---------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Desc({ text }: { text: string }) {
  return (
    <div className="mt-2 p-3 rounded bg-[var(--c-surface2)] border border-[var(--c-accent)] text-xs leading-relaxed">
      <div className="font-semibold mb-1">Case Description:</div>
      {text}
    </div>
  );
}

function Combobox({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const q = value.toLowerCase();
  const matches = open ? (q ? options.filter((o) => o.toLowerCase().includes(q)) : options) : [];

  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function select(v: string) { onChange(v); setOpen(false); setHi(-1); }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 pr-9 text-sm rounded outline-none focus:border-[var(--c-accent)] cursor-pointer"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") { setOpen(true); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && hi < matches.length) select(matches[hi]); }
          else if (e.key === "Escape" || e.key === "Tab") setOpen(false);
        }}
      />
      <ChevronDown size={15} className={`absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)] pointer-events-none transition-transform ${open ? "rotate-180" : ""}`} />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 max-h-52 overflow-y-auto rounded-b-md border border-t-0 border-[var(--c-accent)] bg-[var(--c-surface)] shadow-lg">
          {matches.map((o, i) => (
            <div key={o} onClick={() => select(o)} onMouseEnter={() => setHi(i)} className={`px-3 py-2 text-sm cursor-pointer border-b border-[var(--c-border)] last:border-0 ${i === hi ? "bg-[var(--c-surface2)]" : ""}`}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddUser({ onAdd, inputCls }: { onAdd: (name: string, rate: number) => void; inputCls: string }) {
  const [name, setName] = useState(""); const [rate, setRate] = useState("");
  return (
    <div className="flex gap-2 mt-3">
      <input className={inputCls} placeholder="Enter user name (e.g., John Smith (Attorney))" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" step="0.01" min="0" className={`${inputCls} w-32`} placeholder="Rate ($)" value={rate} onChange={(e) => setRate(e.target.value)} />
      <button onClick={() => { if (!name.trim()) { alert("Please enter a user name"); return; } onAdd(name.trim(), parseFloat(rate) || 145); setName(""); setRate(""); }} className="btn btn-accent text-sm shrink-0">Add User</button>
    </div>
  );
}

function AddCategory({ onAdd, inputCls }: { onAdd: (c: string) => void; inputCls: string }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2 mt-3">
      <input className={inputCls} placeholder="Enter category name (e.g., COURT APPEARANCE)" value={val} onChange={(e) => setVal(e.target.value)} />
      <button onClick={() => { const c = val.trim().toUpperCase(); if (!c) { alert("Please enter a category name"); return; } onAdd(c); setVal(""); }} className="btn btn-accent text-sm shrink-0">Add Category</button>
    </div>
  );
}
