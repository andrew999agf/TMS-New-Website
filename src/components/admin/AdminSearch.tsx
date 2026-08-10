"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";

/** One searchable destination. `section` gates it to accounts with access. */
type SearchItem = { label: string; href: string; section: string; group: string; keywords: string[] };

// A rich index of places and features in the admin panel — including deep
// features inside a page — so people can jump straight to what they need.
const INDEX: SearchItem[] = [
  { label: "Dashboard", href: "/admin", section: "dashboard", group: "Dashboard", keywords: ["home", "overview", "start"] },

  // Website management
  { label: "Pages", href: "/admin/pages", section: "pages", group: "Website", keywords: ["home page", "about", "contact", "content", "edit page", "hero", "seo"] },
  { label: "Our Team", href: "/admin/team", section: "team", group: "Website", keywords: ["attorney bios", "staff", "people", "lawyers", "photos"] },
  { label: "Home Banner", href: "/admin/banner", section: "banner", group: "Website", keywords: ["slideshow", "carousel", "hero images", "front page"] },
  { label: "Badges", href: "/admin/badges", section: "badges", group: "Website", keywords: ["awards", "logos", "memberships", "seals"] },
  { label: "Practice Areas", href: "/admin/practice-areas", section: "practice-areas", group: "Website", keywords: ["services", "areas of law", "personal injury", "probate"] },
  { label: "Results", href: "/admin/results", section: "results", group: "Website", keywords: ["case results", "wins", "verdicts", "we have litigated", "opposing"] },
  { label: "Blog", href: "/admin/blog", section: "blog", group: "Website", keywords: ["posts", "articles", "news", "writing"] },
  { label: "Glossary", href: "/admin/glossary", section: "glossary", group: "Website", keywords: ["key terms", "definitions", "legal terms"] },
  { label: "Texas Rules", href: "/admin/texas-rules", section: "texas-rules", group: "Website", keywords: ["rules of procedure", "statutes"] },
  { label: "Testimonials", href: "/admin/testimonials", section: "testimonials", group: "Website", keywords: ["reviews", "quotes", "client feedback", "google reviews"] },
  { label: "Media", href: "/admin/media", section: "media", group: "Website", keywords: ["images", "files", "uploads", "photos", "logo"] },
  { label: "Appearance", href: "/admin/appearance", section: "appearance", group: "Website", keywords: ["theme", "colors", "fonts", "branding", "palette", "logo"] },

  // Intake
  { label: "Intake", href: "/admin/intake", section: "intake", group: "Intake", keywords: ["leads", "consultations", "new clients", "submissions", "prospects"] },
  { label: "Referral attorneys — add / edit / remove", href: "/admin/intake#referral-attorneys", section: "intake", group: "Intake", keywords: ["referral attys", "refer out", "stable of attorneys", "referral list", "turn back attorneys", "other lawyers", "edit referral", "add attorney"] },
  { label: "Turn-back / decline emails", href: "/admin/intake", section: "intake", group: "Intake", keywords: ["decline", "turn back", "reject", "referral email", "cannot help"] },
  { label: "Lead sources & referral analytics", href: "/admin/intake", section: "intake", group: "Intake", keywords: ["where leads come from", "who refers us", "analytics", "charts", "csv", "sources"] },
  { label: "Intake notification recipients", href: "/admin/intake", section: "intake", group: "Intake", keywords: ["who gets notified", "intake team", "recipients", "cc"] },
  { label: "Send an intake request", href: "/admin/intake", section: "intake", group: "Intake", keywords: ["send intake", "email intake form", "estate intake"] },

  // Documents
  { label: "Document Generator", href: "/admin/documents", section: "documents", group: "Documents", keywords: ["draft", "templates", "wills", "letters", "generate document"] },

  // Share folders
  { label: "Share Folders", href: "/admin/share-folders", section: "share-folders", group: "Share Folders", keywords: ["secure share", "documents", "send files", "client documents", "discovery", "co-counsel", "portal"] },
  { label: "Share Folder Reports", href: "/admin/share-folders/reports", section: "share-folders", group: "Share Folders", keywords: ["to-do report", "documents report", "tickler", "monthly review", "pdf reports"] },
  { label: "Share-folder notifications (CC)", href: "/admin/settings#share-cc", section: "settings", group: "Share Folders", keywords: ["who gets copied", "share cc", "notification recipients", "add people to emails"] },

  // Case & trial tools
  { label: "Pre-Trial Deadlines", href: "/admin/pre-trial", section: "pre-trial", group: "Case & Trial Tools", keywords: ["trial", "deadlines", "checklist", "scheduling order", "docket control", "motions in limine", "expert designation", "discovery cutoff", "pretrial", "calendar"] },

  // Time
  { label: "Time Tracker 4.0", href: "/admin/time-tracker-4", section: "time-tracker-4", group: "Time", keywords: ["billing", "time entries", "hours", "activity"] },
  { label: "Time Clock", href: "/admin/timeclock", section: "timeclock", group: "Time", keywords: ["clock in", "clock out", "payroll", "punch", "pay period", "payroll schedule"] },
  { label: "Billing Review", href: "/admin/billing-review", section: "billing-review", group: "Time", keywords: ["revise billing", "supervisor", "review time", "edit staff time", "end of day", "billing supervisor", "correct entries"] },

  // Training / users / settings
  { label: "Training", href: "/admin/training", section: "training", group: "Other", keywords: ["how to", "guides", "help", "tutorials", "sops"] },
  { label: "User Management", href: "/admin/logins", section: "logins", group: "Other", keywords: ["logins", "accounts", "passwords", "permissions", "add user", "roles"] },
  { label: "Settings", href: "/admin/settings", section: "settings", group: "Other", keywords: ["configuration", "options"] },
  { label: "Database updates", href: "/admin/settings", section: "settings", group: "Other", keywords: ["db sync", "database sync", "apply updates", "migrate", "new columns"] },
  { label: "Monthly billing reminder", href: "/admin/settings", section: "settings", group: "Other", keywords: ["billing email", "month end", "payroll reminder"] },
  { label: "Make a payment link", href: "/admin/settings", section: "settings", group: "Other", keywords: ["payment", "clio", "pay online"] },
];

