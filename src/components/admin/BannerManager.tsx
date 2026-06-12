"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import {
  addBannerItem,
  deleteBannerItem,
  toggleBannerItem,
  reorderBannerItem,
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
  const [form, setForm] = useState({
    kind: "image" as "image" | "video",
    url: "",
    durationMs: 6500,
    kenBurns: true,
    direction: "in",
    intensity: 1,
  });

  function add() {
    startTransition(async () => {
      const res = await addBannerItem({ ...form, alt: "" });
      if (res.ok) {
        setForm((f) => ({ ...f, url: "" }));
        setAdding(false);
      }
    });
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-[var(--c-ink-muted)] mb-5">
        The home hero plays these in order with crossfades. Stills support Ken Burns motion;
        videos autoplay muted and loop. Keep clips under ~20MB, 10–20 seconds. Upload media in the{" "}
        Media tab first, then paste its URL here.
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
        {items.map((it, i) => (
          <Row key={it.id} item={it} first={i === 0} last={i === items.length - 1} />
        ))}
        {items.length === 0 && (
          <p className="text-sm text-[var(--c-ink-muted)] py-6">
            No banner items yet — the home hero shows labeled placeholder blocks until you add media.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ item, first, last }: { item: BannerRow; first: boolean; last: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => startTransition(() => { void fn(); });
  return (
    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3 flex items-center gap-4">
      <div className="h-16 w-28 bg-[var(--c-surface2)] rounded overflow-hidden shrink-0 flex items-center justify-center">
        {item.url ? (
          item.kind === "video" ? (
            <video src={item.url} className="h-full w-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="text-xs text-[var(--c-ink-muted)]">{item.kind}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm capitalize">{item.kind} · {item.durationMs}ms</div>
        <div className="text-xs text-[var(--c-ink-muted)] truncate">{item.url}</div>
        {item.kenBurns?.enabled && <div className="text-xs text-[var(--c-ink-muted)]">Ken Burns: {item.kenBurns.direction}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button disabled={first || pending} onClick={() => run(() => reorderBannerItem(item.id, "up"))} className="text-[var(--c-ink-muted)] disabled:opacity-30"><ChevronUp size={16} /></button>
        <button disabled={last || pending} onClick={() => run(() => reorderBannerItem(item.id, "down"))} className="text-[var(--c-ink-muted)] disabled:opacity-30"><ChevronDown size={16} /></button>
        <button onClick={() => run(() => toggleBannerItem(item.id, !item.visible))} disabled={pending} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">{item.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
        <button onClick={() => run(() => deleteBannerItem(item.id))} disabled={pending} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}
