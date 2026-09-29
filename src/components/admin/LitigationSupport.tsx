"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Copy, Download, ExternalLink, FileText, Gavel, Hammer, Loader2, Pencil, Plus, Trash2, UploadCloud, X,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import {
  saveDwqPackage, deleteDwqPackage, generateDwqDoc, registerLitFile, deleteLitFile,
} from "@/app/admin/(panel)/litigation-support/actions";
import type { DwqInput } from "@/lib/litigation/dwq-docx";

/**
 * Litigation Support Services: the firm's discovery-paper shop.
 * Built now: the DWQ / records-subpoena builder and the Word form bank
 * (plain Save-As files — deliberately NOT merge-field templates).
 * The other sub-tabs are declared and queued so the section's shape is set.
 */

export type LitFileRow = { id: number; filename: string; url: string; sizeBytes: number | null; notes: string; uploadedBy: string; createdAt: string };
export type DwqRow = { id: number; matter: string; entity: string; data: Record<string, unknown>; updatedAt: string };

const TABS = [
  { key: "dwq", label: "DWQ & Records Subpoenas", built: true },
  { key: "forms", label: "Word Form Bank", built: true },
  { key: "depo", label: "Notices of Deposition (Oral)", built: false },
  { key: "written", label: "Written Discovery — ROGs · RFPs · RFAs", built: false },
  { key: "disclosures", label: "Disclosures & Expert Designations", built: false },
  { key: "trial-subpoenas", label: "Trial & Hearing Subpoenas", built: false },
  { key: "motions", label: "Discovery Motions — Compel · Quash · Protect", built: false },
  { key: "tracker", label: "Service & Deadline Tracker", built: false },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const emptyDwq = (): DwqInput => ({
  causeNo: "",
  courtLines: ["IN THE COUNTY COURT AT LAW", "NO. ___", "________ COUNTY, TEXAS"],
  plaintiff: "",
  defendant: "",
  noticingParty: "Plaintiff ",
  entity: "",
  serviceLine: "by and through its Registered Agent, ____________, ____________, or wherever it may be found.",
  financial: false,
  method: "zoom",
  dateTime: "",
  reporter: "Caprock Court Reporting, (806) 795-4202",
  zoomLink: "",
  zoomMeetingId: "",
  zoomPasscode: "",
  location: "",
  affidavitOption: true,
  definitions: "Definitions. “Entity” means ____________. “Relevant Period” means ____________ through ____________.",
  documents: [""],
  includeStandardQuestions: true,
  customQuestions: [],
  includeHousekeepingQuestions: true,
  returnFax: "(817) 348-8328",
  returnEmail: "max@texaslawsmith.com",
  officePhone: "(254) 435-4288",
  serviceDate: "",
  noEarlierThan: "",
  issuanceDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  attorneyBlock: [
    "Thomas Maxwell Smith",
    "Texas Bar No. 24110379",
    "max@texaslawsmith.com",
    "T. Maxwell Smith, PLLC",
    "PO Box 11009 (Mailing Address)",
    "Fort Worth, Texas 76110",
    "Telephone: (817) 348-8325",
    "Facsimile: (817) 348-8328",
  ],
  signRole: "Attorney for Plaintiff",
  opposingCounsel: [""],
});

const inputCls = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
const areaCls = `${inputCls} resize-y font-mono text-xs leading-relaxed`;
const lbl = "mb-1 block text-xs font-semibold text-[var(--c-ink)]";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className={lbl}>{label}</span>{children}</label>;
}

