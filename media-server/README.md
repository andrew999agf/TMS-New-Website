# Patriot Series 250 — home media server (MediaMTX + Cloudflare Tunnel)

Runs the **video** server on your home computer for $0/month. Cloudflare gives
the free HTTPS front door (Tunnel — no public IP, no paid VPS); your PC runs
MediaMTX, which ingests the operator's **WHIP** feed and serves **WHEP** playback
to the website.

```
operator switcher ──WHIP──▶  your home PC (MediaMTX)  ──WHEP──▶  website player
                              ▲ HTTPS signaling via Cloudflare Tunnel
                              ▲ WebRTC media via one router port-forward (UDP 8189)
```

The **control** channel (scoreboard/commands) is separate and already on
Cloudflare Workers — see `../control-worker`. Nothing about control runs here.

---

## What you need
- This computer left on during broadcasts, with **Docker Desktop** (Windows/Mac)
  or Docker Engine (Linux) installed.
- A **domain on Cloudflare** (you have these). We'll use a subdomain, e.g.
  `live.startmanaging-legal.com`.
- Access to your **home router** (to forward one port) and a home internet
  connection that is **not behind CGNAT** (most cable/fiber are fine; see
  Troubleshooting if media won't connect).

---

## Step 1 — Create the Cloudflare Tunnel (in the dashboard, ~3 min)
1. Cloudflare dashboard → **Zero Trust** → **Networks → Tunnels** → **Create a
   tunnel** → type **Cloudflared** → name it `patriot-live` → **Save**.
2. On the install screen, **copy the tunnel token** (the long string after
   `--token` in the shown command). You don't need to run anything here — Docker
   will use this token. Click **Next**.
3. **Public hostname** tab → **Add a public hostname**:
   - Subdomain: `live`  · Domain: your domain · Path: leave blank
   - Service: **Type** `HTTP` · **URL** `localhost:8889`
   - **Save**.
   This auto-creates the HTTPS DNS record for `live.<your-domain>`.

## Step 2 — Find your public IP and forward one port
WebRTC *media* can't go through the tunnel, so it needs a direct path.
1. Get your home public IP: visit https://ifconfig.me (note the number).
2. In your **router**, add a **port forward**: external **UDP 8189** → this
   computer's local IP, port **8189**. (Also forward **TCP 8189** for a fallback
   on restrictive viewer networks.)

## Step 3 — Configure & run
1. Copy `.env.example` to `.env` and fill in:
   - `TUNNEL_TOKEN` — from Step 1.2
   - `PUBLIC_IP` — from Step 2.1
2. In `mediamtx.yml`, change `CHANGE_ME_PUBLISH_SECRET` to your own password.
3. Start it:
   ```bash
   docker compose up -d
   ```
   Check it's healthy: `docker compose logs -f` (cloudflared should say
   "Registered tunnel connection"; mediamtx should be listening).

---

## The two URLs this produces
- **WHIP — give to the operator** (their switcher's publish target):
  `https://live.<your-domain>/patriot/whip?user=publisher&pass=<your-secret>`
- **WHEP — give to me for the site** (`PATRIOT_WHEP_URL`):
  `https://live.<your-domain>/patriot/whep`

Once `PATRIOT_WHEP_URL` is set on the website, the live page plays automatically.

---

## Troubleshooting
- **Page connects but no video / "WHEP 200 but black":** the WebRTC media path is
  blocked. Re-check the **UDP 8189 port-forward** and that `PUBLIC_IP` in `.env`
  matches your *current* public IP (residential IPs change occasionally —
  re-run `docker compose up -d` after updating it).
- **Can't port-forward / ISP uses CGNAT:** WebRTC won't reach you. The fix is
  HLS playback, which rides entirely over the tunnel with **no port-forward**
  (higher latency, ~3–6s). Tell me and I'll enable HLS here and switch the site
  player over.
- **Keep the PC awake:** disable sleep during broadcasts, or the feed drops.
