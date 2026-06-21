import Link from "next/link";
import { Lock } from "lucide-react";
import { PatriotThemeScript, PatriotThemeToggle } from "./PatriotTheme";
import { PatriotLiveBadge } from "./PatriotLive";

const NAV = [
  { href: "/", label: "Watch" },
  { href: "/teams", label: "Teams" },
  { href: "/past-tournaments", label: "Past Tournaments" },
  { href: "/records", label: "Records" },
  { href: "/stadium", label: "Stadium" },
];

export function PatriotHeader({ active = "/" }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--psx-border)] bg-[var(--psx-header)] backdrop-blur">
      <PatriotThemeScript />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.25em] text-[color:var(--psx-fg)] sm:text-xs">
          Patriot Series 250
        </Link>
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-xs font-medium uppercase tracking-wider transition-colors ${active === n.href ? "text-[color:var(--psx-fg)]" : "text-[color:var(--psx-muted)] hover:text-[color:var(--psx-fg)]"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          <PatriotThemeToggle />
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--psx-border)] px-3 py-1 text-[11px] font-medium text-[color:var(--psx-muted)] transition-colors hover:text-[color:var(--psx-fg)]"
          >
            <Lock size={12} /> <span className="hidden sm:inline">Operator</span>
          </Link>
          <PatriotLiveBadge />
        </div>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-[color:var(--psx-border)] px-5 py-2 lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`whitespace-nowrap text-[11px] font-medium uppercase tracking-wider ${active === n.href ? "text-[color:var(--psx-fg)]" : "text-[color:var(--psx-muted)]"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
