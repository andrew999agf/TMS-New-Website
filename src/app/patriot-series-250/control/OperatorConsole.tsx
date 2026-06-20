"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Copy, Check, Radio, AlertTriangle } from "lucide-react";

/**
 * Operator console (Channel B). Connects to the control hub as `operator`,
 * shows live connection + switcher presence, and surfaces the hand-off tokens
 * (the WHIP publish URL + switcher token go into the desktop app).
 *
 * The full button panel + scoreboard editor land once the switcher's
 * INTEGRATION_SPEC.md is in — for now this proves the channel end-to-end and
 * shows the raw state snapshot as it streams in.
 */
type Status = "idle" | "connecting" | "connected" | "disconnected";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/45">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white/70">{value}</code>
        <button
          onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 text-xs text-white/70 hover:border-white/40 hover:text-white"
        >
          {done ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export function OperatorConsole({
  wsUrl, operatorToken, switcherToken, whipUrl,
}: {
  wsUrl: string;
  operatorToken: string;
  switcherToken: string;
  whipUrl: string;
}) {
  const configured = Boolean(wsUrl && operatorToken);
  const [status, setStatus] = useState<Status>("idle");
  const [switcherOnline, setSwitcherOnline] = useState(false);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!configured) return;
    let backoff = 1000;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      setStatus("connecting");
      const ws = new WebSocket(`${wsUrl}?role=operator&token=${encodeURIComponent(operatorToken)}`);
      wsRef.current = ws;
      ws.onopen = () => { setStatus("connected"); backoff = 1000; };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(typeof e.data === "string" ? e.data : "");
          if (m?.type === "presence") setSwitcherOnline(Boolean(m.switcher));
          else if (m?.type === "state") setSnapshot(m.snapshot ?? m);
        } catch { /* ignore non-JSON */ }
      };
      ws.onclose = () => {
        setStatus("disconnected"); setSwitcherOnline(false);
        if (!closed) { retry = setTimeout(open, backoff); backoff = Math.min(backoff * 2, 8000); }
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };
    open();
    return () => { closed = true; if (retry) clearTimeout(retry); try { wsRef.current?.close(); } catch { /* ignore */ } };
  }, [configured, wsUrl, operatorToken]);

  useEffect(() => connect(), [connect]);

  return (
    <div className="space-y-5">
      {/* Connection status */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/12 bg-white/[0.04] p-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status === "connected" ? "bg-green-500/15 text-green-300" : "bg-white/10 text-white/50"}`}>
          {status === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />} Hub: {status}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${switcherOnline ? "bg-blue-500/15 text-blue-300" : "bg-white/10 text-white/50"}`}>
          <Radio size={13} /> Switcher: {switcherOnline ? "online" : "offline"}
        </span>
      </div>

      {!configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/80">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Channel B isn&apos;t wired up yet.</p>
            <p className="mt-1 text-amber-100/60">
              Deploy the control worker and set <code>PATRIOT_WS_URL</code> + <code>CONTROL_SECRET</code> in the
              website environment. This console will connect automatically once they&apos;re set.
            </p>
          </div>
        </div>
      )}

      {/* Hand-off credentials for the desktop switcher */}
      <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.04] p-4">
        <p className="text-sm font-semibold text-white/80">Switcher hand-off</p>
        <p className="text-[11px] text-white/45">Paste these into the desktop switcher app to go live.</p>
        <CopyRow label="WHIP publish URL (video out)" value={whipUrl} />
        <CopyRow label="Switcher control token" value={switcherToken} />
        {!whipUrl && (
          <p className="text-[11px] text-white/40">WHIP URL appears here once <code>PATRIOT_WHIP_URL</code> is set from your Cloudflare Stream Live input.</p>
        )}
      </div>

      {/* Raw live state (until the full panel/overlay is built to the spec) */}
      <div className="rounded-xl border border-white/12 bg-white/[0.04] p-4">
        <p className="mb-2 text-sm font-semibold text-white/80">Live state snapshot</p>
        {snapshot ? (
          <pre className="max-h-72 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-white/60">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        ) : (
          <p className="text-[11px] text-white/40">Waiting for the first state snapshot from the switcher…</p>
        )}
        <p className="mt-2 text-[11px] text-white/35">
          The full control panel (camera takes, scoreboard, graphics) renders here once the switcher&apos;s
          INTEGRATION_SPEC.md is wired in.
        </p>
      </div>
    </div>
  );
}
