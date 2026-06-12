"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/** Lite YouTube embed — loads the iframe only after the user clicks play. */
export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [active, setActive] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[var(--c-dark-bg)] border border-[var(--c-border)]">
      {active ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          onClick={() => setActive(true)}
          className="group absolute inset-0 flex items-center justify-center"
          aria-label={`Play video: ${title}`}
          style={{
            backgroundImage: `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <span className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-accent)] text-[var(--c-on-accent)] shadow-lg group-hover:scale-105 transition-transform">
            <Play size={26} className="ml-1" fill="currentColor" />
          </span>
        </button>
      )}
    </div>
  );
}
