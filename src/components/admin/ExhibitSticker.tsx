"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Tag, X } from "lucide-react";
import { loadPdfjs } from "./pdf-loader";
import { applySticker, setDocSticker, setStickerDefaults, stickerBacklog } from "@/app/admin/(panel)/exhibit-reviewer/actions";
import {
  PARTIES, STICKER_COLORS, STICKER_W, STICKER_H, defaultPosition, normalizeDefaults, stickerSpec, wrapTitle,
  type DocSticker, type PartyKey, type StickerColor, type StickerDefaults, type StickerSpec,
} from "@/lib/exhibit-review/stickers";

export type StickerDocLite = { id: number; side: string; label: string; number: number | null; sticker: DocSticker; stickerApplied: boolean; isVideo: boolean; hasFile: boolean; fileTag: string };

/** The sticker as it will print, drawn with plain CSS for the preview. */
export function StickerFace({ spec, widthPx }: { spec: StickerSpec; widthPx: number }) {
  const k = widthPx / STICKER_W; // px per point
  const lines = wrapTitle(spec.title, 22);
  const titlePx = Math.max(6, 7 * k * Math.min(1, 22 / Math.max(...lines.map((l) => l.length), 1)));
  return (
    <div style={{ width: widthPx, height: STICKER_H * k, background: spec.hex, border: `${Math.max(1, 0.8 * k)}px solid #1a1a1a`, borderRadius: 4 * k, color: "#000", fontFamily: "Helvetica, Arial, sans-serif", padding: 5 * k, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", textAlign: "center", lineHeight: 1.15, userSelect: "none" }}>
      <div style={{ fontWeight: 700, fontSize: titlePx }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
      <div style={{ fontWeight: 700, fontSize: Math.max(10, 17 * k), lineHeight: 1 }}>{spec.number}</div>
      <div style={{ fontSize: Math.max(5, 5.5 * k), minHeight: spec.caseLine ? undefined : 0, whiteSpace: "nowrap", overflow: "hidden", maxWidth: "100%" }}>{spec.caseLine}</div>
    </div>
  );
}

/**
 * Sticker dialog for one exhibit: page 1 is rendered on the left with the
 * sticker on top of it — drag it where it belongs. Settings on the right
 * choose the party wording and color, deposition styling, the number and the
 * cause line. "Apply" bakes it into the exhibit's PDF; "Apply to all" does
 * every exhibit in the set that needs it, using each one's own settings.
 */
export function StickerDialog({ setId, doc, docs, defaults: defaultsIn, causeNumber, onClose }: {
  setId: number; doc: StickerDocLite; docs: StickerDocLite[]; defaults: StickerDefaults; causeNumber: string; onClose: () => void;
}) {
  const router = useRouter();
  const [defaults, setDefaults] = useState<StickerDefaults>(() => normalizeDefaults(defaultsIn));
  const [ov, setOv] = useState<DocSticker>(doc.sticker);
  const [page, setPage] = useState<{ url: string; w: number; h: number; ptW: number; ptH: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [all, setAll] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const spec = useMemo(() => stickerSpec(defaults, { side: doc.side, label: doc.label, number: doc.number, sticker: ov }, causeNumber), [defaults, doc, ov, causeNumber]);
  const party = PARTIES.find((p) => p.key === (ov.party ?? defaults.party[doc.side] ?? "plaintiff")) ?? PARTIES[0];

  // Render page 1 of the ORIGINAL (unstamped) file to an image.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url: `/admin/exhibit-reviewer/${setId}/doc/${doc.id}?orig=1&v=${doc.fileTag}`, withCredentials: true });
        const pdf = await task.promise;
        const p1 = await pdf.getPage(1);
        const base = p1.getViewport({ scale: 1 });
        const scale = Math.min(2, 1100 / base.width);
        const vp = p1.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        await p1.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
        if (!cancelled) setPage({ url: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height, ptW: base.width, ptH: base.height });
        void task.destroy();
      } catch (err) {
        if (!cancelled) setMsg({ kind: "err", text: `Couldn't render page 1 (${(err as Error).message}). You can still set the sticker and apply it.` });
      }
    })();
    return () => { cancelled = true; };
  }, [setId, doc.id, doc.fileTag]);

  // Geometry of the preview box (page scaled to fit).
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el); setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const ptW = page?.ptW ?? 612, ptH = page?.ptH ?? 792;
  const pxPerPt = boxW > 0 ? boxW / ptW : 1;
  const pageHpx = ptH * pxPerPt;
  const stW = STICKER_W * spec.scale * pxPerPt, stH = STICKER_H * spec.scale * pxPerPt;
  const left = Math.min(Math.max(0, spec.x * boxW), boxW - stW);
  const top = Math.min(Math.max(0, spec.y * pageHpx), pageHpx - stH);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left - left, dy: e.clientY - r.top - top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current, el = boxRef.current; if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.min(Math.max(0, e.clientX - r.left - d.dx), boxW - stW);
    const ny = Math.min(Math.max(0, e.clientY - r.top - d.dy), pageHpx - stH);
    setOv((o) => ({ ...o, x: nx / boxW, y: ny / pageHpx }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const corner = (c: "tl" | "tr" | "bl" | "br") => {
    const w = STICKER_W * spec.scale, h = STICKER_H * spec.scale, inset = 20;
    const x = c === "tl" || c === "bl" ? inset / ptW : (ptW - w - inset) / ptW;
    const y = c === "tl" || c === "tr" ? inset / ptH : (ptH - h - inset) / ptH;
    setOv((o) => ({ ...o, x, y }));
  };

  const saveDoc = useCallback(async (next: DocSticker) => { const r = await setDocSticker(doc.id, next); if (!r.ok) throw new Error(r.error); }, [doc.id]);

  const applyOne = async () => {
    setBusy("one"); setMsg(null);
    try {
      await saveDoc(ov);
      const r = await applySticker(doc.id);
      if (!r.ok) setMsg({ kind: "err", text: r.error });
      else setMsg({ kind: "ok", text: r.status === "applied" ? "Sticker applied to this exhibit." : r.status === "hidden" ? "Sticker removed from this exhibit." : r.status === "unchanged" ? "Already up to date." : "Skipped (video)." });
      router.refresh();
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    setBusy(null);
  };

  const saveAsDefault = async () => {
    setBusy("default"); setMsg(null);
    const next: Partial<StickerDefaults> = {
      party: { ...defaults.party, [doc.side]: ov.party ?? defaults.party[doc.side] },
      deposition: ov.deposition ?? defaults.deposition,
      x: ov.x ?? defaults.x, y: ov.y ?? defaults.y, scale: ov.scale ?? defaults.scale,
      showCause: defaults.showCause, caseLine: defaults.caseLine, enabled: true,
    };
    const r = await setStickerDefaults(setId, next);
    if (r.ok) {
      setDefaults(r.defaults);
      // This exhibit now follows the defaults; drop its overrides for those fields.
      const { party: _p, deposition: _d, x: _x, y: _y, scale: _s, ...rest } = ov; void _p; void _d; void _x; void _y; void _s;
      setOv(rest); await saveDoc(rest).catch(() => {});
      setMsg({ kind: "ok", text: `Saved as the default for every ${doc.side} exhibit in this set. Use "Apply to all" to stamp them.` });
    } else setMsg({ kind: "err", text: r.error });
    setBusy(null);
  };

  const applyAll = async () => {
    setBusy("all"); setMsg(null);
    try {
      await saveDoc(ov);
      const ids = await stickerBacklog(setId);
      setAll({ done: 0, total: ids.length, failed: [] });
      const failed: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        const r = await applySticker(ids[i]).catch((e: Error) => ({ ok: false as const, error: e.message }));
        if (!r.ok) failed.push(`${docs.find((d) => d.id === ids[i])?.label || `#${ids[i]}`}: ${r.error}`);
        setAll({ done: i + 1, total: ids.length, failed: [...failed] });
      }
      setMsg({ kind: failed.length ? "err" : "ok", text: ids.length === 0 ? "Every exhibit already has its sticker." : failed.length ? `${ids.length - failed.length} of ${ids.length} stamped; ${failed.length} failed.` : `All ${ids.length} exhibits stamped.` });
      router.refresh();
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    setBusy(null);
  };

  const sel = "w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--c-accent)]";
  const needs = docs.filter((d) => d.hasFile && !d.isVideo && !d.stickerApplied).length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)]" role="dialog" aria-label="Exhibit sticker" data-testid="sticker-dialog">
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-2.5">
          <Tag size={16} />
          <h3 className="font-[family-name:var(--font-display)] text-lg">Exhibit sticker — {doc.label || `#${doc.id}`}</h3>
          <span className="text-xs text-[var(--c-ink-muted)]">Drag the sticker to where it belongs on page 1. It is stamped into the PDF everyone receives.</span>
          <button onClick={onClose} disabled={!!busy} className="ml-auto text-[var(--c-ink-muted)]" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-[1fr_320px]">
          {/* Page 1 with the movable sticker */}
          <div className="min-w-0">
            {/* Width capped so the whole page (and a bottom-corner sticker) fits in view without scrolling. */}
            <div ref={boxRef} className="relative mx-auto w-full overflow-hidden rounded border border-[var(--c-border)] bg-white shadow-inner" style={{ height: pageHpx || 400, maxWidth: `min(720px, calc((95vh - 200px) * ${(ptW / ptH).toFixed(4)}))` }}>
              {page ? <img src={page.url} alt="Page 1" draggable={false} className="absolute inset-0 h-full w-full select-none" /> : <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--c-ink-muted)]"><Loader2 size={16} className="mr-2 animate-spin" /> Rendering page 1…</div>}
              {!spec.hidden && boxW > 0 && (
                <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                  className="absolute cursor-move touch-none shadow-md" style={{ left, top }} title="Drag to move" data-testid="sticker-drag">
                  <StickerFace spec={spec} widthPx={stW} />
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--c-ink-muted)]">
              <span>Snap to corner:</span>
              {(["tl", "tr", "bl", "br"] as const).map((c) => <button key={c} onClick={() => corner(c)} className="rounded border border-[var(--c-border)] px-2 py-0.5 hover:bg-[var(--c-surface2)]">{{ tl: "top left", tr: "top right", bl: "bottom left", br: "bottom right" }[c]}</button>)}
              <button onClick={() => { const { x: _x, y: _y, scale: _s, ...rest } = ov; void _x; void _y; void _s; setOv(rest); }} className="inline-flex items-center gap-1 rounded border border-[var(--c-border)] px-2 py-0.5 hover:bg-[var(--c-surface2)]"><RotateCcw size={11} /> Set default position</button>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-3 text-sm">
            <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Party (this exhibit)</span>
              <select value={party.key} onChange={(e) => setOv({ ...ov, party: e.target.value as PartyKey, color: undefined })} className={sel}>
                {PARTIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            {party.key === "custom" && (
              <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Wording</span>
                <input value={ov.customText ?? ""} onChange={(e) => setOv({ ...ov, customText: e.target.value })} placeholder="e.g. DEMONSTRATIVE EXHIBIT" className={sel} />
              </label>
            )}
            {party.key !== "deposition" && party.key !== "custom" && (
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={ov.deposition ?? defaults.deposition} onChange={(e) => setOv({ ...ov, deposition: e.target.checked })} /> Deposition exhibit (reads "{party.owner} DEPOSITION EXHIBIT", red)</label>
            )}
            <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Color</span>
              <select value={ov.color ?? ""} onChange={(e) => setOv({ ...ov, color: (e.target.value || undefined) as StickerColor | undefined })} className={sel}>
                <option value="">Standard for this party ({STICKER_COLORS[(ov.deposition ?? defaults.deposition) && party.key !== "custom" ? "red" : party.color].label.toLowerCase()})</option>
                {(Object.keys(STICKER_COLORS) as StickerColor[]).map((c) => <option key={c} value={c}>{STICKER_COLORS[c].label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Number shown</span>
                <input value={ov.numberText ?? spec.number} onChange={(e) => setOv({ ...ov, numberText: e.target.value || undefined })} className={sel} />
              </label>
              <label className="block text-xs"><span className="mb-1 block text-[var(--c-ink-muted)]">Size</span>
                <input type="range" min={0.6} max={1.8} step={0.05} value={spec.scale} onChange={(e) => setOv({ ...ov, scale: Number(e.target.value) })} className="w-full" />
                <span className="text-[11px] text-[var(--c-ink-muted)]">{(STICKER_W * spec.scale / 72).toFixed(2)}″ × {(STICKER_H * spec.scale / 72).toFixed(2)}″</span>
              </label>
            </div>
            <div className="rounded-md border border-[var(--c-border)] p-2">
              <p className="mb-1 text-[11px] font-semibold text-[var(--c-ink-muted)]">Whole set</p>
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={defaults.showCause} onChange={(e) => setDefaults({ ...defaults, showCause: e.target.checked })} /> Show the cause number on the sticker</label>
              <input value={defaults.caseLine} onChange={(e) => setDefaults({ ...defaults, caseLine: e.target.value })} placeholder={causeNumber || "Cause number"} className={`${sel} mt-1`} disabled={!defaults.showCause} />
              <button onClick={() => void saveAsDefault()} disabled={!!busy} className="btn btn-outline mt-2 w-full py-1.5 text-xs disabled:opacity-50">{busy === "default" ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : null} Save position, size and party as the default for {doc.side} exhibits</button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={!!ov.hidden} onChange={(e) => setOv({ ...ov, hidden: e.target.checked || undefined })} /> No sticker on this exhibit</label>

            {msg && <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{msg.kind === "ok" && <Check size={12} className="mr-1 inline" />}{msg.text}</p>}
            {all && all.total > 0 && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--c-border)]"><div className="h-full rounded-full bg-[var(--c-accent)] transition-[width]" style={{ width: `${Math.round((all.done / all.total) * 100)}%` }} /></div>
                <p className="mt-1 text-[11px] text-[var(--c-ink-muted)]">{all.done} of {all.total} stamped{all.failed.length ? ` · ${all.failed.length} failed` : ""}</p>
                {all.failed.length > 0 && <ul className="mt-1 max-h-24 overflow-auto text-[11px] text-red-700 dark:text-red-300">{all.failed.map((f) => <li key={f}>{f}</li>)}</ul>}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button onClick={() => void applyOne()} disabled={!!busy || !doc.hasFile || doc.isVideo} className="btn btn-accent inline-flex items-center justify-center gap-1.5 py-2 text-sm disabled:opacity-50" data-testid="sticker-apply">
                {busy === "one" ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />} {ov.hidden ? "Remove sticker from this exhibit" : doc.stickerApplied ? "Re-apply to this exhibit" : "Apply to this exhibit"}
              </button>
              <button onClick={() => void applyAll()} disabled={!!busy} className="btn btn-outline inline-flex items-center justify-center gap-1.5 py-2 text-sm disabled:opacity-50" data-testid="sticker-apply-all" title="Stamps every exhibit in the set that has no sticker yet or whose sticker settings changed; each keeps its own party and position">
                {busy === "all" ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />} Apply to all exhibits in this set{needs > 0 ? ` (${needs} waiting)` : ""}
              </button>
              <p className="text-[11px] text-[var(--c-ink-muted)]">Stickers are stamped on page 1 of the PDF. Every viewer, share link, ZIP, exhibit book and print copy carries them. The original upload is kept, so a sticker can be moved or removed any time.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
