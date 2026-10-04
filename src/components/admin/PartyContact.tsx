"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, IdCard, Loader2, X } from "lucide-react";
import { updateCasePartyContact } from "@/app/admin/(panel)/cases/actions";
import type { CaseParty } from "@/db/schema";

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";


/** The little card icon between the pencil and the trash can. Filled accent
 *  when the party already has contact details on file. */
export function PartyContactButton({ caseId, index, party }: {
  caseId: number;
  index: number;
  party: CaseParty;
}) {
  const [open, setOpen] = useState(false);
  const has = !!(party.email || party.phone || party.address);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={`shrink-0 rounded p-1 ${has ? "text-[var(--c-accent)]" : "text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"}`}
        title={has ? "Party contact info on file" : "Add the party's own contact information"}
        aria-label={`Contact information for ${party.name}`}>
        <IdCard size={14} strokeWidth={has ? 2.4 : 2} />
      </button>
      {open && <PartyContactDialog caseId={caseId} index={index} party={party} onClose={() => setOpen(false)} />}
    </>
  );
}

function PartyContactDialog({ caseId, index, party, onClose }: {
  caseId: number; index: number; party: CaseParty; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    email: party.email ?? "", phone: party.phone ?? "", address: party.address ?? "",
  });

  function save() {
    start(async () => {
      const r = await updateCasePartyContact(caseId, index, {
        email: f.email, phone: f.phone, address: f.address,
      });
      if (r.ok) { onClose(); router.refresh(); }
      else setError(r.error ?? "Couldn't save.");
    });
  }

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
          {partySection}
          <p className="text-xs text-[var(--c-ink-muted)]">Counsel of record and CC people are under the party&apos;s <strong>Counsel of Record</strong> bubble.</p>
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