import Link from "next/link";
import { Lock } from "lucide-react";
import styles from "./patriot.module.css";

/**
 * Shared top nav for the public Patriot Series pages (watch / teams / past
 * tournaments / stadium). Uses the clean host-routed paths — on
 * patriotseriestexas.com these map to the /patriot-series-250/* pages via the
 * middleware, so links stay short.
 */
const NAV = [
  { href: "/", label: "Watch" },
  { href: "/teams", label: "Teams" },
  { href: "/past-tournaments", label: "Past Tournaments" },
  { href: "/stadium", label: "Stadium" },
];

export function PatriotHeader({ active = "/" }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0e1a]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/85 sm:text-xs">
          Patriot Series 250
        </Link>
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-xs font-medium uppercase tracking-wider transition-colors ${active === n.href ? "text-white" : "text-white/55 hover:text-white"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
          >
            <Lock size={12} /> <span className="hidden sm:inline">Operator</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-300"
          >
            <span className={`h-2 w-2 rounded-full bg-red-500 ${styles.liveDot}`} /> Live
          </Link>
        </div>
      </div>
      <nav className="flex gap-4 overflow-x-auto border-t border-white/10 px-5 py-2 lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`whitespace-nowrap text-[11px] font-medium uppercase tracking-wider ${active === n.href ? "text-white" : "text-white/55"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