function fmtSize(n: number | null): string {
  if (!n) return "";
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function LitigationSupport({ files, packages, blobReady }: { files: LitFileRow[]; packages: DwqRow[]; blobReady: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("dwq");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${tab === t.key ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-accent)]/60"}`}>
            {t.label}
            {!t.built && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tab === t.key ? "bg-white/20" : "bg-[var(--c-accent)]/10 text-[var(--c-accent)]"}`}>IN BUILD</span>}
          </button>
        ))}
      </div>

      {tab === "dwq" && <DwqTab packages={packages} onChanged={() => router.refresh()} />}
      {tab === "forms" && <FormBank files={files} blobReady={blobReady} onChanged={() => router.refresh()} />}
      {!TABS.find((t) => t.key === tab)?.built && <ComingSoon tab={TABS.find((t) => t.key === tab)!.label} />}
    </div>
  );
}

function ComingSoon({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-16 text-center">
      <Hammer size={30} className="text-[var(--c-accent)]" />
      <p className="text-lg font-semibold">{tab}</p>
      <p className="max-w-md text-sm text-[var(--c-ink-muted)]">
        In the build queue. This surface is planned as part of Litigation Support Services — tell Max which one you need
        next and it moves to the front of the line.
      </p>
    </div>
  );
}

/* ------------------------------- DWQ tab ------------------------------- */

function DwqTab({ packages, onChanged }: { packages: DwqRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<{ id?: number; matter: string; form: DwqInput } | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "word">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startNew = () => { setError(null); setEditing({ matter: "", form: emptyDwq() }); };
  const startEdit = (p: DwqRow) => { setError(null); setEditing({ id: p.id, matter: p.matter, form: { ...emptyDwq(), ...(p.data as unknown as DwqInput) } }); };
  const startDup = (p: DwqRow) => { setError(null); setEditing({ matter: p.matter, form: { ...emptyDwq(), ...(p.data as unknown as DwqInput) } }); };

  const set = <K extends keyof DwqInput>(k: K, v: DwqInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  async function save(): Promise<number | null> {
    if (!editing) return null;
    setBusy("save"); setError(null);
    const r = await saveDwqPackage(editing.form, editing.matter, editing.id);
    setBusy("");
    if (!r.ok) { setError(r.error ?? "Couldn't save."); return null; }
    setEditing((e) => (e ? { ...e, id: r.id } : e));
    setNotice("Package saved."); onChanged();
    return r.id;
  }

  async function generate() {
    if (!editing) return;
    setBusy("word"); setError(null);
    const saved = await saveDwqPackage(editing.form, editing.matter, editing.id);
    if (saved.ok) setEditing((e) => (e ? { ...e, id: saved.id } : e));
    const r = await generateDwqDoc(editing.form);
    setBusy("");
    if (!r.ok) { setError(r.error ?? "Couldn't generate."); return; }
    const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const blobUrl = URL.createObjectURL(new Blob([bin], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const a = document.createElement("a");
    a.href = blobUrl; a.download = r.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    setNotice(`${r.filename} downloaded — serve one copy on opposing counsel and the witness, and send the notice + questions to the court reporter.`);
    onChanged();
  }

  async function remove(p: DwqRow) {
    if (!confirm(`Delete the DWQ package for "${p.entity}"? The saved inputs are gone; generated Word files you downloaded are unaffected.`)) return;
    const r = await deleteDwqPackage(p.id);
    if (r.ok) onChanged();
  }

  const f = editing?.form;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <div>
        {notice && (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <Check size={15} className="mt-0.5 shrink-0" /> {notice} <button onClick={() => setNotice(null)} className="ml-auto"><X size={14} /></button>
          </p>
        )}
        {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        {!editing ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <button onClick={startNew} className="btn btn-accent inline-flex items-center gap-1.5 px-4 py-2 text-sm"><Plus size={15} /> New DWQ / records subpoena</button>
              <p className="text-xs text-[var(--c-ink-muted)]">One package per witness. Saved packages regenerate the Word document any time.</p>
            </div>
            {packages.length === 0 ? (
              <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">
                No packages yet. Start one — the form comes pre-loaded with the firm's standard custodian questions, Rule 176.8 language, and the Rule 902(10) affidavit exhibit.
              </p>
            ) : (
              <div className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
                {packages.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <Gavel size={14} className="shrink-0 text-[var(--c-accent)]" />
                    <span className="min-w-0 flex-1 break-words font-medium">{p.entity}</span>
                    {p.matter && <span className="rounded-full bg-[var(--c-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-accent)]">{p.matter}</span>}
                    {(p.data as { financial?: boolean }).financial && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">§ 59.006</span>}
                    <span className="text-xs text-[var(--c-ink-muted)]">{(p.data as { method?: string }).method === "in-person" ? "in person" : "Zoom"} · {p.updatedAt.slice(0, 10)}</span>
                    <button onClick={() => startEdit(p)} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-0.5 text-[11px] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"><Pencil size={11} /> open</button>
                    <button onClick={() => startDup(p)} title="Start a new package from this one" className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-0.5 text-[11px] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"><Copy size={11} /> duplicate</button>
                    <button onClick={() => void remove(p)} className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-0.5 text-[11px] text-[var(--c-ink-muted)] hover:border-red-500 hover:text-red-600"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : f && (
          <div className="space-y-4 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{editing.id ? `Editing package #${editing.id}` : "New DWQ / records subpoena"}</p>
              <button onClick={() => setEditing(null)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] px-2 py-1 text-xs hover:border-[var(--c-accent)]"><X size={12} /> Close</button>
            </div>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Case</legend>
              <Field label="Matter no. (optional tag)"><input className={inputCls} value={editing.matter} onChange={(e) => setEditing((x) => x && { ...x, matter: e.target.value })} placeholder="00123-Client" /></Field>
              <Field label="Cause no."><input className={inputCls} value={f.causeNo} onChange={(e) => set("causeNo", e.target.value)} placeholder="2025-005336-3" /></Field>
              <Field label="Plaintiff"><input className={inputCls} value={f.plaintiff} onChange={(e) => set("plaintiff", e.target.value)} /></Field>
              <Field label="Defendant(s)"><input className={inputCls} value={f.defendant} onChange={(e) => set("defendant", e.target.value)} /></Field>
              <Field label="Court block (one line per caption line)" className="sm:col-span-2">
                <textarea className={areaCls} rows={3} value={f.courtLines.join("\n")} onChange={(e) => set("courtLines", e.target.value.split("\n"))} />
              </Field>
              <Field label="Noticing party (as it reads in the notice)" className="sm:col-span-2"><input className={inputCls} value={f.noticingParty} onChange={(e) => set("noticingParty", e.target.value)} placeholder="Plaintiff Holocron Toy Store LLC" /></Field>
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Witness</legend>
              <Field label="Entity (custodian of records of…)" className="sm:col-span-2"><input className={inputCls} value={f.entity} onChange={(e) => set("entity", e.target.value)} placeholder="JPMorgan Chase Bank, N.A." /></Field>
              <Field label="Service line (registered agent + address)" className="sm:col-span-2">
                <textarea className={areaCls} rows={2} value={f.serviceLine} onChange={(e) => set("serviceLine", e.target.value)} />
              </Field>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.financial} onChange={(e) => set("financial", e.target.checked)} />
                Financial institution (adds Tex. Fin. Code § 59.006: customer-notice sentence + no-earlier-than date)
              </label>
              {f.financial && <Field label="Not required to produce before"><input className={inputCls} value={f.noEarlierThan} onChange={(e) => set("noEarlierThan", e.target.value)} placeholder="October 24, 2026" /></Field>}
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Deposition officer & setting</legend>
              <Field label="How the court reporter attends">
                <select className={inputCls} value={f.method} onChange={(e) => set("method", e.target.value as "zoom" | "in-person")}>
                  <option value="zoom">Zoom videoconference</option>
                  <option value="in-person">In person</option>
                </select>
              </Field>
              <Field label="Date & time (as it reads)"><input className={inputCls} value={f.dateTime} onChange={(e) => set("dateTime", e.target.value)} placeholder="October 26, 2026, at 10:00 a.m." /></Field>
              <Field label="Court reporter" className="sm:col-span-2"><input className={inputCls} value={f.reporter} onChange={(e) => set("reporter", e.target.value)} /></Field>
              {f.method === "zoom" ? (
                <>
                  <Field label="Zoom link" className="sm:col-span-2"><input className={inputCls} value={f.zoomLink} onChange={(e) => set("zoomLink", e.target.value)} /></Field>
                  <Field label="Meeting ID"><input className={inputCls} value={f.zoomMeetingId} onChange={(e) => set("zoomMeetingId", e.target.value)} /></Field>
                  <Field label="Passcode"><input className={inputCls} value={f.zoomPasscode} onChange={(e) => set("zoomPasscode", e.target.value)} /></Field>
                </>
              ) : (
                <Field label="Location (address for the in-person deposition)" className="sm:col-span-2"><input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
              )}
              <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={f.affidavitOption} onChange={(e) => set("affidavitOption", e.target.checked)} />
                Offer a Rule 902(10) business-records affidavit in lieu of appearance (attaches the affidavit as Exhibit 1 — the usual outcome)
              </label>
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Documents to be produced</legend>
              <Field label="Definitions paragraph"><textarea className={areaCls} rows={4} value={f.definitions} onChange={(e) => set("definitions", e.target.value)} /></Field>
              <Field label="Requested items — one per line (numbered automatically)">
                <textarea className={areaCls} rows={6} value={f.documents.join("\n")} onChange={(e) => set("documents", e.target.value.split("\n"))} />
              </Field>
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Written questions</legend>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.includeStandardQuestions} onChange={(e) => set("includeStandardQuestions", e.target.checked)} />
                Include the six standard custodian questions (name/title, custodian, regular course, at-or-near time, regular practice, true copies)
              </label>
              <Field label="Case-specific questions — one per line (numbered after the standard set)">
                <textarea className={areaCls} rows={6} value={f.customQuestions.join("\n")} onChange={(e) => set("customQuestions", e.target.value.split("\n"))} placeholder="Please identify each account maintained at the Entity on which …" />
              </Field>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.includeHousekeepingQuestions} onChange={(e) => set("includeHousekeepingQuestions", e.target.checked)} />
                Include the closing housekeeping questions (withheld documents · no responsive records · destroyed/purged records)
              </label>
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Return & dates</legend>
              <Field label="Return fax"><input className={inputCls} value={f.returnFax} onChange={(e) => set("returnFax", e.target.value)} /></Field>
              <Field label="Return email"><input className={inputCls} value={f.returnEmail} onChange={(e) => set("returnEmail", e.target.value)} /></Field>
              <Field label="Office phone (call-ahead line)"><input className={inputCls} value={f.officePhone} onChange={(e) => set("officePhone", e.target.value)} /></Field>
              <Field label="Service date (certificate + § 59.006 notice)"><input className={inputCls} value={f.serviceDate} onChange={(e) => set("serviceDate", e.target.value)} placeholder="September 29, 2026" /></Field>
              <Field label="Issuance date"><input className={inputCls} value={f.issuanceDate} onChange={(e) => set("issuanceDate", e.target.value)} /></Field>
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--c-accent)]">Signature & service</legend>
              <Field label="Attorney block — one line per line (name first)">
                <textarea className={areaCls} rows={8} value={f.attorneyBlock.join("\n")} onChange={(e) => set("attorneyBlock", e.target.value.split("\n"))} />
              </Field>
              <div className="space-y-3">
                <Field label="Signs as"><input className={inputCls} value={f.signRole} onChange={(e) => set("signRole", e.target.value)} placeholder="Attorney for Plaintiff" /></Field>
                <Field label="Opposing counsel block — one line per line">
                  <textarea className={areaCls} rows={6} value={f.opposingCounsel.join("\n")} onChange={(e) => set("opposingCounsel", e.target.value.split("\n"))} />
                </Field>
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--c-border)] pt-3">
              <button onClick={() => void save()} disabled={busy !== ""} className="btn btn-outline inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
                {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save package
              </button>
              <button onClick={() => void generate()} disabled={busy !== ""} className="btn btn-accent inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
                {busy === "word" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Generate Word document
              </button>
              <p className="text-xs text-[var(--c-ink-muted)]">One .docx: notice + subpoena duces tecum + questions{f.affidavitOption ? " + Exhibit 1 affidavit" : ""}. Open it, proof it, sign it, serve it.</p>
            </div>
          </div>
        )}
      </div>

      <IssueServeChecklist />
    </div>
  );
}

