"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small drop-down menu anchored to a chip.
 *
 * It renders into a portal at document.body with fixed positioning, because
 * anchoring it inside the row means any ancestor with `overflow-hidden` (every
 * task card has one, to clip its rounded corners) crops the menu at the card
 * edge — so a long list of names was cut off with no way to reach the rest.
 * From the portal it can overlay whatever follows and scroll on its own.
 *
 * It also flips above the chip when there isn't room below, and closes on
 * scroll/resize since a fixed element can't follow its anchor.
 */
export function PopMenu({
  label,
  className,
  title,
  disabled,
  width = 224,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
  width?: number;
  /** Receives a `close` callback so items can dismiss the menu when picked. */
  children: (close: () => void) => React.ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const open = pos !== null;
  const close = () => setPos(null);

  function toggle() {
    if (open) return close();
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    // Prefer below; flip up only when below is genuinely cramped.
    const flip = below < 160 && above > below;
    const maxH = Math.max(120, Math.min(320, flip ? above : below));
    setPos({
      top: flip ? Math.max(8, r.top - maxH - gap) : r.bottom + gap,
      left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8),
      maxH,
    });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    // `true` catches scrolling inside any container, not just the window.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} disabled={disabled} title={title} className={className}>
        {label}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[90]" onClick={close} />
            <div
              style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxH }}
              className="fixed z-[91] overflow-y-auto overscroll-contain rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-2xl"
            >
              {children(close)}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** A row inside a PopMenu, with the hover state people expect from a menu. */
export function PopMenuItem({
  onClick,
  active,
  muted,
  children,
}: {
  onClick: () => void;
  /** The currently selected option. */
  active?: boolean;
  /** A secondary action, e.g. "Clear assignment". */
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full cursor-pointer px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--c-accent)]/10 hover:text-[var(--c-accent)] focus:bg-[var(--c-accent)]/10 focus:outline-none ${
        active ? "bg-[var(--c-accent)]/5 font-semibold text-[var(--c-accent)]" : muted ? "text-[var(--c-ink-muted)]" : "text-[var(--c-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
