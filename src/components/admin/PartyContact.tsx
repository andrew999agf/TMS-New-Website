"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, IdCard, Loader2, X } from "lucide-react";
import { updateCasePartyContact } from "@/app/admin/(panel)/cases/actions";
import { searchContacts, type ContactHit } from "@/app/admin/(panel)/contacts/actions";
import type { CaseParty, PartyAttorney } from "@/db/schema";

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

const OPPOSING_ROLES = new Set(["Defendant", "Intervenor", "Intervenor Defendant", "Third-Party Defendant", "Counter-Plaintiff", "Cross-Claimant"]);

type Suggestion =
  | { source: "case"; label: string; sub: string; attorney: PartyAttorney; fromParty: string }
  | { source: "book"; label: string; sub: string; contact: ContactHit };

/** The little card icon between the pencil and the trash can. Filled accent
 *  when the party already has contact details on file. */
export function PartyContactButton({ caseId, index, party, allParties }: {
  caseId: number;
  index: number;
  party: CaseParty;
  allParties: CaseParty[];
}) {
  const [open, setOpen] = useState(false);
  const has = !!(party.email || party.phone || party.address || party.attorney?.name);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={`shrink-0 rounded p-1 ${has ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"}`}
        title={has ? `Contact info on file${party.attorney?.name ? ` — atty ${party.attorney.name}` : ""}` : "Add contact information"}
        aria-label={`Contact information for ${party.name}`}>
        <IdCard size={14} strokeWidth={has ? 2.4 : 2} />
      </button>
      {open && <PartyContactDialog caseId={caseId} index={index} party={party} allParties={allParties} onClose={() => setOpen(false)} />}
    </>
  );
}

