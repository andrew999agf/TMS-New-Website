"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";

type Result = { type: string; title: string; subtitle?: string; url: string };

const TYPE_ORDER = ["Practice Area", "Insight", "Team", "Glossary", "Result", "Page"];

export function SiteSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
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
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQ("");
    setResults([]);
  }

  function go(url: string) {
    close();
    router.push(url);
  }

  const grouped = TYPE_ORDER.map((t) => ({ type: t, items: results.filter((r) => r.type === t) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div ref={containerRef} className={`relative flex items-center ${className ?? ""}`}>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close search" : "Search the site"}
        aria-expanded={open}
        className="p-2 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] shrink-0"
      >
        <Search size={20} />
      </button>

      {open && (
        <div
          className="search-grow absolute right-0 top-1/2 -translate-y-1/2 z-50 flex items-center gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg pl-3 pr-1.5 py-1.5 w-[20rem] max-w-[78vw]"
          style={{ transformOrigin: "right center" }}
        >
          <Search size={16} className="text-[var(--c-ink-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) go(results[0].url);
            }}
            placeholder="Search practice areas, articles, team…"
            aria-label="Search the site"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--c-ink-muted)]"
          />
          {loading ? (
            <Loader2 size={15} className="animate-spin text-[var(--c-ink-muted)] shrink-0" />
          ) : (
            <button onClick={close} aria-label="Close search" className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)] shrink-0 p-1">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-[calc(50%+1.6rem)] z-50 mt-1 w-[24rem] max-w-[90vw] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] shadow-xl overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto py-2">
            {!loading && grouped.length === 0 && (
              <p className="px-4 py-6 text-sm text-[var(--c-ink-muted)] text-center">
                No matches for “{q.trim()}”.
              </p>
            )}
            {grouped.map((g) => (
              <div key={g.type} className="px-2 py-1">
                <p className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--c-accent)] font-[family-name:var(--font-ui)]">
                  {g.type}
                </p>
                {g.items.map((r) => (
                  <Link
                    key={`${r.type}-${r.url}-${r.title}`}
                    href={r.url}
                    onClick={close}
                    className="block rounded-md px-2 py-2 hover:bg-[var(--c-surface2)]"
                  >
                    <span className="block text-sm font-medium leading-snug">{r.title}</span>
                    {r.subtitle && (
                      <span className="block text-xs text-[var(--c-ink-muted)] truncate">{r.subtitle}</span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
