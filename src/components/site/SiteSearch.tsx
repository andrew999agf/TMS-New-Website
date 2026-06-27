"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Loader2,
  Scale,
  Newspaper,
  Users,
  BookMarked,
  Gavel,
  Trophy,
  FileText,
  Clock,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

type MatchRange = [number, number];
type Result = { type: string; title: string; subtitle?: string; url: string; matches?: MatchRange[] };

const TYPE_ORDER = ["Practice Area", "Insight", "Team", "Glossary", "Texas Rule", "Result", "Page"];

const TYPE_ICON: Record<string, LucideIcon> = {
  "Practice Area": Scale,
  Insight: Newspaper,
  Team: Users,
  Glossary: BookMarked,
  "Texas Rule": Gavel,
  Result: Trophy,
  Page: FileText,
};

// Shown in the empty state so the box is useful before anyone types.
const QUICK_LINKS: { label: string; url: string }[] = [
  { label: "Practice Areas", url: "/practice-areas" },
  { label: "Our Team", url: "/about" },
  { label: "Results", url: "/results" },
  { label: "Insights", url: "/blog" },
  { label: "Texas Rules", url: "/texas-rules" },
  { label: "Contact", url: "/contact" },
];

const RECENTS_KEY = "tms_recent_searches";
const MAX_RECENTS = 6;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

/** Render a title with the matched character ranges emphasized. */
function Highlighted({ text, ranges }: { text: string; ranges?: MatchRange[] }) {
  if (!ranges || ranges.length === 0) return <>{text}</>;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let i = 0;
  sorted.forEach(([s, e], k) => {
    if (s < i) return; // skip overlaps
    if (s > i) parts.push(<span key={`t${k}`}>{text.slice(i, s)}</span>);
    parts.push(
      <mark key={`m${k}`} className="bg-[var(--c-accent)]/20 text-[var(--c-ink)] rounded-[2px]">
        {text.slice(s, e + 1)}
      </mark>,
    );
    i = e + 1;
  });
  if (i < text.length) parts.push(<span key="tail">{text.slice(i)}</span>);
  return <>{parts}</>;
}

