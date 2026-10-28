/**
 * How a bucket of the Discovery Reviewer lists its documents. Shared by the
 * red / yellow / green tabs and the grey (opposing) reviewer, and persisted
 * per case on discovery_sets.view_order so the whole firm sees the same
 * order on every device.
 *
 *   name     A → Z, numeric-aware ("Statement 2" before "Statement 10")
 *   name-desc Z → A
 *   oldest   upload time, first in first
 *   newest   upload time, last in first
 *   bates    Bates number (yellow / green only)
 *   custom   the order someone dragged the documents into; documents added
 *            later (not in the saved list) follow, in name order
 */
export type OrderMode = "name" | "name-desc" | "oldest" | "newest" | "bates" | "custom";
export type ViewOrder = { mode: OrderMode; custom?: string[] };
/** scope → order. Scopes: received | staged | produced | opposing. */
export type ViewOrders = Record<string, ViewOrder>;
export const ORDER_SCOPES = ["received", "staged", "produced", "opposing"] as const;
export const ORDER_MODES: OrderMode[] = ["name", "name-desc", "oldest", "newest", "bates", "custom"];

export const ORDER_LABELS: Record<OrderMode, string> = {
  name: "Name A → Z",
  "name-desc": "Name Z → A",
  oldest: "Upload date (oldest first)",
  newest: "Upload date (newest first)",
  bates: "Bates number",
  custom: "My order (dragged)",
};

const collator = typeof Intl !== "undefined" ? new Intl.Collator("en", { numeric: true, sensitivity: "base" }) : null;
export const byName = (a: string, b: string) => (collator ? collator.compare(a, b) : a.localeCompare(b));

export type OrderAccessors<T> = {
  key: (t: T) => string;
  name: (t: T) => string;
  /** ISO timestamp of the upload, when known. */
  date?: (t: T) => string | null | undefined;
  /** Bates start, when the bucket has one. */
  bates?: (t: T) => number | null | undefined;
};

/** Read a stored view_order blob defensively. */
export function viewOrdersOf(raw: unknown): ViewOrders {
  const out: ViewOrders = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [scope, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(ORDER_SCOPES as readonly string[]).includes(scope) || !v || typeof v !== "object") continue;
    const o = v as { mode?: unknown; custom?: unknown };
    if (!ORDER_MODES.includes(o.mode as OrderMode)) continue;
    out[scope] = { mode: o.mode as OrderMode, ...(Array.isArray(o.custom) ? { custom: o.custom.filter((x): x is string => typeof x === "string").slice(0, 5000) } : {}) };
  }
  return out;
}

/** Sort a bucket's documents by the chosen order. Stable; never mutates. */
export function orderDocs<T>(items: T[], order: ViewOrder | undefined, acc: OrderAccessors<T>, fallback: OrderMode = "name"): T[] {
  const mode = order?.mode ?? fallback;
  const cmp = (m: OrderMode) => (a: T, b: T): number => {
    switch (m) {
      case "name": return byName(acc.name(a), acc.name(b)) || byName(acc.key(a), acc.key(b));
      case "name-desc": return byName(acc.name(b), acc.name(a)) || byName(acc.key(b), acc.key(a));
      case "oldest": return ((acc.date?.(a) ?? "") < (acc.date?.(b) ?? "") ? -1 : (acc.date?.(a) ?? "") > (acc.date?.(b) ?? "") ? 1 : 0) || byName(acc.name(a), acc.name(b));
      case "newest": return ((acc.date?.(a) ?? "") > (acc.date?.(b) ?? "") ? -1 : (acc.date?.(a) ?? "") < (acc.date?.(b) ?? "") ? 1 : 0) || byName(acc.name(a), acc.name(b));
      case "bates": return ((acc.bates?.(a) ?? 0) - (acc.bates?.(b) ?? 0)) || byName(acc.name(a), acc.name(b));
      default: return 0;
    }
  };
  if (mode !== "custom") return [...items].sort(cmp(mode));
  const pos = new Map((order?.custom ?? []).map((k, i) => [k, i]));
  const known = items.filter((t) => pos.has(acc.key(t))).sort((a, b) => pos.get(acc.key(a))! - pos.get(acc.key(b))!);
  const rest = items.filter((t) => !pos.has(acc.key(t))).sort(cmp(fallback === "custom" ? "name" : fallback));
  return [...known, ...rest];
}

/** The key list after dragging `moved` onto `target` (before or after it). */
export function moveKey(keys: string[], moved: string, target: string, before: boolean): string[] {
  if (moved === target) return keys;
  const without = keys.filter((k) => k !== moved);
  const at = without.indexOf(target);
  if (at < 0) return keys;
  without.splice(before ? at : at + 1, 0, moved);
  return without;
}
