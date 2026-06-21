"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Wifi, WifiOff, Copy, Check, Radio, AlertTriangle, ArrowRightLeft, Scissors } from "lucide-react";
import type { Command, Snapshot, Team } from "@/lib/patriot/protocol";

/**
 * Operator console (Channel B). Connects to the control hub as `operator`,
 * sends the switcher's command vocabulary (each with an id we track for acks),
 * and reflects the live state snapshot the switcher pushes back. The UI is
 * optimistic — it shows what we asked for, then reconciles on the next state.
 */
type Status = "idle" | "connecting" | "connected" | "disconnected";
type Tone = "default" | "red" | "green" | "blue" | "amber";

const TONES: Record<Tone, string> = {
  default: "border-white/15 text-white/80 hover:border-white/40 hover:text-white",
  red: "border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  green: "border-green-500/40 bg-green-500/10 text-green-200 hover:bg-green-500/20",
  blue: "border-blue-500/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20",
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
};

function Btn({
  onClick, children, tone = "default", active = false, disabled = false, className = "",
}: {
  onClick?: () => void;
  children: ReactNode;
  tone?: Tone;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-white bg-white text-[#0a0e1a]" : TONES[tone]
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/12 bg-white/[0.04] p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/70">{title}</p>
      {children}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">{label}</p>
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

function LowerThirdControls({ send }: { send: (c: Command) => void }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [dur, setDur] = useState(6);
  const input = "flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-white/60">Lower third</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — JAMES CARTER · #13" className={input} />
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle — SS · BATTING .425" className={input} />
        <input type="number" min={1} value={dur} onChange={(e) => setDur(Number(e.target.value) || 6)} className="w-16 rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white focus:border-white/40 focus:outline-none" />
      </div>
      <div className="mt-2 flex gap-2">
        <Btn
          tone="green"
          disabled={!title.trim()}
          onClick={() => send({ action: "graphic.show", kind: "lower-third", data: { title: title.trim(), subtitle: subtitle.trim() || undefined }, durationSec: dur })}
        >
          Show lower third
        </Btn>
        <Btn tone="amber" onClick={() => send({ action: "graphic.clear" })}>Clear</Btn>
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
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [lastAck, setLastAck] = useState<{ ok: boolean; error?: string; action?: string } | null>(null);
  const [pong, setPong] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
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
        let m: { type?: string; snapshot?: Snapshot; switcher?: boolean; ok?: boolean; id?: string; error?: string } | null = null;
        try { m = JSON.parse(typeof e.data === "string" ? e.data : ""); } catch { return; }
        if (!m) return;
        if (m.type === "presence") setSwitcherOnline(Boolean(m.switcher));
        else if (m.type === "state" && m.snapshot) setSnap(m.snapshot);
        else if (m.type === "ack") {
          const action = m.id ? pendingRef.current.get(m.id) : undefined;
          if (m.id) pendingRef.current.delete(m.id);
          setLastAck({ ok: Boolean(m.ok), error: m.error, action });
        } else if (m.type === "pong") {
          setPong(true); setTimeout(() => setPong(false), 1200);
        }
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

  const send = useCallback((cmd: Command) => {
    const ws = wsRef.current;
    const id = `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    pendingRef.current.set(id, cmd.action);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id, ...cmd }));
    else setLastAck({ ok: false, error: "not connected", action: cmd.action });
  }, []);

  const g = snap?.game;
  const feeds = snap?.feeds ?? Array.from({ length: 9 }, (_, i) => ({ slot: i + 1, label: `CAM ${i + 1}`, connected: false }));

  return (
    <div className="space-y-4">
      {/* status pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status === "connected" ? "bg-green-500/15 text-green-300" : "bg-white/10 text-white/60"}`}>
          {status === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />} Hub: {status}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${switcherOnline ? "bg-blue-500/15 text-blue-300" : "bg-white/10 text-white/60"}`}>
          <Radio size={13} /> Switcher: {switcherOnline ? "online" : "offline"}
        </span>
        {lastAck && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${lastAck.ok ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>
            {lastAck.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
            {lastAck.action ?? "cmd"} {lastAck.ok ? "ok" : `failed${lastAck.error ? ` · ${lastAck.error}` : ""}`}
          </span>
        )}
      </div>

      {!configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/80">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Channel B isn&apos;t wired up yet.</p>
            <p className="mt-1 text-amber-100/70">
              Deploy the control worker and set <code>PATRIOT_WS_URL</code> + <code>CONTROL_SECRET</code> in the
              website environment. This console connects automatically once they&apos;re set.
            </p>
          </div>
        </div>
      )}

      {/* hand-off to the desktop switcher */}
      <Section title="Switcher hand-off">
        <p className="mb-3 text-[11px] text-white/60">Paste these into the desktop switcher app to go live.</p>
        <div className="space-y-3">
          <CopyRow label="Control WebSocket URL" value={wsUrl ? `${wsUrl}${wsUrl.includes("?") ? "&" : "?"}role=switcher` : ""} />
          <CopyRow label="Switcher control token" value={switcherToken} />
          <CopyRow label="WHIP publish URL (video out)" value={whipUrl} />
          {!whipUrl && (
            <p className="text-[11px] text-white/60">WHIP URL appears here once <code>PATRIOT_WHIP_URL</code> is set from your media server.</p>
          )}
        </div>
      </Section>

      {configured && (
        <>
          {/* cameras */}
          <Section title="Cameras — tap to preview · PGM to cut · TAKE to air">
            <div className="grid grid-cols-3 gap-2">
              {feeds.map((f) => {
                const isPgm = snap?.program === f.slot;
                const isPv = snap?.preview === f.slot;
                return (
                  <div key={f.slot} className={`overflow-hidden rounded-lg border ${isPgm ? "border-red-500" : isPv ? "border-green-500" : "border-white/12"}`}>
                    <button
                      onClick={() => send({ action: "preview", slot: f.slot })}
                      className={`flex w-full items-center justify-between px-2.5 py-2 text-left ${isPgm ? "bg-red-500/20" : isPv ? "bg-green-500/15" : "bg-white/[0.03] hover:bg-white/[0.06]"}`}
                    >
                      <span className="text-xs font-semibold text-white/90">{f.label || `CAM ${f.slot}`}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${f.connected ? "bg-green-400" : "bg-white/25"}`} />
                    </button>
                    <div className="flex border-t border-white/10 text-[10px] font-bold">
                      <button onClick={() => send({ action: "program", slot: f.slot })} className="flex-1 py-1 text-red-300 hover:bg-red-500/15">PGM</button>
                      <button onClick={() => send({ action: "drop-camera", slot: f.slot })} className="flex-1 border-l border-white/10 py-1 text-white/55 hover:bg-white/10 hover:text-white">drop</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn tone="red" onClick={() => send({ action: "take" })} className="flex items-center gap-1.5"><ArrowRightLeft size={14} /> TAKE</Btn>
              <Btn tone={snap?.transition === "cut" ? "blue" : "default"} active={snap?.transition === "cut"} onClick={() => send({ action: "transition", type: "cut" })}><Scissors size={13} className="mr-1 inline" />Cut</Btn>
              <Btn tone={snap?.transition === "fade" ? "blue" : "default"} active={snap?.transition === "fade"} onClick={() => send({ action: "transition", type: "fade" })}>Fade</Btn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <Btn tone={snap?.pip ? "blue" : "default"} active={!!snap?.pip} onClick={() => send({ action: "pip", enabled: !snap?.pip })}>PIP {snap?.pip ? "on" : "off"}</Btn>
              <Btn tone={snap?.audio ? "green" : "amber"} onClick={() => send({ action: "audio", enabled: !snap?.audio })}>Audio {snap?.audio ? "on" : "off"}</Btn>
              <Btn tone="amber" onClick={() => send({ action: "drop-all" })}>Drop all</Btn>
            </div>
          </Section>

          {/* scoreboard */}
          <Section title="Scoreboard">
            {g ? (
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
                <span><b className="text-white">{g.away.abbreviation}</b> {g.away.score} — {g.home.score} <b className="text-white">{g.home.abbreviation}</b></span>
                <span>{g.inningHalf === "top" ? "▲" : "▼"} Inn {g.inning}</span>
                <span>{g.outs} out{g.outs === 1 ? "" : "s"}</span>
                <span>{g.count.balls}-{g.count.strikes}</span>
                <span>Bases: {[g.bases.first && "1B", g.bases.second && "2B", g.bases.third && "3B"].filter(Boolean).join(" ") || "empty"}</span>
                <span className="text-white/50">({g.status})</span>
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-white/60">Waiting for the first state from the switcher…</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(["away", "home"] as Team[]).map((team) => {
                const ts = team === "away" ? g?.away : g?.home;
                return (
                  <div key={team} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <span className="text-xs font-semibold uppercase text-white/80">{ts?.abbreviation ?? (team === "away" ? "Away" : "Home")}</span>
                    <div className="flex items-center gap-1.5">
                      <Btn onClick={() => send({ action: "score.add", team, n: -1 })} className="px-2.5 py-1">−</Btn>
                      <span className="w-7 text-center text-lg font-extrabold tabular-nums">{ts?.score ?? 0}</span>
                      <Btn tone="green" onClick={() => send({ action: "score.add", team, n: 1 })} className="px-2.5 py-1">+</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn onClick={() => send({ action: "count", which: "ball" })}>Ball</Btn>
              <Btn onClick={() => send({ action: "count", which: "strike" })}>Strike</Btn>
              <Btn tone="amber" onClick={() => send({ action: "count", which: "out" })}>Out</Btn>
              <Btn onClick={() => send({ action: "count", which: "reset" })}>Reset count</Btn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <Btn onClick={() => send({ action: "inning", dir: "prev" })}>− Inning</Btn>
              <Btn onClick={() => send({ action: "inning", dir: "next" })}>+ Inning</Btn>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-white/55">Bases</span>
              <Btn tone={g?.bases.first ? "blue" : "default"} active={!!g?.bases.first} onClick={() => send({ action: "bases.toggle", base: "first" })}>1B</Btn>
              <Btn tone={g?.bases.second ? "blue" : "default"} active={!!g?.bases.second} onClick={() => send({ action: "bases.toggle", base: "second" })}>2B</Btn>
              <Btn tone={g?.bases.third ? "blue" : "default"} active={!!g?.bases.third} onClick={() => send({ action: "bases.toggle", base: "third" })}>3B</Btn>
              <Btn onClick={() => send({ action: "bases.clear" })}>Clear</Btn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <Btn tone="green" onClick={() => send({ action: "game", lifecycle: "start" })}>Start</Btn>
              <Btn onClick={() => send({ action: "game", lifecycle: "pause" })}>Pause</Btn>
              <Btn onClick={() => send({ action: "game", lifecycle: "resume" })}>Resume</Btn>
              <Btn tone="amber" onClick={() => send({ action: "game", lifecycle: "end" })}>End</Btn>
              <Btn onClick={() => send({ action: "game", lifecycle: "reset" })}>Reset</Btn>
            </div>
          </Section>

          {/* graphics + overlay */}
          <Section title="Graphics & overlay">
            <LowerThirdControls send={send} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-white/55">Show</span>
              {(["standings", "other-games", "commercial"] as const).map((k) => (
                <Btn key={k} onClick={() => send({ action: "graphic.show", kind: k })}>{k}</Btn>
              ))}
              <Btn tone="amber" onClick={() => send({ action: "graphic.clear" })}>Clear graphic</Btn>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-white/55">Overlay</span>
              {(["topbar", "lowerthird", "sidebar"] as const).map((l) => (
                <Btn key={l} tone={snap?.overlay.layout === l ? "blue" : "default"} active={snap?.overlay.layout === l} onClick={() => send({ action: "overlay.layout", layout: l })}>{l}</Btn>
              ))}
              <Btn tone={snap?.overlay.visible ? "green" : "amber"} onClick={() => send({ action: "overlay.visible", visible: !snap?.overlay.visible })}>{snap?.overlay.visible ? "Visible" : "Hidden"}</Btn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <Btn tone={snap?.break.on ? "amber" : "default"} active={!!snap?.break.on} onClick={() => send({ action: "break", on: !snap?.break.on })}>Break {snap?.break.on ? "on" : "off"}</Btn>
            </div>
          </Section>

          {/* diagnostics */}
          <Section title="Diagnostics">
            <div className="flex items-center gap-2">
              <Btn onClick={() => send({ action: "ping" })}>Ping switcher</Btn>
              {pong && <span className="text-xs font-semibold text-green-300">pong ✓</span>}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-white/55">Raw state snapshot</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-white/60">{snap ? JSON.stringify(snap, null, 2) : "— none yet —"}</pre>
            </details>
          </Section>
        </>
      )}
    </div>
  );
}