/** The firm's issue-and-serve workflow, condensed from the Rule 200/205/176
 *  playbook so whoever runs the package doesn't have to reconstruct it. */
function IssueServeChecklist() {
  return (
    <aside className="h-fit rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-[13px] leading-relaxed">
      <p className="mb-2 flex items-center gap-1.5 font-semibold"><FileText size={14} className="text-[var(--c-accent)]" /> Issue & serve checklist</p>
      <ol className="list-decimal space-y-2 pl-4 text-[var(--c-ink-muted)]">
        <li><strong className="text-[var(--c-ink)]">Issue.</strong> The attorney signs the subpoena (Rule 176.4(b)) — signing IS issuance. The court reporter does not have to issue it; a process server never can.</li>
        <li><strong className="text-[var(--c-ink)]">Serve the parties first.</strong> Notice + questions to all counsel under Rule 21a, before or with service on the witness (Rule 205.2).</li>
        <li><strong className="text-[var(--c-ink)]">Serve the witness.</strong> Personal delivery on the entity's registered agent by a sheriff, constable, or any non-party 18+ — with the witness fee tendered at service (Rule 176.5; no fee = no contempt under 176.8(b)). Email is not service.</li>
        <li><strong className="text-[var(--c-ink)]">Send to the court reporter.</strong> The notice AND the full written questions go to the deposition officer in advance (Rule 200.1(a)) — mandatory.</li>
        <li><strong className="text-[var(--c-ink)]">Mind the clock.</strong> Notice reaches the witness and all parties ≥ 20 days before the deposition; cross-questions +10 days, redirect +5, re-cross +3 (Rule 200.3); nonparty objections due before compliance (Rule 176.6); confirm the date is inside the discovery period.</li>
        <li><strong className="text-[var(--c-ink)]">Financial institutions.</strong> § 59.006 overlay: customer's counsel served under 21a, compliance ≥ 24 days out, and the bank can demand costs or a bond before producing.</li>
        <li><strong className="text-[var(--c-ink)]">Expect the affidavit.</strong> Most entities return records with the Rule 902(10) affidavit instead of appearing — that's the designed outcome; nobody may join the Zoom.</li>
      </ol>
    </aside>
  );
}

