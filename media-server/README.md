# Patriot Series 250 — home media server (MediaMTX + Cloudflare Tunnel)

Runs the **video** server on your home computer for $0/month. MediaMTX (in Docker)
ingests the operator's **WHIP** feed and serves **WHEP** playback; a Cloudflare
Tunnel (the `cloudflared` program, run natively) gives it a free HTTPS address
with no public IP and no paid VPS.

```
operator switcher ──WHIP──▶  home PC: MediaMTX (Docker)  ──WHEP──▶  website player
                              ▲ HTTPS signaling via cloudflared tunnel
                              ▲ WebRTC media via one router port-forward (UDP 8189)
```

The **control** channel (scoreboard/commands) is separate and already on
Cloudflare Workers — see `../control-worker`.

---

## 1. Start MediaMTX (Docker)
1. In `mediamtx.yml`, change `CHANGE_ME_PUBLISH_SECRET` to your own password.
2. Copy `.env.example` to `.env` and set `PUBLIC_IP` (from https://ifconfig.me).
3. Start it:
   ```bash
   docker compose up -d
   docker compose logs -f      # confirm it's listening; Ctrl+C to stop logs
   ```

## 2. Forward one port on your router
WebRTC *media* can't go through the tunnel, so it needs a direct path.
Forward external **UDP 8189** (and **TCP 8189** as a fallback) to this computer's
local IP, port **8189**.

## 3. Cloudflare Tunnel (cloudflared, native — no Zero Trust, no card)
```powershell
winget install --id Cloudflare.cloudflared      # install
cloudflared tunnel login                        # browser: pick your domain
cloudflared tunnel create patriot-live          # prints a UUID + credentials path
cloudflared tunnel route dns patriot-live live.<your-domain>
```
Create a config file at `C:\Users\<you>\.cloudflared\config.yml`:
```yaml
tunnel: patriot-live
credentials-file: C:\Users\<you>\.cloudflared\<UUID>.json
ingress:
  - hostname: live.<your-domain>
    service: http://localhost:8889
  - service: http_status:404
```
Then run it:
```powershell
cloudflared tunnel run patriot-live
```
(Optionally `cloudflared service install` to run it in the background on boot.)

---

## The two URLs this produces
- **WHIP — give to the operator** (their switcher's publish target):
  `https://live.<your-domain>/patriot/whip?user=publisher&pass=<your-secret>`
- **WHEP — for the website** (`PATRIOT_WHEP_URL`):
  `https://live.<your-domain>/patriot/whep`

---

## Troubleshooting
- **Page connects but no video:** the media path is blocked. Re-check the
  **UDP 8189 port-forward** and that `PUBLIC_IP` in `.env` matches your *current*
  public IP (re-run `docker compose up -d` after changing it).
- **Can't port-forward / ISP uses CGNAT:** WebRTC won't reach you. Fallback is
  HLS playback, which rides entirely over the tunnel with no port-forward (higher
  latency). Ask and I'll enable HLS here and switch the site player.
- **Keep the PC awake** during broadcasts (disable sleep), or the feed drops.
