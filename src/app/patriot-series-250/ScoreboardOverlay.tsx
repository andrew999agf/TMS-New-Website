"use client";

import { useEffect, useRef, useState } from "react";
import { PatriotOverlay, type PatriotSnapshot } from "./PatriotOverlay";

/**
 * Public scoreboard overlay. Connects to the control hub as a read-only
 * `viewer` (no token), receives the switcher's {type:"state"} snapshots, and
 * renders the operator's EXACT broadcast graphics — their shared
 * `PatriotOverlay` drop-in — on top of the WHEP video. The component honors
 * overlay.transform, so it sits exactly where the operator placed it.
 *
 * `PatriotOverlay.tsx` is the switcher team's file, kept untouched so future
 * design updates are a clean drop-in replace.
 */
function useViewerSnapshot(wsUrl: string): PatriotSnapshot | null {
  const [snap, setSnap] = useState<PatriotSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    let closed = false;
    let backoff = 1000;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      const ws = new WebSocket(`${wsUrl}?role=viewer`);
      wsRef.current = ws;
      ws.onopen = () => { backoff = 1000; };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(typeof e.data === "string" ? e.data : "") as { type?: string; snapshot?: PatriotSnapshot };
          if (m?.type === "state" && m.snapshot) setSnap(m.snapshot);
        } catch { /* ignore non-JSON */ }
      };
      ws.onclose = () => {
        if (!closed) { retry = setTimeout(open, backoff); backoff = Math.min(backoff * 2, 8000); }
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };
    open();
    return () => { closed = true; if (retry) clearTimeout(retry); try { wsRef.current?.close(); } catch { /* ignore */ } };
  }, [wsUrl]);

  return snap;
}

export function ScoreboardOverlay({ wsUrl }: { wsUrl: string }) {
  const snap = useViewerSnapshot(wsUrl);
  if (!wsUrl) return null;
  return <PatriotOverlay snapshot={snap} />;
}
