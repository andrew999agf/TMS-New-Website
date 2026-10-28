"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type HTMLAttributes } from "react";
import { ArrowDownUp } from "lucide-react";
import { ORDER_LABELS, type OrderMode, type ViewOrder, moveKey } from "@/lib/discovery/doc-order";
import { setDiscoveryViewOrder } from "@/app/admin/(panel)/discovery-reviewer/actions";

/**
 * Per-tab document order, saved for the whole firm: a sort menu, plus the
 * drag-to-reorder hook the "By document" layouts use. Dragging switches the
 * tab to "My order" and saves it; picking any other sort keeps the dragged
 * order on file so "My order" brings it back.
 */
export function useViewOrder(setId: number, scope: string, initial: ViewOrder | undefined, fallback: OrderMode) {
  const [order, setOrderState] = useState<ViewOrder>(initial ?? { mode: fallback });
  // Another browser (or the server) may have changed it since this page loaded.
  const initKey = JSON.stringify(initial ?? null);
  useEffect(() => { if (initial) setOrderState(initial); }, [initKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const setOrder = useCallback((next: ViewOrder) => {
    setOrderState((prev) => ({ ...next, custom: next.custom ?? prev.custom }));
    void setDiscoveryViewOrder(setId, scope, next);
  }, [setId, scope]);
  return [order, setOrder] as const;
}

export function DocSortSelect({ order, onChange, modes, title }: { order: ViewOrder; onChange: (o: ViewOrder) => void; modes: OrderMode[]; title?: string }) {
  const hasCustom = (order.custom?.length ?? 0) > 0;
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-2 py-1 text-xs" title={title ?? "How the documents in this tab are ordered — saved for everyone at the firm"}>
      <ArrowDownUp size={13} className="text-[var(--c-accent)]" />
      <span className="text-[var(--c-ink-muted)]">Sort</span>
      <select value={order.mode} onChange={(e) => onChange({ mode: e.target.value as OrderMode })} className="bg-transparent text-xs outline-none" data-testid="doc-sort">
        {modes.map((m) => (
          <option key={m} value={m} disabled={m === "custom" && !hasCustom && order.mode !== "custom"}>{ORDER_LABELS[m]}{m === "custom" && !hasCustom ? " — drag a document to start" : ""}</option>
        ))}
      </select>
    </label>
  );
}

export type DragHint = "before" | "after" | null;

/**
 * Native drag-and-drop between document sections. `keys` is the current
 * visible order; `onReorder` gets the full new order after a drop.
 */
export function useDocDrag(keys: string[], onReorder: (keys: string[]) => void) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; before: boolean } | null>(null);
  const keysRef = useRef(keys);
  useEffect(() => { keysRef.current = keys; }, [keys]);

  const handleProps = useCallback((key: string): HTMLAttributes<HTMLElement> & { draggable: boolean } => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", key); } catch { /* ok */ } setDragging(key); },
    onDragEnd: () => { setDragging(null); setOver(null); },
  }), []);

  const dropProps = useCallback((key: string): HTMLAttributes<HTMLElement> => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!dragging || dragging === key) return;
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move";
      const r = e.currentTarget.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      setOver((o) => (o && o.key === key && o.before === before ? o : { key, before }));
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o?.key === key ? null : o)); },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault(); e.stopPropagation(); // never reaches the tab's file-drop zone
      const moved = dragging ?? (() => { try { return e.dataTransfer.getData("text/plain"); } catch { return ""; } })();
      const target = key;
      setDragging(null); setOver(null);
      if (!moved || moved === target) return;
      const r = e.currentTarget.getBoundingClientRect();
      onReorder(moveKey(keysRef.current, moved, target, e.clientY < r.top + r.height / 2));
    },
  }), [dragging, onReorder]);

  const hintFor = (key: string): DragHint => (over && over.key === key ? (over.before ? "before" : "after") : null);
  return { dragging, handleProps, dropProps, hintFor };
}

/** Section wrapper classes for the drop indicator line. */
export const dropHintClass = (hint: DragHint, dragging: boolean) =>
  `${hint === "before" ? "border-t-4 border-t-[var(--c-accent)] pt-1" : hint === "after" ? "border-b-4 border-b-[var(--c-accent)] pb-1" : ""} ${dragging ? "opacity-50" : ""}`.trim();
