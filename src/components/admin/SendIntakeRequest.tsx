"use client";

import { useMemo, useState, useTransition } from "react";
import { Send, X, Check, Loader2, Mail, Search, ChevronDown, ExternalLink } from "lucide-react";
import { sendIntakeRequest, sendQuestionnaire } from "@/app/admin/(panel)/intake/send-actions";
import { ESTATE_DOCS, ESTATE_DOC_GROUPS } from "@/lib/intake/config";
import { CLIENT_QUESTIONNAIRES } from "@/lib/intake/questionnaires";

type BranchOpt = { id: string; label: string };

const Q_GROUP = "Questionnaires — fill out & return";

/** Everything the estate/forms dialog can send, in one searchable list. */
type FormItem = { id: string; label: string; group: string; kind: "doc" | "questionnaire"; blurb?: string; path?: string };
const FORM_ITEMS: FormItem[] = [
  ...CLIENT_QUESTIONNAIRES.map((q) => ({ id: `q:${q.id}`, label: q.label, group: Q_GROUP, kind: "questionnaire" as const, blurb: `~${q.minutes} min · runs in their browser, they print or export the answers back to you`, path: q.path })),
  ...ESTATE_DOCS.map((d) => ({ id: `d:${d.id}`, label: d.label, group: d.group, kind: "doc" as const })),
];
const FORM_GROUPS = [Q_GROUP, ...ESTATE_DOC_GROUPS];

/**
 * Controlled dialog to email someone the right forms.
 *  - kind "branch": pick a practice-area intake (top-of-page button).
 *  - kind "estate": one searchable, grouped list — client questionnaires
 *    (fill-out-and-return) plus the estate-planning documents. Check any mix;
 *    estate docs go out as one intake link, each questionnaire as its own
 *    branded email.
 */