export function SiteSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const term = q.trim();
  // Flatten results into render/keyboard order so the active index maps 1:1.
  const ordered = useMemo(
    () => TYPE_ORDER.flatMap((t) => results.filter((r) => r.type === t)),
    [results],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
    setActive(0);
  }, []);

  const remember = useCallback((text: string) => {
    const v = text.trim();
    if (v.length < 2) return;
    setRecents((prev) => {
      const next = [v, ...prev.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const go = useCallback(
    (url: string, fromQuery?: string) => {
      if (fromQuery) remember(fromQuery);
      close();
      router.push(url);
    },
    [close, remember, router],
  );

  // Global shortcuts: ⌘K / Ctrl+K toggles; "/" opens when not typing elsewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !open) {
        const el = document.activeElement as HTMLElement | null;
        const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // On open: focus the input, load recents, and lock background scroll.
  useEffect(() => {
    if (!open) return;
    setRecents(loadRecents());
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setActive(0);
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (ordered.length ? (i + 1) % ordered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (ordered.length ? (i - 1 + ordered.length) % ordered.length : 0));
    } else if (e.key === "Enter") {
      const pick = ordered[active] ?? ordered[0];
      if (pick) go(pick.url, term);
    } else if (e.key === "Escape") {
      close();
    }
  }

  // Build display groups; each item's flat index comes from `ordered` (same refs).
  const groups = TYPE_ORDER.map((t) => ({ type: t, items: ordered.filter((r) => r.type === t) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className={`flex items-center ${className ?? ""}`}>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search the site"
        title="Search  (⌘K)"
        className="p-2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] shrink-0"
      >
        <Search size={20} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[12vh] sm:pt-[14vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Site search"
        >
          {/* Backdrop */}
          <button
            aria-label="Close search"
            onClick={close}
            className="absolute inset-0 bg-[var(--c-dark-bg)]/55 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out]"
          />

          {/* Palette */}
          <div className="relative w-full max-w-xl rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl overflow-hidden motion-safe:animate-[paletteIn_140ms_ease-out]">
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--c-border)]">
              <Search size={18} className="text-[var(--c-ink-muted)] shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search practice areas, articles, team, rules…"
                aria-label="Search the site"
                role="combobox"
                aria-expanded={ordered.length > 0}
                aria-controls="site-search-list"
                aria-activedescendant={ordered.length ? `site-search-opt-${active}` : undefined}
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--c-ink-muted)]"
              />
              {loading && <Loader2 size={16} className="animate-spin text-[var(--c-ink-muted)] shrink-0" />}
              <button
                onClick={close}
                aria-label="Close search"
                className="shrink-0 rounded-md p-1 text-[var(--c-ink-muted)] hover:bg-[var(--c-surface2)] hover:text-[var(--c-ink)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div ref={listRef} id="site-search-list" role="listbox" className="max-h-[60vh] overflow-y-auto">
              {term.length < 2 ? (
                <div className="p-3">
                  {recents.length > 0 && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between px-2 pb-1">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--c-ink-muted)] font-[family-name:var(--font-ui)]">
                          Recent
                        </p>
                        <button
                          onClick={() => {
                            setRecents([]);
                            try {
                              localStorage.removeItem(RECENTS_KEY);
                            } catch {
                              /* ignore */
                            }
                          }}
                          className="text-[11px] text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"
                        >
                          Clear
                        </button>
                      </div>
                      {recents.map((r) => (
                        <button
                          key={r}
                          onClick={() => setQ(r)}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--c-surface2)]"
                        >
                          <Clock size={15} className="shrink-0 text-[var(--c-ink-muted)]" />
                          <span className="truncate text-[var(--c-ink)]">{r}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-ink-muted)] font-[family-name:var(--font-ui)]">
                    Quick links
                  </p>
                  <div className="flex flex-wrap gap-2 px-2 pb-1">
                    {QUICK_LINKS.map((l) => (
                      <button
                        key={l.url}
                        onClick={() => go(l.url)}
                        className="rounded-full border border-[var(--c-border)] px-3 py-1.5 text-xs font-medium text-[var(--c-ink)] hover:bg-[var(--c-surface2)]"
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  {!loading && groups.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-[var(--c-ink-muted)]">
                      No matches for “{term}”.
                    </p>
                  )}
                  {groups.map((g) => {
                    const Icon = TYPE_ICON[g.type] ?? FileText;
                    return (
                      <div key={g.type} className="px-2 py-1">
                        <p className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-accent)] font-[family-name:var(--font-ui)]">
                          {g.type}
                        </p>
                        {g.items.map((r) => {
                          const i = ordered.indexOf(r);
                          const isActive = i === active;
                          return (
                            <button
                              key={`${r.type}-${r.url}-${r.title}`}
                              id={`site-search-opt-${i}`}
                              data-idx={i}
                              role="option"
                              aria-selected={isActive}
                              onMouseMove={() => setActive(i)}
                              onClick={() => go(r.url, term)}
                              className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left ${
                                isActive ? "bg-[var(--c-surface2)]" : ""
                              }`}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--c-surface2)] text-[var(--c-ink-muted)]">
                                <Icon size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium leading-snug text-[var(--c-ink)]">
                                  <Highlighted text={r.title} ranges={r.matches} />
                                </span>
                                {r.subtitle && (
                                  <span className="block truncate text-xs text-[var(--c-ink-muted)]">{r.subtitle}</span>
                                )}
                              </span>
                              {isActive && <CornerDownLeft size={14} className="shrink-0 text-[var(--c-ink-muted)]" />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint bar */}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--c-border)] bg-[var(--c-surface2)] px-4 py-2 text-[11px] text-[var(--c-ink-muted)]">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <ArrowUp size={11} />
                  <ArrowDown size={11} /> navigate
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft size={11} /> open
                </span>
                <span className="hidden sm:inline">esc to close</span>
              </span>
              <span>{term.length >= 2 && !loading ? `${ordered.length} result${ordered.length === 1 ? "" : "s"}` : ""}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
