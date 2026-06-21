"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Light/dark toggle for the public Patriot pages. The theme lives on
 * <html data-psx-theme> (set early by ThemeScript, default light) and is
 * persisted to localStorage. Flipping it re-points the --psx-* variables, which
 * also turns logos into white silhouettes via --psx-logo-filter.
 */
export function PatriotThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = (document.documentElement.getAttribute("data-psx-theme") as "light" | "dark") || "light";
    setTheme(t);
    setReady(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-psx-theme", next);
    try { localStorage.setItem("psx-theme", next); } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--psx-border)] text-[color:var(--psx-muted)] transition-colors hover:text-[color:var(--psx-fg)]"
    >
      {ready && theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

/** Inline script that sets the theme before paint (no flash). Default: light. */
export function PatriotThemeScript() {
  const js =
    "(function(){try{var t=localStorage.getItem('psx-theme')||'light';document.documentElement.setAttribute('data-psx-theme',t);}catch(e){document.documentElement.setAttribute('data-psx-theme','light');}})();";
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