export function SendIntakeDialog({
  onClose,
  kind = "branch",
  branches = [],
  presetName = "",
  presetEmail = "",
}: {
  onClose: () => void;
  kind?: "branch" | "estate";
  branches?: BranchOpt[];
  presetName?: string;
  presetEmail?: string;
}) {
  const [name, setName] = useState(presetName);
  const [email, setEmail] = useState(presetEmail);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>([Q_GROUP]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const isEstate = kind === "estate";
  const input =
    "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm text-[var(--c-ink)] outline-none focus:border-[var(--c-accent)]";

  const searching = query.trim().length > 0;
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return FORM_ITEMS;
    return FORM_ITEMS.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(needle));
  }, [query]);

  function toggle(id: string, on: boolean) {
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  }
  const toggleGroup = (g: string) => setOpenGroups((o) => (o.includes(g) ? o.filter((x) => x !== g) : [...o, g]));

  function submit() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (selected.length === 0) {
      setError(isEstate ? "Check at least one form to send." : "Choose at least one intake to send.");
      return;
    }
    start(async () => {
      if (!isEstate) {
        const res = await sendIntakeRequest({ name, email, branchIds: selected, note });
        if (res.ok) setSent("Intake request sent.");
        else setError(res.error ?? "Something went wrong.");
        return;
      }
      const docIds = selected.filter((s) => s.startsWith("d:")).map((s) => s.slice(2));
      const questIds = selected.filter((s) => s.startsWith("q:")).map((s) => s.slice(2));
      const doneBits: string[] = [];
      if (docIds.length) {
        const res = await sendIntakeRequest({ name, email, estateDocs: docIds, note });
        if (!res.ok) { setError(res.error ?? "Couldn't send the estate intake."); return; }
        doneBits.push(`the estate-planning intake (${docIds.length} document${docIds.length === 1 ? "" : "s"})`);
      }
      for (const id of questIds) {
        const res = await sendQuestionnaire({ name, email, questionnaireId: id, note });
        if (!res.ok) { setError(res.error ?? "Couldn't send the questionnaire."); return; }
      }
      if (questIds.length) doneBits.push(`${questIds.length} questionnaire${questIds.length === 1 ? "" : "s"}`);
      setSent(`Sent ${doneBits.join(" and ")}.`);
    });
  }

  const groupCount = (g: string) => selected.filter((id) => FORM_ITEMS.some((i) => i.id === id && i.group === g)).length;

  const itemRow = (i: FormItem) => {
    const checked = selected.includes(i.id);
    return (
      <label key={i.id} className={`flex cursor-pointer items-start gap-3 rounded px-2 py-2 text-sm hover:bg-[var(--c-surface2)] ${checked ? "bg-[var(--c-accent)]/5" : ""}`}>
        <input type="checkbox" className="mt-0.5 accent-[var(--c-accent)]" checked={checked} onChange={(e) => toggle(i.id, e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[var(--c-ink)]">{i.label}</span>
          {i.blurb && <span className="block text-[11px] text-[var(--c-ink-muted)]">{i.blurb}</span>}
        </span>
        {i.path && (
          <a href={i.path} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Preview this form" className="shrink-0 pt-0.5 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]">
            <ExternalLink size={14} />
          </a>
        )}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-[8vh]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--c-dark-bg)]/55 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--c-ink)]">
            {isEstate ? "Send forms to this client" : "Send an intake request"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)]">
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--c-success)] text-white">
              <Check size={28} />
            </div>
            <p className="mt-4 font-medium text-[var(--c-ink)]">{sent}</p>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">Delivered to {email} with the firm&apos;s branded email.</p>
            <div className="mt-6 flex justify-center">
              <button onClick={onClose} className="btn btn-accent text-sm py-2 px-4">Done</button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <p className="text-sm text-[var(--c-ink-muted)]">
              {isEstate
                ? "Check anything this client needs — questionnaires they fill out and return, or estate-planning documents (sent as one intake link with those pre-selected)."
                : "Email this person a branded link to the right intake — e.g. if they filled out the wrong one, send them the correct practice area to complete."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Recipient name (optional)</label>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Recipient email</label>
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
              </div>
            </div>

            {isEstate ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-medium text-[var(--c-ink-muted)]">What should they get?</label>
                  {selected.length > 0 && <span className="text-[11px] font-semibold text-[var(--c-accent)]">{selected.length} selected</span>}
                </div>
                <div className="relative mb-2">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search forms — will, trust, affidavit…" className={`${input} pl-8`} />
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-[var(--c-border)] p-2">
                  {searching ? (
                    matches.length ? matches.map(itemRow) : <p className="px-2 py-4 text-center text-xs text-[var(--c-ink-muted)]">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
                  ) : (
                    FORM_GROUPS.map((g) => {
                      const open = openGroups.includes(g);
                      const n = groupCount(g);
                      return (
                        <div key={g}>
                          <button type="button" onClick={() => toggleGroup(g)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-[var(--c-surface2)]">
                            <ChevronDown size={14} className={`shrink-0 text-[var(--c-ink-muted)] transition-transform ${open ? "" : "-rotate-90"}`} />
                            <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--c-accent)]">{g}</span>
                            {n > 0 && <span className="rounded-full bg-[var(--c-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">{n}</span>}
                          </button>
                          {open && <div className="mb-1 space-y-0.5 pl-4">{FORM_ITEMS.filter((i) => i.group === g).map(itemRow)}</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--c-ink-muted)]">Which intake should they fill out?</label>
                <div className="max-h-52 overflow-y-auto rounded-md border border-[var(--c-border)] divide-y divide-[var(--c-border)]">
                  {branches.map((b) => {
                    const checked = selected.includes(b.id);
                    return (
                      <label key={b.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-[var(--c-surface2)]">
                        <input type="checkbox" className="accent-[var(--c-accent)]" checked={checked} onChange={(e) => toggle(b.id, e.target.checked)} />
                        <span className="text-[var(--c-ink)]">{b.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--c-ink-muted)]">Personal note (optional)</label>
              <textarea className={input} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short message that appears above the button in the email." />
            </div>

            {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-[var(--c-border)] px-4 py-2 text-sm hover:bg-[var(--c-surface2)]">Cancel</button>
              <button onClick={submit} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {pending ? "Sending…" : `Send${selected.length ? ` (${selected.length})` : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Header button — opens the dialog with no preset recipient. */
export function SendIntakeRequest({ branches }: { branches: BranchOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-accent text-sm py-2 px-4">
        <Send size={15} /> Send intake request
      </button>
      {open && <SendIntakeDialog onClose={() => setOpen(false)} branches={branches} />}
    </>
  );
}
