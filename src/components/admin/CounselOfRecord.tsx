"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Plus, Scale, UserPlus, X } from "lucide-react";
import { updateCasePartyCounsel, searchPeople, listFirmPeople, type PersonHit } from "@/app/admin/(panel)/cases/actions";
import type { CaseParty, PartyAttorney } from "@/db/schema";

const input = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]";

/** CC categories. Each one files into the matching Contacts category. */
export const CC_ROLES: { key: string; label: string }[] = [
  { key: "attorney", label: "Attorney" },
  { key: "legal-assistant", label: "Legal assistant" },
  { key: "paralegal", label: "Paralegal" },
  { key: "witness", label: "Witness" },
  { key: "litigation-support", label: "Litigation support (court reporter, expert, vendor…)" },
  { key: "court", label: "Court / clerk" },
  { key: "other", label: "Other" },
];
const roleLabel = (k: string) => CC_ROLES.find((r) => r.key === k)?.label.replace(/ \(.*/, "") ?? "Other";

/** Contact-book kind → CC category, so a picked contact arrives pre-categorized. */
const KIND_TO_ROLE: Record<string, string> = {
  attorney: "attorney", staff: "legal-assistant", witness: "witness",
  "litigation-support": "litigation-support", court: "court",
};

type CcRow = { name: string; role: string; firm: string; email: string; phone: string };
type Counsel = { name: string; firm: string; email: string; phone: string; address: string };

/** True when the party still needs counsel of record filled in. */
export function needsCounsel(p: CaseParty) {
  return !p.attorney?.name && !p.proSe;
}

/** The "Counsel of Record" bubble under a party. Click → expands downward. */
export function CounselBubble({ party, open, onToggle }: { party: CaseParty; open: boolean; onToggle: () => void }) {
  const missing = needsCounsel(party);
  const n = party.cc?.length ?? 0;
  const summary = party.proSe
    ? "Pro se"
    : party.attorney?.name
      ? `${party.attorney.name}${party.attorney.firm ? `, ${party.attorney.firm}` : ""}`
      : "Not entered yet";
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        missing
          ? "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : open
            ? "border-[var(--c-accent)] bg-[var(--c-accent)]/10 text-[var(--c-accent)]"
            : "border-[var(--c-border)] text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
      }`}
    >
      <Scale size={11} className="shrink-0" />
      <span className="shrink-0 font-semibold">Counsel of Record</span>
      <span className="min-w-0 truncate">· {summary}{n ? ` · +${n} cc` : ""}</span>
      {party.ours && <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">our client</span>}
      <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

/** The expanded panel: counsel of record, our-client toggle, and CC people. */
export function CounselPanel({ caseId, index, party, allParties, prompt, onClose }: {
  caseId: number; index: number; party: CaseParty; allParties: CaseParty[];
  /** Shown when the panel opened itself right after the party was added. */
  prompt?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ours, setOurs] = useState(!!party.ours);
  const [proSe, setProSe] = useState(!!party.proSe);
  const [c, setC] = useState<Counsel>({
    name: party.attorney?.name ?? "", firm: party.attorney?.firm ?? "", email: party.attorney?.email ?? "",
    phone: party.attorney?.phone ?? "", address: party.attorney?.address ?? "",
  });
  const [cc, setCc] = useState<CcRow[]>(
    (party.cc ?? []).map((x) => ({ name: x.name, role: x.role, firm: x.firm ?? "", email: x.email ?? "", phone: x.phone ?? "" })),
  );
  const [same, setSame] = useState<{ attorney: PartyAttorney; fromParty: string } | null>(null);
  const [team, setTeam] = useState<PersonHit[]>([]);

  useEffect(() => {
    if (!ours) return;
    let live = true;
    listFirmPeople().then((t) => { if (live) setTeam(t); }).catch(() => {});
    return () => { live = false; };
  }, [ours]);

  // Counsel already on this case (same lawyer for co-parties is common).
  const caseCounsel = allParties
    .filter((p, i) => i !== index && p.attorney?.name)
    .map((p) => ({ attorney: p.attorney!, fromParty: p.name }));

  function pickCounsel(h: PersonHit) {
    setC((prev) => ({
      name: h.name, firm: h.firm || prev.firm, email: h.email || prev.email,
      phone: h.phone || prev.phone, address: h.address || prev.address,
    }));
  }

  function addTeam(h: PersonHit) {
    if (!c.name.trim()) { pickCounsel(h); return; }
    if (cc.some((r) => r.email && r.email.toLowerCase() === h.email.toLowerCase())) return;
    // Firm accounts don't say whether they're a lawyer or staff — ask.
    setCc((rows) => [...rows, { name: h.name, role: "", firm: h.firm, email: h.email, phone: h.phone }]);
  }

  function save() {
    setError(null);
    const blank = cc.find((r) => (r.name.trim() || r.email.trim()) && !r.role);
    if (blank) { setError(`Pick a category for ${blank.name || blank.email} so it files correctly in Contacts.`); return; }
    start(async () => {
      const r = await updateCasePartyCounsel(caseId, index, {
        ours, proSe: !ours && proSe,
        attorney: !proSe && c.name.trim() ? c : undefined,
        cc,
      });
      if (r.ok) { onClose(); router.refresh(); }
      else setError(r.error ?? "Couldn't save.");
    });
  }

  const onTeam = new Set([c.email.toLowerCase(), ...cc.map((r) => r.email.toLowerCase())].filter(Boolean));

  return (
    <div className="mb-2 mt-1 space-y-4 rounded-md border border-[var(--c-accent)]/40 bg-[var(--c-bg)] p-3 sm:p-4">
      {prompt && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <strong>{party.name}</strong> was added. Who is their counsel of record, and who else should be copied on letters?
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={ours} onChange={(e) => { setOurs(e.target.checked); if (e.target.checked) setProSe(false); }} className="accent-[var(--c-accent)]" />
          Our client (our side)
        </label>
        {!ours && (
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={proSe} onChange={(e) => setProSe(e.target.checked)} className="accent-[var(--c-accent)]" />
            Unrepresented (pro se)
          </label>
        )}
      </div>

      {ours && team.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--c-ink-muted)]">Our team — click to add {c.name.trim() ? "as a CC" : "as counsel of record"}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {team.filter((t) => !onTeam.has(t.email.toLowerCase())).map((t) => (
              <button key={t.email} onClick={() => addTeam(t)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] px-2.5 py-1 text-xs hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]">
                <UserPlus size={11} /> {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!proSe && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--c-accent)]">Counsel of record</h4>
          <div className="mt-2">
            <PersonInput
              value={c.name}
              placeholder="Attorney name — start typing to search Contacts"
              ours={ours}
              kinds={["attorney"]}
              extra={caseCounsel
                .filter((x) => x.attorney.name.toLowerCase().includes(c.name.trim().toLowerCase()))
                .map((x) => ({ label: x.attorney.name, sub: `represents ${x.fromParty} in this case`, onPick: () => { setC((p) => ({ ...p, name: x.attorney.name })); setSame(x); } }))}
              onChange={(v) => { setC((p) => ({ ...p, name: v })); setSame(null); }}
              onPick={pickCounsel}
            />
          </div>
          {same && (
            <div className="mt-2 rounded-md border border-[var(--c-accent)]/50 bg-[var(--c-accent)]/10 p-3 text-sm">
              <p>Same contact information as <strong>{same.fromParty}</strong>&apos;s attorney?</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => { const a = same.attorney; setC({ name: a.name, firm: a.firm ?? "", email: a.email ?? "", phone: a.phone ?? "", address: a.address ?? "" }); setSame(null); }} className="btn btn-accent text-xs py-1.5 px-3">Yes — copy it</button>
                <button onClick={() => setSame(null)} className="btn btn-outline text-xs py-1.5 px-3">No — just the name</button>
              </div>
            </div>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={c.firm} onChange={(e) => setC({ ...c, firm: e.target.value })} placeholder="Firm" className={input} />
            <input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="Phone" className={input} />
            <input value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} placeholder="Email" className={`${input} sm:col-span-2`} />
            <input value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} placeholder="Address" className={`${input} sm:col-span-2`} />
          </div>
        </section>
      )}

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--c-accent)]">CC on letters &amp; emails</h4>
        <p className="mt-0.5 text-xs text-[var(--c-ink-muted)]">Other attorneys, legal assistants, paralegals, anyone else. Every letter on this case copies them.</p>
        <div className="mt-2 space-y-2">
          {cc.map((r, i) => (
            <div key={i} className="rounded-md border border-[var(--c-border)] p-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <PersonInput
                    value={r.name}
                    placeholder="Name — start typing to search"
                    ours={ours}
                    onChange={(v) => setCc((rows) => rows.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                    onPick={(h) => setCc((rows) => rows.map((x, j) => (j === i ? {
                      name: h.name, role: x.role || KIND_TO_ROLE[h.kind] || "", firm: h.firm || x.firm, email: h.email || x.email, phone: h.phone || x.phone,
                    } : x)))}
                  />
                </div>
                <button onClick={() => setCc((rows) => rows.filter((_, j) => j !== i))} className="shrink-0 rounded p-1.5 text-[var(--c-ink-muted)] hover:text-red-600" title="Remove" aria-label="Remove CC person"><X size={15} /></button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select value={r.role} onChange={(e) => setCc((rows) => rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                  className={`${input} ${r.role ? "" : "border-amber-500/70 text-amber-800 dark:text-amber-300"}`} aria-label="Category">
                  <option value="">Category — how should Contacts file them?</option>
                  {CC_ROLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <input value={r.firm} onChange={(e) => setCc((rows) => rows.map((x, j) => (j === i ? { ...x, firm: e.target.value } : x)))} placeholder="Firm / company" className={input} />
                <input value={r.email} onChange={(e) => setCc((rows) => rows.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email" className={input} />
                <input value={r.phone} onChange={(e) => setCc((rows) => rows.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Phone" className={input} />
              </div>
            </div>
          ))}
          <button onClick={() => setCc((rows) => [...rows, { name: "", role: "", firm: ours ? "" : c.firm, email: "", phone: "" }])}
            className="inline-flex items-center gap-1 text-sm text-[var(--c-accent)] hover:underline">
            <Plus size={14} /> Add CC person
          </button>
        </div>
      </section>

      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-[var(--c-ink-muted)]">Everyone here is saved to Contacts.</span>
        <button onClick={onClose} disabled={pending} className="btn btn-outline text-sm py-2 px-4">{prompt ? "Later" : "Cancel"}</button>
        <button onClick={save} disabled={pending} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-60">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save counsel &amp; CC
        </button>
      </div>
    </div>
  );
}

/** Name field with a type-ahead over the firm's people and the contact book. */
function PersonInput({ value, placeholder, ours, kinds, extra = [], onChange, onPick }: {
  value: string; placeholder: string; ours: boolean; kinds?: string[];
  extra?: { label: string; sub: string; onPick: () => void }[];
  onChange: (v: string) => void;
  onPick: (h: PersonHit) => void;
}) {
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [show, setShow] = useState(false);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("mousedown", onDown); if (timer.current) clearTimeout(timer.current); };
  }, []);

  function type(v: string) {
    onChange(v);
    const mine = ++seq.current;
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); setShow(false); return; }
    setShow(true);
    timer.current = setTimeout(async () => {
      const r = await searchPeople(v, { ours, kinds }).catch(() => []);
      if (mine === seq.current) setHits(r);
    }, 250);
  }

  const q = value.trim().toLowerCase();
  const ex = q.length >= 2 ? extra : [];
  const seen = new Set(ex.map((e) => e.label.toLowerCase()));
  const list = hits.filter((h) => !seen.has(h.name.toLowerCase()));

  return (
    <div ref={box} className="relative">
      <input value={value} onChange={(e) => type(e.target.value)} onFocus={() => q.length >= 2 && setShow(true)} placeholder={placeholder} className={input} />
      {show && (ex.length > 0 || list.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
          {ex.map((e, i) => (
            <button key={`x-${i}`} onClick={() => { setShow(false); e.onPick(); }} className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--c-accent)]/10">
              <span className="font-medium">{e.label}</span><span className="truncate text-xs text-[var(--c-ink-muted)]">{e.sub}</span>
            </button>
          ))}
          {list.map((h, i) => (
            <button key={`h-${i}`} onClick={() => { setShow(false); onPick(h); }} className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--c-accent)]/10">
              <span className="font-medium">{h.name}</span>
              <span className="truncate text-xs text-[var(--c-ink-muted)]">
                {h.source === "firm" ? "our firm" : [roleLabelForKind(h.kind), h.firm, h.side === "ours" ? "our side" : h.side === "opposing" ? "opposing" : ""].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function roleLabelForKind(kind: string) {
  if (kind === "staff") return "Legal assistant / staff";
  if (kind === "opposing-party") return "Opposing party";
  if (kind.startsWith("client")) return "Client";
  return KIND_TO_ROLE[kind] ? roleLabel(KIND_TO_ROLE[kind]) : "";
}
