"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import {
  addBannerItem,
  deleteBannerItem,
  toggleBannerItem,
  reorderBannerItem,
  setBannerOrder,
} from "@/app/admin/(panel)/banner/actions";
import { ImageUploadField } from "./ImageUploadField";

export type BannerRow = {
  id: number;
  kind: string;
  url: string | null;
  alt: string | null;
  durationMs: number;
  kenBurns: { enabled: boolean; direction: string; intensity: number } | null;
  visible: boolean;
  sort: number;
};

export function BannerManager({ items, dbEnabled }: { items: BannerRow[]; dbEnabled: boolean }) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [list, setList] = useState<BannerRow[]>(items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [form, setForm] = useState({
    kind: "image" as "image" | "video",
    url: "",
    durationMs: 6500,
    kenBurns: true,
    direction: "in",
    intensity: 1,
  });

  // Keep local order in sync when the server data changes (after add/delete/save).
  useEffect(() => setList(items), [items]);

  function add() {
    startTransition(async () => {
      const res = await addBannerItem({ ...form, alt: "" });
      if (res.ok) {
        setForm((f) => ({ ...f, url: "" }));
        setAdding(false);
      }
    });
  }

  function commitOrder(next: BannerRow[]) {
    setList(next);
    startTransition(() => {
      void setBannerOrder(next.map((i) => i.id));
    });
  }

  function handleDrop(target: number) {
    if (dragIdx === null || dragIdx === target) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...list];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    commitOrder(next);
  }

  const run = (fn: () => Promise<unknown>) => startTransition(() => { void fn(); });

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-[var(--c-ink-muted)] mb-5">
        The home hero plays these top to bottom, with crossfades. <strong>Drag a row by the
        handle</strong> to change the order (the top one plays first). Stills support Ken Burns
        motion; videos autoplay muted and loop.
      </p>

      {!adding ? (
        <button onClick={() => setAdding(true)} disabled={!dbEnabled} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50">
          <Plus size={16} /> Add banner item
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-3">
          <div className="flex gap-2">
            {(["image", "video"] as const).map((k) => (
              <button key={k} onClick={() => setForm((f) => ({ ...f, kind: k }))} className={`text-sm px-3 py-1.5 rounded border capitalize ${form.kind === k ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)]"}`}>{k}</button>
            ))}
          </div>
          <ImageUploadField
            value={form.url}
            onChange={(url) => setForm((f) => ({ ...f, url }))}
            slot="heroBanner"
            accept={form.kind === "video" ? "video/mp4,video/webm" : "image/*"}
            folder="banner"
          />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">Duration (ms)
              <input type="number" value={form.durationMs} onChange={(e) => setForm((f) => ({ ...f, durationMs: Number(e.target.value) }))} className="w-24 border border-[var(--c-border)] bg-[var(--c-bg)] p-1.5" />
            </label>
            {form.kind === "image" && (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.kenBurns} onChange={(e) => setForm((f) => ({ ...f, kenBurns: e.target.checked }))} className="accent-[var(--c-accent)]" /> Ken Burns
                </label>
                <select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))} className="border border-[var(--c-border)] bg-[var(--c-bg)] p-1.5">
                  <option value="in">Zoom in</option>
                  <option value="out">Zoom out</option>
                </select>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={add} disabled={pending || !form.url} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-50">Add</button>
            <button onClick={() => setAdding(false)} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {list.map((it, i) => (
          <div
            key={it.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(i);
            }}
            onDrop={() => handleDrop(i)}
            className={`rounded-lg border bg-[var(--c-surface)] p-3 flex items-center gap-3 transition-colors ${
              overIdx === i && dragIdx !== null ? "border-[var(--c-accent)]" : "border-[var(--c-border)]"
            } ${dragIdx === i ? "opacity-50" : ""} ${it.visible ? "" : "opacity-60"}`}
          >
            {/* Drag handle */}
            <button
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              className="cursor-grab active:cursor-grabbing text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] shrink-0 touch-none"
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              <GripVertical size={18} />
            </button>

            <span className="text-xs font-medium text-[var(--c-ink-muted)] w-5 text-center shrink-0">{i + 1}</span>

            <div className="h-16 w-28 bg-[var(--c-surface2)] rounded overflow-hidden shrink-0 flex items-center justify-center">
              {it.url ? (
                it.kind === "video" ? (
                  <video src={it.url} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <span className="text-xs text-[var(--c-ink-muted)]">{it.kind}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm capitalize">{it.kind} · {it.durationMs}ms</div>
              <div className="text-xs text-[var(--c-ink-muted)] truncate">{it.url}</div>
              {it.kenBurns?.enabled && <div className="text-xs text-[var(--c-ink-muted)]">Ken Burns: {it.kenBurns.direction}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button disabled={i === 0 || pending} onClick={() => run(() => reorderBannerItem(it.id, "up"))} className="text-[var(--c-ink-muted)] disabled:opacity-30" title="Move up"><ChevronUp size={16} /></button>
              <button disabled={i === list.length - 1 || pending} onClick={() => run(() => reorderBannerItem(it.id, "down"))} className="text-[var(--c-ink-muted)] disabled:opacity-30" title="Move down"><ChevronDown size={16} /></button>
              <button onClick={() => run(() => toggleBannerItem(it.id, !it.visible))} disabled={pending} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]" title={it.visible ? "Hide" : "Show"}>{it.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <button onClick={() => run(() => deleteBannerItem(it.id))} disabled={pending} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]" title="Delete"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-[var(--c-ink-muted)] py-6">
            No banner items yet — the home hero shows labeled placeholder blocks until you add media.
          </p>
        )}
      </div>
    </div>
  );
}
