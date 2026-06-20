"use client";

import { useEffect, useRef, useState } from "react";
import { Tv, Loader2, AlertTriangle } from "lucide-react";

/**
 * WHEP player (Channel A playback). Pulls the live PROGRAM feed the operator
 * publishes via WHIP, played peer-to-peer for ~sub-second latency. Standard
 * WHEP: POST our SDP offer to the WHEP URL, set the answer, attach the stream.
 *
 * `url` is the Cloudflare Stream Live WHEP playback URL (passed from the server;
 * not secret). Empty → friendly placeholder. Auto-retries on drop.
 */
type Phase = "idle" | "connecting" | "live" | "error";

export function WhepPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let backoff = 1000;

    const stop = () => {
      try { pcRef.current?.close(); } catch { /* ignore */ }
      pcRef.current = null;
    };

    const connect = async () => {
      stop();
      setPhase("connecting");
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
        pcRef.current = pc;
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) videoRef.current.srcObject = e.streams[0];
        };
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") { setPhase("live"); backoff = 1000; }
          else if ((s === "failed" || s === "disconnected" || s === "closed") && !cancelled) scheduleRetry();
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });
        if (!res.ok) throw new Error(`WHEP ${res.status}`);
        const answer = await res.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } catch {
        if (!cancelled) scheduleRetry();
      }
    };

    const scheduleRetry = () => {
      setPhase("error");
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 8000);
    };

    connect();
    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      stop();
    };
  }, [url]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/12 bg-black shadow-2xl">
      {url ? (
        <>
          <video ref={videoRef} autoPlay playsInline muted controls className="absolute inset-0 h-full w-full bg-black" />
          {phase !== "live" && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center">
              {phase === "error" ? (
                <>
                  <AlertTriangle size={26} className="text-amber-300" />
                  <p className="mt-2 text-sm text-white/70">Reconnecting to the feed…</p>
                </>
              ) : (
                <>
                  <Loader2 size={26} className="animate-spin text-white/60" />
                  <p className="mt-2 text-sm text-white/60">Connecting to the live feed…</p>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/5">
            <Tv size={28} className="text-white/60" />
          </div>
          <p className="mt-4 text-sm font-medium text-white/70">Video feed will appear here</p>
          <p className="mt-1 max-w-sm px-6 text-[11px] leading-relaxed text-white/60">
            16:9 · source 1920×1080. Waiting for the operator&apos;s WHIP publish via Cloudflare Stream Live.
          </p>
        </div>
      )}
    </div>
  );
}
