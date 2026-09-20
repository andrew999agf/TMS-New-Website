"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gavel, X } from "lucide-react";

/**
 * Floating "new result" pill in the bottom corner of the home page.
 *
 * The label truncates rather than wrapping so the pill stays one line at phone
 * width. Dismissal is kept in sessionStorage, so it returns on the visitor's
 * next visit rather than disappearing for good.
 */
export function NewResultBadge({
  label,
  href,
  storageKey = "new-result-badge",
}: {
  label: string;
  href: string;
  storageKey?: string;
}) {
  // Start hidden so the server and client markup agree, then reveal after the
  // dismissal check — avoids a flash of a badge the visitor already closed.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(storageKey) === "1";
    } catch {
      // Private browsing or blocked storage: show the badge.
    }
    if (!dismissed) setShown(true);
  }, [storageKey]);

  if (!shown) return null;

  const dismiss = () => {
    setShown(false);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Nothing to persist to; the badge simply returns on the next page load.
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden fade-up">
      <div className="group flex items-center gap-1 rounded-full bg-[var(--c-accent)] text-[var(--c-on-accent)] shadow-lg">
        <Link
          href={href}
          className="flex items-center gap-2.5 rounded-full py-3 pl-4 pr-2 font-[family-name:var(--font-ui)] text-sm leading-tight"
        >
          <Gavel size={18} className="shrink-0" aria-hidden />
          <span className="max-w-[60vw] truncate sm:max-w-[16rem]">{label}</span>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss this announcement"
          className="mr-1.5 rounded-full p-1.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
