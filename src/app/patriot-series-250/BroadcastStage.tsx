"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Loader2, Radio, Volume2 } from "lucide-react";
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from "livekit-client";
import { PatriotOverlay, type PatriotSnapshot } from "./PatriotOverlay";

/**
 * The live broadcast stage: one read-only connection to the control hub (as a
 * `viewer`) drives BOTH the video and the scoreboard:
 *
 *  - Video: the switcher publishes the PROGRAM into a LiveKit room (identity
 *    `program`); the room name rides on the Channel B snapshot (`livekitRoom`).
 *    We mint a short-lived subscribe-only token from our backend and attach the
 *    program track to the <video>.
 *  - Overlay: the same snapshot drives the switcher team's PatriotOverlay
 *    (scoreboard / lower-third / graphics), rendered on top.
 */
type Snap = PatriotSnapshot & { livekitRoom?: string };

function useViewerSnapshot(wsUrl: string): Snap | null {
  const [snap, setSnap] = useState<Snap | null>(null);
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
          const m = JSON.parse(typeof e.data === "string" ? e.data : "") as { type?: string; snapshot?: Snap };
          if (m?.type === "state" && m.snapshot) setSnap(m.snapshot);
        } catch { /* ignore non-JSON */ }
      };
      ws.onclose = () => { if (!closed) { retry = setTimeout(open, backoff); backoff = Math.min(backoff * 2, 8000); } };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };
    open();
    return () => { closed = true; if (retry) clearTimeout(retry); try { wsRef.current?.close(); } catch { /* ignore */ } };
  }, [wsUrl]);

  return snap;
}

type VideoStatus = "offline" | "connecting" | "live";

function useProgramVideo(room: string, videoRef: RefObject<HTMLVideoElement | null>): VideoStatus {
  const [status, setStatus] = useState<VideoStatus>("offline");

  useEffect(() => {
    if (!room) { setStatus("offline"); return; }
    let cancelled = false;
    let lkRoom: Room | null = null;

    const attach = (track: RemoteTrack, participant: RemoteParticipant) => {
      if (participant.identity !== "program") return; // ignore phone cameras
      if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
        if (videoRef.current) track.attach(videoRef.current);
        if (track.kind === Track.Kind.Video) setStatus("live");
      }
    };

    const connect = async () => {
      try {
        setStatus("connecting");
        const res = await fetch(`/api/patriot/livekit-token?room=${encodeURIComponent(room)}`);
        if (!res.ok) throw new Error(`token ${res.status}`);
        const { token, url } = (await res.json()) as { token?: string; url?: string };
        if (cancelled || !token || !url) { if (!cancelled) setStatus("offline"); return; }

        lkRoom = new Room({ adaptiveStream: true });
        lkRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attach(track, participant));
        lkRoom.on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("offline"); });
        await lkRoom.connect(url, token);
        if (cancelled) { lkRoom.disconnect(); return; }

        // Attach any program tracks already being published when we joined.
        lkRoom.remoteParticipants.forEach((p) => {
          if (p.identity !== "program") return;
          p.trackPublications.forEach((pub) => { if (pub.track) attach(pub.track, p); });
        });
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };
    connect();

    return () => { cancelled = true; try { lkRoom?.disconnect(); } catch { /* ignore */ } };
  }, [room, videoRef]);

  return status;
}

export function BroadcastStage({ wsUrl }: { wsUrl: string }) {
  const snap = useViewerSnapshot(wsUrl);
  const room = snap?.livekitRoom ?? "";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const status = useProgramVideo(room, videoRef);
  const [needsUnmute, setNeedsUnmute] = useState(true);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/12 bg-black shadow-2xl">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />
      {status !== "live" && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black/70 text-center">
          {status === "connecting" ? (
            <>
              <Loader2 size={26} className="animate-spin text-white/60" />
              <p className="mt-2 text-sm text-white/70">Connecting to the live feed…</p>
            </>
          ) : (
            <>
              <Radio size={26} className="text-white/50" />
              <p className="mt-2 text-sm font-medium text-white/70">Stream offline</p>
              <p className="mt-1 text-[11px] text-white/55">The broadcast will appear here when the operator goes live.</p>
            </>
          )}
        </div>
      )}
      {status === "live" && needsUnmute && (
        <button
          onClick={() => {
            const v = videoRef.current;
            if (v) { v.muted = false; v.play?.().catch(() => {}); }
            setNeedsUnmute(false);
          }}
          className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-black/90"
        >
          <Volume2 size={14} /> Tap for sound
        </button>
      )}
      <PatriotOverlay snapshot={snap} />
    </div>
  );
}
