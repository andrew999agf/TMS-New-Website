"use client";

import { useEffect, useState } from "react";
import { Facebook, Linkedin, Twitter, MessageSquare, Link2, Check } from "lucide-react";

/** Share / text the current page to social media. */
export function ShareButtons({ title }: { title: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setUrl(window.location.href), []);

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const targets = [
    { label: "Text", href: `sms:?&body=${t}%20${u}`, Icon: MessageSquare },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, Icon: Facebook },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`, Icon: Twitter },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, Icon: Linkedin },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-sm text-[var(--c-ink-muted)] mr-1">Share:</span>
      {targets.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target={label === "Text" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={`Share on ${label}`}
          title={label}
          className="h-9 w-9 flex items-center justify-center rounded-full border border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] hover:border-[var(--c-accent)] transition-colors"
        >
          <Icon size={16} />
        </a>
      ))}
      <button
        onClick={copy}
        aria-label="Copy link"
        title="Copy link"
        className="h-9 w-9 flex items-center justify-center rounded-full border border-[var(--c-border)] text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] hover:border-[var(--c-accent)] transition-colors"
      >
        {copied ? <Check size={16} className="text-[var(--c-success)]" /> : <Link2 size={16} />}
      </button>
    </div>
  );
}
