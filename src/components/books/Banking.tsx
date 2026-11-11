"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link2, Undo2 } from "lucide-react";
import { categorizeRow, excludeRow, importStatement, matchRow, undoRow } from "@/app/books/(app)/banking/actions";
import { fmtCents } from "@/lib/books/money";

export type CategoryOption = { id: number; number: string; name: string; type: string; needsClient: boolean };
export type ClientOption = { id: number; name: string; matter: string };
export type ReviewRow = { id: number; date: string; amount: number; description: string; ref: string; suggestId: number | null; matches: { lineId: number; entryId: number; date: string; memo: string }[]; sameCount: number };
export type HandledRow = { id: number; date: string; amount: number; description: string; ref: string; entryId: number | null; category: string };

type Res = { ok: true; message?: string } | { ok: false; error: string };
const input = "rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";

/** Choose a CSV exported from the bank's website. The file is read here and never leaves the firm's own site. */
export function BankImport({ accountId, isCard }: { accountId: number; isCard: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [flip, setFlip] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const onFile = (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    start(async () => {
      try {
        if (file.size > 1_400_000) { setMsg({ ok: false, text: "That file is too large. Export a shorter date range and import it in pieces." }); return; }
        const text = await file.text();
        const r = await importStatement({ accountId, filename: file.name, text, flip });
        setMsg(r.ok ? { ok: true, text: r.message ?? "Imported." } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      } catch { setMsg({ ok: false, text: "That file couldn't be read. Choose the CSV export of the account activity." }); }
      if (ref.current) ref.current.value = "";
    });
  };
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-4" data-testid="bank-import">
      <p className="text-sm font-semibold">Bring in a statement file</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--c-ink-muted)]">On the bank&apos;s website, download the account activity as a CSV (sometimes called &quot;spreadsheet&quot; or &quot;Excel&quot;) and choose it here. Importing the same dates twice is safe: rows already on file are skipped.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={ref} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="bank-file" />
        <button type="button" disabled={pending} onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid="bank-choose"><FileUp size={15} /> {pending ? "Reading…" : "Choose a CSV file"}</button>
        <label className="flex items-center gap-2 text-xs text-[var(--c-ink-muted)]"><input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} data-testid="bank-flip" /> In this file, {isCard ? "charges" : "money going out"} show{isCard ? "" : "s"} as positive numbers</label>
      </div>
      {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="bank-import-msg">{msg.text}</p>}
    </div>
  );
}

function ReviewLine({ row, categories, clients, canEdit, onDone }: { row: ReviewRow; categories: CategoryOption[]; clients: ClientOption[]; canEdit: boolean; onDone: (r: Res) => void }) {
  const [cat, setCat] = useState<number>(row.suggestId ?? 0);
  const [client, setClient] = useState<number>(0);
  const [memo, setMemo] = useState("");
  const [same, setSame] = useState(false);
  const [pending, start] = useTransition();
  const chosen = categories.find((c) => c.id === cat);
  const go = (fn: () => Promise<Res>) => start(async () => onDone(await fn()));
  return (
    <tr className="border-t border-[var(--c-border)] align-top" data-testid={`txn-${row.id}`}>
      <td className="py-2 font-mono text-xs">{row.date}</td>
      <td className="py-2 pr-3">
        <p className="text-sm">{row.description || "(no description)"}{row.ref ? <span className="text-[var(--c-ink-muted)]"> · check {row.ref}</span> : null}</p>
        {row.matches.map((m) => (
          <p key={m.lineId} className="mt-1 text-xs">
            <button type="button" disabled={pending || !canEdit} onClick={() => go(() => matchRow({ txnId: row.id, lineId: m.lineId }))} className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 hover:border-emerald-500 disabled:opacity-50" data-testid={`txn-match-${row.id}`}><Link2 size={11} /> Match to entry #{m.entryId}</button>
            <span className="ml-2 text-[var(--c-ink-muted)]">{m.date} · {m.memo}</span>
          </p>
        ))}
      </td>
      <td className={`py-2 text-right font-mono text-xs ${row.amount < 0 ? "" : "text-emerald-700"}`} data-testid={`txn-amount-${row.id}`}>{fmtCents(row.amount)}</td>
      {canEdit && (
        <td className="py-2 pl-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <select className={`${input} max-w-[15rem]`} value={cat} onChange={(e) => setCat(Number(e.target.value))} aria-label="Account" data-testid={`txn-cat-${row.id}`}>
              <option value={0}>Choose an account…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.name}</option>)}
            </select>
            {chosen?.needsClient && <select className={`${input} max-w-[11rem]`} value={client} onChange={(e) => setClient(Number(e.target.value))} aria-label="Client" data-testid={`txn-client-${row.id}`}><option value={0}>Which client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.matter ? ` — ${c.matter}` : ""}</option>)}</select>}
            <input className={`${input} w-28`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Note" aria-label="Note" />
            <button type="button" disabled={pending || !cat} onClick={() => go(() => categorizeRow({ txnId: row.id, categoryId: cat, memo, clientId: chosen?.needsClient ? client || null : null, applyToSame: same }))} className="rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--c-on-accent)] disabled:opacity-50" data-testid={`txn-post-${row.id}`}>Post</button>
            <button type="button" disabled={pending} onClick={() => go(() => excludeRow({ txnId: row.id, excluded: true }))} className="text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" title="Not the firm's, or a duplicate: leave it out of the books" data-testid={`txn-exclude-${row.id}`}>Set aside</button>
          </div>
          {row.sameCount > 0 && <label className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--c-ink-muted)]"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} data-testid={`txn-same-${row.id}`} /> Also post the {row.sameCount} other row{row.sameCount === 1 ? "" : "s"} with this same description</label>}
          {row.suggestId && row.suggestId === cat && <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">Suggested from the last time this description was posted.</p>}
        </td>
      )}
    </tr>
  );
}