/* ----------------------------- Form bank tab ---------------------------- */

function FormBank({ files, blobReady, onChanged }: { files: LitFileRow[]; blobReady: boolean; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const totalSize = useMemo(() => files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0), [files]);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setError(null);
    try {
      for (const file of Array.from(list)) {
        setProgress(`Uploading ${file.name}…`);
        const blob = await upload(`lit-forms/${file.name}`, file, {
          access: "public", handleUploadUrl: "/api/admin/lit-upload", multipart: true,
        });
        const r = await registerLitFile({ filename: file.name, url: blob.url, pathname: blob.pathname, contentType: blob.contentType, sizeBytes: file.size });
        if (!r.ok) throw new Error(r.error ?? "Couldn't record the upload.");
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message || "Upload failed.");
    } finally {
      setBusy(false); setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(f: LitFileRow) {
    if (!confirm(`Delete "${f.filename}" from the form bank?`)) return;
    const r = await deleteLitFile(f.id);
    if (r.ok) onChanged();
  }

  return (
    <div className="max-w-3xl p-4">
      <p className="mb-3 text-sm text-[var(--c-ink-muted)]">
        The firm's <strong className="text-[var(--c-ink)]">Word form bank</strong> — plain documents. Open one, <strong className="text-[var(--c-ink)]">Save As</strong>, and build the new
        document from it (a person or the AI). Deliberately <strong className="text-[var(--c-ink)]">not</strong> merge-field templates: that's the firm's standing convention unless Max
        says otherwise for a specific tool.
      </p>
      {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <button onClick={() => inputRef.current?.click()} disabled={busy || !blobReady}
        title={blobReady ? undefined : "File storage is available on the live site only."}
        className="mb-4 flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)] disabled:opacity-50">
        {busy ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
        {progress ?? "Drop the firm's Word forms here — .docx, .doc, .dotx, .pdf, .rtf"}
      </button>
      <input ref={inputRef} type="file" multiple accept=".docx,.doc,.dotx,.pdf,.rtf" className="hidden" onChange={(e) => void onFiles(e.target.files)} />

      {files.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-ink-muted)]">Nothing in the bank yet — dump the firm's go-to Word docs here.</p>
      ) : (
        <div className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
          {files.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <FileText size={14} className="shrink-0 text-[var(--c-accent)]" />
              <span className="min-w-0 flex-1 break-words">{f.filename}</span>
              <span className="text-xs text-[var(--c-ink-muted)]">{fmtSize(f.sizeBytes)} · {f.createdAt.slice(0, 10)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}</span>
              <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--c-accent)] hover:underline"><ExternalLink size={12} /> open</a>
              <button onClick={() => void remove(f)} className="text-[var(--c-ink-muted)] hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
            </div>
          ))}
          <p className="px-4 py-2 text-right text-[11px] text-[var(--c-ink-muted)]">{files.length} file{files.length === 1 ? "" : "s"} · {fmtSize(totalSize)}</p>
        </div>
      )}
    </div>
  );
}
