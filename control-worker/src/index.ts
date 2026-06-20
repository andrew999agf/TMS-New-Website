/**
 * Patriot Series 250 — Control Hub (Cloudflare Worker + Durable Object).
 *
 * A transparent, token-authed WebSocket relay between three kinds of clients in
 * one tournament "room":
 *
 *   • switcher  — the operator's desktop app, DIALS OUT here (so NAT is a
 *                 non-issue). Pushes {type:"state"} snapshots, {type:"ack"},
 *                 {type:"pong"}, heartbeats. Receives commands.
 *   • operator  — the logged-in web control panel. Sends commands (forwarded
 *                 verbatim to the switcher). Receives state/ack/presence.
 *   • viewer    — the public /patriot-series-250 page. Receives state only
 *                 (to render the scoreboard overlay). Cannot send commands.
 *
 * The relay never parses command internals (the protocol stays on the
 * switcher's side, per the integration spec) — it only routes by message type
 * coming FROM the switcher. The latest state snapshot is cached so any client
 * that joins mid-broadcast immediately gets the current picture.
 *
 * Connect:  wss://<worker>/control?role=switcher|operator|viewer&token=<jwt-ish>
 * Tokens are HMAC-signed by the website with the shared CONTROL_SECRET; viewers
 * need no token.
 */

export interface Env {
  ROOM: DurableObjectNamespace;
  CONTROL_SECRET: string;
}

type Role = "switcher" | "operator" | "viewer";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/control") {
      const id = env.ROOM.idFromName("main"); // single tournament room
      return env.ROOM.get(id).fetch(req);
    }
    return new Response("not found", { status: 404 });
  },
};

export class ControlRoom {
  private env: Env;
  private switchers = new Set<WebSocket>();
  private operators = new Set<WebSocket>();
  private viewers = new Set<WebSocket>();
  private lastState: string | null = null;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(req.url);
    const role = (url.searchParams.get("role") || "viewer") as Role;
    const token = url.searchParams.get("token") || "";

    // Viewers are public/read-only; switcher + operator must present a valid,
    // unexpired token whose role matches the requested role.
    if (role === "switcher" || role === "operator") {
      const claims = await verifyToken(token, this.env.CONTROL_SECRET);
      if (!claims || claims.role !== role) {
        return new Response("unauthorized", { status: 401 });
      }
    } else if (role !== "viewer") {
      return new Response("bad role", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.set(role).add(server);

    server.addEventListener("message", (e: MessageEvent) => this.onMessage(role, server, e.data));
    const drop = () => this.onClose(role, server);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    // Bring new control-side clients up to speed immediately.
    if ((role === "operator" || role === "viewer") && this.lastState) {
      server.send(this.lastState);
    }
    if (role === "operator") {
      server.send(JSON.stringify({ type: "presence", switcher: this.switchers.size > 0 }));
    }
    if (role === "switcher") {
      this.broadcast(this.operators, JSON.stringify({ type: "presence", switcher: true }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(role: Role, ws: WebSocket, data: string | ArrayBuffer) {
    const raw = typeof data === "string" ? data : "";
    if (!raw) return;

    if (role === "switcher") {
      // Route by message type; cache state for late joiners; relay everything
      // else (acks, pongs, heartbeats) to the operators.
      let type = "";
      try {
        type = JSON.parse(raw)?.type ?? "";
      } catch {
        return;
      }
      if (type === "state") {
        this.lastState = raw;
        this.broadcast(this.operators, raw);
        this.broadcast(this.viewers, raw);
      } else {
        // ack / pong / heartbeat / hello / anything else → operators
        this.broadcast(this.operators, raw);
      }
      return;
    }

    if (role === "operator") {
      // Commands + pings go verbatim to the switcher. If it's offline, fail the
      // command's ack so the panel can reconcile (UI is optimistic).
      if (this.switchers.size === 0) {
        try {
          const m = JSON.parse(raw);
          if (m?.id != null) ws.send(JSON.stringify({ type: "ack", id: m.id, ok: false, error: "switcher offline" }));
        } catch {
          /* ignore */
        }
        return;
      }
      this.broadcast(this.switchers, raw);
      return;
    }

    // viewer → read-only, ignore anything sent.
  }

  private onClose(role: Role, ws: WebSocket) {
    this.set(role).delete(ws);
    if (role === "switcher" && this.switchers.size === 0) {
      this.broadcast(this.operators, JSON.stringify({ type: "presence", switcher: false }));
    }
  }

  private set(role: Role): Set<WebSocket> {
    return role === "switcher" ? this.switchers : role === "operator" ? this.operators : this.viewers;
  }

  private broadcast(targets: Set<WebSocket>, msg: string) {
    for (const ws of targets) {
      try {
        ws.send(msg);
      } catch {
        targets.delete(ws);
      }
    }
  }
}

/* ---- HMAC token verification (mirrors the website's minting) ------------- */

type Claims = { role: Role; exp: number };

async function verifyToken(token: string, secret: string): Promise<Claims | null> {
  try {
    const dot = token.indexOf(".");
    if (dot < 0) return null;
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as Claims;
    if (!claims?.role || typeof claims.exp !== "number") return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
