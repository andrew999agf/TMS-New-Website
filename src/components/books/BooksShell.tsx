"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Landmark, Scale, Users, ListTree, BarChart3, Settings, ArrowLeft, LogOut } from "lucide-react";
import { BOOKS_NAME } from "@/lib/books/host";

const NAV = [
  { href: "", label: "Dashboard", icon: LayoutDashboard },
  { href: "/banking", label: "Banking", icon: Landmark },
  { href: "/trust", label: "Trust (IOLTA)", icon: Scale },
  { href: "/payroll", label: "Payroll", icon: Users },
  { href: "/accounts", label: "Chart of accounts", icon: ListTree },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The product's frame: its own name, nav, company badge, and a way back to the admin. */
export function BooksShell({ base, adminUrl, company, user, children }: {
  base: string; adminUrl: string; company: { name: string; state: string; taxElection: string };
  user: { name: string; email: string; role: string }; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const here = pathname.replace(/^\/books/, "") || "/";
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-surface)] md:flex">
        <div className="border-b border-[var(--c-border)] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{BOOKS_NAME}</p>
          <p className="mt-1 truncate text-sm font-semibold" title={company.name}>{company.name}</p>
          <p className="text-[11px] text-[var(--c-ink-muted)]">{company.state} · {company.taxElection.replace("_", " ")}</p>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map((n) => {
            const active = n.href === "" ? here === "/" : here.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.label} href={`${base}${n.href || "/"}`} className={`mb-0.5 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-[var(--c-accent)] text-[var(--c-on-accent)]" : "hover:bg-[var(--c-bg)]"}`}>
                <Icon size={15} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--c-border)] p-3 text-xs">
          <p className="truncate font-medium" title={user.email}>{user.name || user.email}</p>
          <p className="text-[11px] text-[var(--c-ink-muted)]">{user.role}</p>
          <div className="mt-2 flex flex-col gap-1">
            <a href={adminUrl} className="inline-flex items-center gap-1.5 text-[var(--c-accent)] hover:underline" data-testid="sb-back-admin"><ArrowLeft size={12} /> Back to admin</a>
            <a href={`${base}/logout`} className="inline-flex items-center gap-1.5 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><LogOut size={12} /> Sign out</a>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2 md:hidden">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-accent)]">{BOOKS_NAME}</span>
          <span className="ml-auto flex gap-3 text-xs">
            {NAV.map((n) => <Link key={n.label} href={`${base}${n.href || "/"}`} className="hover:underline">{n.label}</Link>)}
          </span>
        </header>
        <main className="mx-auto max-w-5xl p-6">{children}</main>
      </div>
    </div>
  );
}
