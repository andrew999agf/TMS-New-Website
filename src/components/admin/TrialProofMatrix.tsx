"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Scale, FileText, Mic, ChevronRight, Star, X, Pencil, ExternalLink } from "lucide-react";
import { addClaim, updateClaim, deleteClaim, addElement, updateElement, deleteElement, addProof, deleteProof, type ProofInput } from "@/app/admin/(panel)/pre-trial/evidence-actions";

export type ProofRow = { id: number; elementId: number; kind: string; exhibitId: number | null; witnessId: number | null; citation: string; summary: string; anticipated: boolean };
export type ElementRow = { id: number; claimId: number; text: string; notes: string };
export type ClaimRow = { id: number; name: string; party: string; isLead: boolean; notes: string };
export type ExhibitLite = { id: number; number: string; title: string; side: string; url: string | null };
export type WitnessLite = { id: number; name: string; side: string; role: string };

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

const exhibitLabel = (e: ExhibitLite) => `${e.number ? `${e.number} — ` : ""}${e.title}`;

export function TrialProofMatrix({
  caseId, claims, elements, proofs, exhibits, witnesses,
}: {
  caseId: number;
  claims: ClaimRow[];
  elements: ElementRow[];
  proofs: ProofRow[];
  exhibits: ExhibitLite[];
  witnesses: WitnessLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addingClaim, setAddingClaim] = useState(false);
  const [claimName, setClaimName] = useState("");
  const [claimParty, setClaimParty] = useState("plaintiff");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  const totalProofs = proofs.length;
  const unproven = elements.filter((el) => !proofs.some((p) => p.elementId === el.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium"><Scale size={15} className="text-[var(--c-accent)]" /> {claims.length} cause{claims.length === 1 ? "" : "s"} of action</span>
        <span className="text-[var(--c-ink-muted)]">{elements.length} elements · {totalProofs} proof entries</span>
        {unproven > 0 && <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{unproven} element{unproven === 1 ? "" : "s"} with no proof yet</span>}
        <button onClick={() => setAddingClaim((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--c-surface2)]">
          <Plus size={14} /> Add cause of action
        </button>
      </div>

      {addingClaim && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold">Cause of action</label>
            <input value={claimName} onChange={(e) => setClaimName(e.target.value)} placeholder="Count 3 — Breach of Contract" className={input} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Party</label>
            <select value={claimParty} onChange={(e) => setClaimParty(e.target.value)} className={input}>
              <option value="plaintiff">Plaintiff&apos;s claim</option>
              <option value="defendant">Defendant&apos;s claim</option>
            </select>
          </div>
          <button
            onClick={() => { if (!claimName.trim()) return; run(async () => { const r = await addClaim(caseId, claimName, claimParty); if (r.ok) { setClaimName(""); setAddingClaim(false); } return r; }); }}
            disabled={pending || !claimName.trim()}
            className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-3 disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
          </button>
          <button onClick={() => setAddingClaim(false)} className="rounded-md border border-[var(--c-border)] px-2 py-2 text-sm text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]"><X size={14} /></button>
        </div>
      )}

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

      {claims.length === 0 ? (
        <p className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center text-sm text-[var(--c-ink-muted)]">
          No causes of action yet. Add one, then list the elements it has to prove and attach the exhibit or testimony for each.
        </p>
      ) : (
        claims.map((c) => (
          <ClaimCard
            key={c.id}
            caseId={caseId}
            claim={c}
            elements={elements.filter((e) => e.claimId === c.id)}
            proofs={proofs}
            exhibits={exhibits}
            witnesses={witnesses}
            run={run}
            pending={pending}
          />
        ))
      )}
    </div>
  );
}

function ClaimCard({ caseId, claim, elements, proofs, exhibits, witnesses, run, pending }: {
  caseId: number; claim: ClaimRow; elements: ElementRow[]; proofs: ProofRow[];
  exhibits: ExhibitLite[]; witnesses: WitnessLite[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void; pending: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [addingEl, setAddingEl] = useState(false);
  const [elText, setElText] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(claim.name);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] p-3">
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[var(--c-ink-muted)]">
          <ChevronRight size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {claim.isLead && <Star size={14} className="shrink-0 fill-amber-400 text-amber-500" />}
        {editing ? (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} min-w-0 flex-1`} autoFocus />
            <button onClick={() => run(async () => { const r = await updateClaim(claim.id, { name }); if (r.ok) setEditing(false); return r; })} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3">Save</button>
            <button onClick={() => { setEditing(false); setName(claim.name); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--c-ink)]">{claim.name}</span>
              <span className="block text-[11px] text-[var(--c-ink-muted)]">
                {claim.party === "defendant" ? "Defendant's claim" : "Plaintiff's claim"} · {elements.length} element{elements.length === 1 ? "" : "s"}
              </span>
            </span>
            <button onClick={() => run(() => updateClaim(claim.id, { isLead: !claim.isLead }))} title={claim.isLead ? "Unmark lead claim" : "Mark as lead claim"} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-amber-500"><Star size={14} /></button>
            <button onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Rename"><Pencil size={14} /></button>
            <button onClick={() => { if (confirm(`Delete “${claim.name}” and all of its elements and proof entries?`)) run(() => deleteClaim(claim.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
          </>
        )}
      </div>

      {open && (
        <div className="divide-y divide-[var(--c-border)]">
          {elements.length === 0 && <p className="p-4 text-sm text-[var(--c-ink-muted)]">No elements yet.</p>}
          {elements.map((el, i) => (
            <ElementBlock
              key={el.id}
              caseId={caseId}
              index={i + 1}
              element={el}
              proofs={proofs.filter((p) => p.elementId === el.id)}
              exhibits={exhibits}
              witnesses={witnesses}
              run={run}
              pending={pending}
            />
          ))}

          <div className="p-3">
            {addingEl ? (
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={elText}
                  onChange={(e) => setElText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (elText.trim()) run(async () => { const r = await addElement(caseId, claim.id, elText); if (r.ok) { setElText(""); setAddingEl(false); } return r; }); } }}
                  placeholder="Element the claim must prove…"
                  className={`${input} min-w-[240px] flex-1`}
                  autoFocus
                />
                <button onClick={() => { if (elText.trim()) run(async () => { const r = await addElement(caseId, claim.id, elText); if (r.ok) { setElText(""); setAddingEl(false); } return r; }); }} disabled={pending} className="btn btn-accent text-sm py-2 px-3">Add</button>
                <button onClick={() => setAddingEl(false)} className="text-sm text-[var(--c-ink-muted)]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingEl(true)} className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><Plus size={13} /> Add an element</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ElementBlock({ caseId, index, element, proofs, exhibits, witnesses, run, pending }: {
  caseId: number; index: number; element: ElementRow; proofs: ProofRow[];
  exhibits: ExhibitLite[]; witnesses: WitnessLite[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void; pending: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(element.text);

  const exById = new Map(exhibits.map((e) => [e.id, e]));
  const wById = new Map(witnesses.map((w) => [w.id, w]));

  return (
    <div className="p-3 pl-5">
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-[var(--c-surface2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-ink-muted)]">{index}</span>
        {editing ? (
          <>
            <input value={text} onChange={(e) => setText(e.target.value)} className={`${input} min-w-0 flex-1`} autoFocus />
            <button onClick={() => run(async () => { const r = await updateElement(element.id, { text }); if (r.ok) setEditing(false); return r; })} disabled={pending} className="btn btn-accent text-xs py-1.5 px-3">Save</button>
            <button onClick={() => { setEditing(false); setText(element.text); }} className="text-xs text-[var(--c-ink-muted)]">Cancel</button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-sm font-medium text-[var(--c-ink)]">{element.text}</span>
            {proofs.length === 0 && <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">No proof yet</span>}
            <button onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Edit element"><Pencil size={13} /></button>
            <button onClick={() => { if (confirm("Remove this element and its proof entries?")) run(() => deleteElement(element.id)); }} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove element"><Trash2 size={13} /></button>
          </>
        )}
      </div>

      {proofs.length > 0 && (
        <ul className="mb-2 space-y-1 pl-7">
          {proofs.map((p) => {
            const ex = p.exhibitId ? exById.get(p.exhibitId) : undefined;
            const w = p.witnessId ? wById.get(p.witnessId) : undefined;
            return (
              <li key={p.id} className="flex flex-wrap items-start gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2.5 py-1.5 text-xs">
                {p.kind === "testimony" ? <Mic size={13} className="mt-0.5 shrink-0 text-[var(--c-accent)]" /> : <FileText size={13} className="mt-0.5 shrink-0 text-[var(--c-accent)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[var(--c-ink)]">
                    {p.kind === "testimony"
                      ? (w ? `${w.name}${w.role ? ` — ${w.role}` : ""}` : "Testimony")
                      : (ex ? exhibitLabel(ex) : "Exhibit")}
                    {p.anticipated && <span className="ml-1 italic text-[var(--c-ink-muted)]">(anticipated)</span>}
                  </span>
                  {p.citation && <span className="block text-[var(--c-ink-muted)]">{p.citation}</span>}
                  {p.summary && <span className="block text-[var(--c-ink-muted)]">{p.summary}</span>}
                </span>
                {ex?.url && (
                  <a href={ex.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]" title="Open exhibit"><ExternalLink size={13} /></a>
                )}
                <button onClick={() => run(() => deleteProof(p.id))} className="shrink-0 rounded p-1 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pl-7">
        {adding ? (
          <ProofForm
            caseId={caseId}
            elementId={element.id}
            exhibits={exhibits}
            witnesses={witnesses}
            pending={pending}
            onDone={() => setAdding(false)}
            run={run}
          />
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
            <Plus size={13} /> Prove this element
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The "how is this element proved?" form: pick exhibit or testimony, then the
 * specific exhibit number or witness, plus a citation.
 */
function ProofForm({ caseId, elementId, exhibits, witnesses, pending, onDone, run }: {
  caseId: number; elementId: number; exhibits: ExhibitLite[]; witnesses: WitnessLite[];
  pending: boolean; onDone: () => void;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [kind, setKind] = useState<"exhibit" | "testimony">("exhibit");
  const [exhibitId, setExhibitId] = useState<string>("");
  const [witnessId, setWitnessId] = useState<string>("");
  const [citation, setCitation] = useState("");
  const [summary, setSummary] = useState("");
  const [anticipated, setAnticipated] = useState(false);

  function submit() {
    const payload: ProofInput = {
      kind,
      exhibitId: kind === "exhibit" && exhibitId ? Number(exhibitId) : null,
      witnessId: kind === "testimony" && witnessId ? Number(witnessId) : null,
      citation,
      summary,
      anticipated: kind === "testimony" && anticipated,
    };
    run(async () => {
      const r = await addProof(caseId, elementId, payload);
      if (r.ok) onDone();
      return r;
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/[0.03] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--c-ink)]">Satisfied by:</span>
        <div className="flex overflow-hidden rounded-md border border-[var(--c-border)]">
          <button onClick={() => setKind("exhibit")} className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs ${kind === "exhibit" ? "bg-[var(--c-accent)] text-white" : "hover:bg-[var(--c-surface2)]"}`}>
            <FileText size={12} /> Exhibit
          </button>
          <button onClick={() => setKind("testimony")} className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs ${kind === "testimony" ? "bg-[var(--c-accent)] text-white" : "hover:bg-[var(--c-surface2)]"}`}>
            <Mic size={12} /> Testimony
          </button>
        </div>
      </div>

      {kind === "exhibit" ? (
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Which exhibit?</label>
          <select value={exhibitId} onChange={(e) => setExhibitId(e.target.value)} className={input}>
            <option value="">— not on the exhibit list yet —</option>
            {exhibits.map((e) => <option key={e.id} value={e.id}>{`${e.side === "defendant" ? "[D] " : e.side === "joint" ? "[J] " : "[P] "}${exhibitLabel(e)}`}</option>)}
          </select>
          {exhibits.length === 0 && <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">No exhibits listed yet — add them under Witnesses &amp; Exhibits, or just type the citation below.</p>}
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Which witness?</label>
          <select value={witnessId} onChange={(e) => setWitnessId(e.target.value)} className={input}>
            <option value="">— not on the witness list yet —</option>
            {witnesses.map((w) => <option key={w.id} value={w.id}>{`${w.side === "defendant" ? "[D] " : "[P] "}${w.name}${w.role ? ` — ${w.role}` : ""}`}</option>)}
          </select>
          {witnesses.length === 0 && <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">No witnesses listed yet — add them under Witnesses &amp; Exhibits, or just type the citation below.</p>}
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">Citation {kind === "testimony" && <span className="font-normal text-[var(--c-ink-muted)]">(depo page/line, or leave blank for live testimony)</span>}</label>
        <input value={citation} onChange={(e) => setCitation(e.target.value)} placeholder={kind === "testimony" ? "Morgan Dep. p. 18, ll. 4–19 (RES_000330)" : "RES_000260; 000804"} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-[var(--c-ink)]">What it establishes <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></label>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Never discussed road use with Smith before 2024" className={input} />
      </div>

      {kind === "testimony" && (
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--c-ink-muted)]">
          <input type="checkbox" checked={anticipated} onChange={(e) => setAnticipated(e.target.checked)} />
          Anticipated trial testimony (no deposition testimony behind it yet)
        </label>
      )}

      <div className="flex gap-2">
        <button onClick={submit} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add proof
        </button>
        <button onClick={onDone} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">Cancel</button>
      </div>
    </div>
  );
}