function PartyContactDialog({ caseId, index, party, allParties, onClose }: {
  caseId: number; index: number; party: CaseParty; allParties: CaseParty[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    email: party.email ?? "", phone: party.phone ?? "", address: party.address ?? "",
    aName: party.attorney?.name ?? "", aFirm: party.attorney?.firm ?? "",
    aEmail: party.attorney?.email ?? "", aPhone: party.attorney?.phone ?? "", aAddress: party.attorney?.address ?? "",
  });

  // ---- attorney type-ahead: this case's other attorneys first, then the book
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [showSugs, setShowSugs] = useState(false);
  const [confirmSame, setConfirmSame] = useState<{ attorney: PartyAttorney; fromParty: string } | null>(null);
  const seq = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowSugs(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function onAttorneyName(v: string) {
    setF((prev) => ({ ...prev, aName: v }));
    setConfirmSame(null);
    const q = v.trim().toLowerCase();
    const mySeq = ++seq.current;
    if (q.length < 2) { setSugs([]); setShowSugs(false); return; }
    // in-case matches are instant
    const inCase: Suggestion[] = allParties
      .filter((p, i) => i !== index && p.attorney?.name && p.attorney.name.toLowerCase().includes(q))
      .map((p) => ({ source: "case" as const, label: p.attorney!.name, sub: `represents ${p.name} in this case`, attorney: p.attorney!, fromParty: p.name }));
    setSugs(inCase);
    setShowSugs(true);
    // book matches follow
    const t = setTimeout(async () => {
      const hits = await searchContacts(v, "attorney").catch(() => []);
      if (mySeq !== seq.current) return;
      const seen = new Set(inCase.map((s) => s.label.toLowerCase()));
      setSugs([
        ...inCase,
        ...hits.filter((h) => !seen.has(h.name.toLowerCase()))
          .map((h) => ({ source: "book" as const, label: h.name, sub: h.firm || "from Contacts", contact: h })),
      ]);
    }, 350);
    return () => clearTimeout(t);
  }

  function pick(s: Suggestion) {
    setShowSugs(false);
    if (s.source === "case") {
      // Same lawyer as another party in this case: one question, then copy.
      setF((prev) => ({ ...prev, aName: s.attorney.name }));
      setConfirmSame({ attorney: s.attorney, fromParty: s.fromParty });
    } else {
      setF((prev) => ({
        ...prev, aName: s.contact.name,
        aFirm: prev.aFirm || s.contact.firm,
        aEmail: prev.aEmail || s.contact.email,
        aPhone: prev.aPhone || s.contact.phone,
        aAddress: prev.aAddress || s.contact.address,
      }));
    }
  }

  function applySame(yes: boolean) {
    if (yes && confirmSame) {
      const a = confirmSame.attorney;
      setF((prev) => ({ ...prev, aFirm: a.firm ?? "", aEmail: a.email ?? "", aPhone: a.phone ?? "", aAddress: a.address ?? "" }));
    }
    setConfirmSame(null);
  }

  function save() {
    start(async () => {
      const r = await updateCasePartyContact(caseId, index, {
        email: f.email, phone: f.phone, address: f.address,
        attorney: f.aName.trim() ? { name: f.aName, firm: f.aFirm, email: f.aEmail, phone: f.aPhone, address: f.aAddress } : undefined,
      });
      if (r.ok) { onClose(); router.refresh(); }
      else setError(r.error ?? "Couldn't save.");
    });
  }

  const opposing = OPPOSING_ROLES.has(party.role);

  const attorneySection = (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--c-accent)]">Represented by (attorney)</h4>
      {opposing && <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">For an opposing party, their lawyer is the default point of contact.</p>}
      <div ref={boxRef} className="relative mt-2">
        <input value={f.aName} onChange={(e) => onAttorneyName(e.target.value)} onFocus={() => f.aName.trim().length >= 2 && setShowSugs(true)}
          placeholder="Attorney name — start typing to search" className={input} />
        {showSugs && sugs.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
            {sugs.map((s, i) => (
              <button key={`${s.source}-${s.label}-${i}`} onClick={() => pick(s)}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--c-accent)]/10">
                <span className="font-medium">{s.label}</span>
                <span className="truncate text-xs text-[var(--c-ink-muted)]">{s.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {confirmSame && (
        <div className="mt-2 rounded-md border border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 p-3 text-sm">
          <p>Same contact information as <strong>{confirmSame.fromParty}</strong>&apos;s attorney?</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => applySame(true)} className="btn btn-accent text-xs py-1.5 px-3">Yes — copy it</button>
            <button onClick={() => applySame(false)} className="btn btn-outline text-xs py-1.5 px-3">No — just the name</button>
          </div>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input value={f.aFirm} onChange={(e) => setF({ ...f, aFirm: e.target.value })} placeholder="Firm" className={input} />
        <input value={f.aPhone} onChange={(e) => setF({ ...f, aPhone: e.target.value })} placeholder="Phone" className={input} />
        <input value={f.aEmail} onChange={(e) => setF({ ...f, aEmail: e.target.value })} placeholder="Email" className={`${input} col-span-2`} />
        <input value={f.aAddress} onChange={(e) => setF({ ...f, aAddress: e.target.value })} placeholder="Address" className={`${input} col-span-2`} />
      </div>
    </section>
  );

  const partySection = (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--c-accent)]">{party.name}&apos;s own contact info</h4>
      <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">Address and phone matter pre-litigation and when arranging service.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className={input} />
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className={input} />
        <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Address" className={`${input} col-span-2`} />
      </div>
    </section>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 break-words font-[family-name:var(--font-display)] text-lg">Contact — {party.name}</h3>
          <button onClick={onClose} className="shrink-0 text-[var(--c-ink-muted)]"><X size={18} /></button>
        </div>
        <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">{party.role || "Party"}</p>

        <div className="mt-4 space-y-5">
          {opposing ? (<>{attorneySection}{partySection}</>) : (<>{partySection}{attorneySection}</>)}
        </div>

        {error && <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={save} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-60">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save contact info
          </button>
        </div>
      </div>
    </div>
  );
}