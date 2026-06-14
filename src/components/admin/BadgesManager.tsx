"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import { saveBadge, deleteBadge, toggleBadge, setBadgeOrder, type BadgeInput } from "@/app/admin/(panel)/badges/actions";

type Badge = BadgeInput & { id: number };

export function BadgesManager({ badges, dbEnabled }: { badges: Badge[]; dbEnabled: boolean }) {
  const [list, setList] = useState<Badge[]>(badges);
  const [editing, setEditing] = useState<BadgeInput | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setList(badges), [badges]);
  const run = (fn: () => Promise<unknown>) => startTransition(() => { void fn(); });

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    run(() => setBadgeOrder(next.map((b) => b.id)));
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[var(--c-ink-muted)]">
          PNG logos shown in a slow-scrolling strip below the home hero. Upload a logo for each (use
          &quot;Remove background&quot; for a clean transparent cutout). Badges without a logo are
          hidden on the site.
        </p>
        <button onClick={() => setEditing({ name: "", logo: "", url: "", visible: true })} disabled={!dbEnabled} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50 shrink-0">
          <Plus size={16} /> Add
        </button>
      </div>

      {editing && <BadgeForm initial={editing} onClose={() => setEditing(null)} />}

      <div className="mt-5 rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
        {list.map((b, i) => (
          <div key={b.id} className={`px-4 py-3 bg-[var(--c-surface)] flex items-center gap-4 ${b.visible ? "" : "opacity-60"}`}>
            <div className="h-10 w-20 bg-[var(--c-surface2)] rounded flex items-center justify-center overflow-hidden shrink-0">
              {b.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logo} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[10px] text-[var(--c-ink-muted)]">no logo</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{b.name}</div>
              {b.url && <div className="text-xs text-[var(--c-ink-muted)] truncate">{b.url}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="text-[var(--c-ink-muted)] disabled:opacity-30"><ChevronUp size={16} /></button>
              <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="text-[var(--c-ink-muted)] disabled:opacity-30"><ChevronDown size={16} /></button>
              <button onClick={() => setEditing(b)} disabled={!dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-40"><Pencil size={15} /></button>
              <button onClick={() => run(() => toggleBadge(b.id, !b.visible))} disabled={pending || !dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] disabled:opacity-40">{b.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
              <button onClick={() => run(() => deleteBadge(b.id))} disabled={pending || !dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)] disabled:opacity-40"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {!dbEnabled && <p className="mt-4 text-sm text-[var(--c-ink-muted)]">Showing seed data. Connect the database to edit.</p>}
    </div>
  );
}

function BadgeForm({ initial, onClose }: { initial: BadgeInput; onClose: () => void }) {
  const [form, setForm] = useState<BadgeInput>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  function save() {
    startTransition(async () => {
      const res = await saveBadge(form);
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed");
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-ui)] font-semibold">{initial.id ? "Edit badge" : "New badge"}</h3>
        <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., State Bar of Texas" className={cls} />
      </div>
      <ImageUploadField value={form.logo} onChange={(url) => setForm({ ...form, logo: url })} slot="logoHeader" folder="badges" label="Logo / seal (PNG — transparent background looks best)" />
      <div>
        <label className="block text-sm font-medium mb-1.5">Link (optional)</label>
        <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" className={cls} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} className="accent-[var(--c-accent)]" /> Visible
      </label>
      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60"><Check size={15} /> Save</button>
        <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
      </div>
    </div>
  );
}
