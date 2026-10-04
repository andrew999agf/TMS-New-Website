"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a discovery set page in step with the other people working it: polls
 * the set's fingerprint while the tab is visible and re-renders the page when
 * someone else stages, sends to produced, uploads, or removes a document. The
 * re-render keeps this user's in-progress selections (client state survives
 * a router refresh). Pauses while the tab is hidden; checks right away on
 * return.
 */
export function DiscoveryLiveRefresh({ setId, version }: { setId: number; version: string }) {
  const router = useRouter();
  const known = useRef(version);
  // Our own actions refresh the page too — adopt the new server version so we
  // don't refresh a second time for a change we just made.
  useEffect(() => { known.current = version; }, [version]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/admin/discovery/${setId}/version`, { cache: "no-store" });
        if (r.ok) {
          const { v } = (await r.json()) as { v?: string };
          if (v && known.current && v !== known.current) {
            known.current = v;
            router.refresh();
          }
        }
      } catch { /* offline blip — try again next tick */ }
    };
    const loop = () => { timer = setTimeout(async () => { await check(); if (!stopped) loop(); }, 6000); };
    loop();
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [setId, router]);

  return null;
}