function score(item: SearchItem, q: string): number {
  const label = item.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (item.keywords.some((k) => k.includes(q))) return 40;
  if (item.group.toLowerCase().includes(q)) return 20;
  // token match: every word of the query appears somewhere
  const hay = `${label} ${item.keywords.join(" ")} ${item.group}`.toLowerCase();
  if (q.split(/\s+/).every((w) => hay.includes(w))) return 15;
  return 0;
}

export function AdminSearch({ allowed, collapsed, onExpand }: { allowed: string[]; collapsed: boolean; onExpand: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const allow = useMemo(() => new Set(allowed), [allowed]);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return INDEX
      .filter((i) => allow.has(i.section))
      .map((i) => ({ i, s: score(i, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i.label.localeCompare(b.i.label))
      .slice(0, 8)
      .map((x) => x.i);
  }, [q, allow]);

  useEffect(() => { setActive(0); }, [q]);

  function go(item: SearchItem) {
    setQ(""); setOpen(false);
    router.push(item.href);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { setQ(""); setOpen(false); }
  }

  if (collapsed) {
    return (
      <div className="border-b border-[var(--c-dark-border)] px-2 py-3">
        <button onClick={onExpand} title="Search" aria-label="Search" className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--c-dark-ink-muted)] hover:bg-[var(--c-dark-surface)] hover:text-[var(--c-dark-ink)]">
          <Search size={18} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative border-b border-[var(--c-dark-border)] px-4 py-3">
      <div className="flex items-center gap-2 rounded-md bg-[var(--c-dark-surface)] px-2.5 py-1.5">
        <Search size={15} className="shrink-0 text-[var(--c-dark-ink-muted)]" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search the admin…"
          className="w-full bg-transparent text-sm text-[var(--c-dark-ink)] placeholder:text-[var(--c-dark-ink-muted)] outline-none"
        />
      </div>

      {open && q.trim() && (
        <div className="absolute left-3 right-3 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] py-1 text-[var(--c-ink)] shadow-2xl">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[var(--c-ink-muted)]">No matches for &ldquo;{q}&rdquo;.</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.href + item.label}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-[var(--c-surface2)]" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  <span className="block truncate text-[11px] text-[var(--c-ink-muted)]">{item.group}</span>
                </span>
                {i === active && <CornerDownLeft size={13} className="shrink-0 text-[var(--c-ink-muted)]" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