export function TxnReview({ rows, categories, clients, canEdit }: { rows: ReviewRow[]; categories: CategoryOption[]; clients: ClientOption[]; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = (r: Res) => { if (r.ok) { setMsg(r.message ? { ok: true, text: r.message } : null); router.refresh(); } else setMsg({ ok: false, text: r.error }); };
  if (rows.length === 0) return <p className="mt-4 rounded-lg border border-dashed border-[var(--c-border)] p-5 text-sm text-[var(--c-ink-muted)]" data-testid="txn-empty">Nothing waiting. Every imported row has been posted, matched or set aside.</p>;
  return (
    <div className="mt-4">
      {msg && <p className={`mb-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status" data-testid="txn-msg">{msg.text}</p>}
      <table className="w-full text-sm" data-testid="txn-review">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="w-24 pb-1 font-medium">Date</th><th className="pb-1 font-medium">Description</th><th className="w-28 pb-1 text-right font-medium">Amount</th>{canEdit && <th className="pb-1 pl-3 font-medium">Where it goes</th>}</tr></thead>
        <tbody>{rows.map((r) => <ReviewLine key={r.id} row={r} categories={categories} clients={clients} canEdit={canEdit} onDone={done} />)}</tbody>
      </table>
    </div>
  );
}

export function TxnHandled({ rows, kind, canEdit }: { rows: HandledRow[]; kind: "posted" | "excluded"; canEdit: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<Res>) => { setErr(null); start(async () => { const r = await fn(); if (r.ok) router.refresh(); else setErr(r.error); }); };
  if (rows.length === 0) return <p className="mt-4 rounded-lg border border-dashed border-[var(--c-border)] p-5 text-sm text-[var(--c-ink-muted)]">{kind === "posted" ? "Nothing posted yet." : "Nothing set aside."}</p>;
  return (
    <div className="mt-4">
      {err && <p className="mb-2 text-xs text-red-700" role="alert" data-testid="handled-error">{err}</p>}
      <table className="w-full text-sm" data-testid={`txn-${kind}`}>
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-ink-muted)]"><th className="w-24 pb-1 font-medium">Date</th><th className="pb-1 font-medium">Description</th><th className="w-28 pb-1 text-right font-medium">Amount</th>{kind === "posted" && <th className="pb-1 pl-3 font-medium">Posted to</th>}<th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[var(--c-border)]" data-testid={`handled-${r.id}`}>
              <td className="py-1.5 font-mono text-xs">{r.date}</td>
              <td className="py-1.5">{r.description}{r.ref ? <span className="text-[var(--c-ink-muted)]"> · check {r.ref}</span> : null}</td>
              <td className="py-1.5 text-right font-mono text-xs">{fmtCents(r.amount)}</td>
              {kind === "posted" && <td className="py-1.5 pl-3 text-xs">{r.category} <span className="text-[var(--c-ink-muted)]">· entry #{r.entryId}</span></td>}
              <td className="py-1.5 text-right text-xs">{canEdit && <button type="button" disabled={pending} onClick={() => go(() => (kind === "posted" ? undoRow({ txnId: r.id }) : excludeRow({ txnId: r.id, excluded: false })))} className="inline-flex items-center gap-1 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" data-testid={`handled-undo-${r.id}`}><Undo2 size={11} /> Back to review</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
