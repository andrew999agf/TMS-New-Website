# MediaMTX media server — Patriot Series 250 video (self-hosted, Channel A)

A single small server that ingests the operator's **WHIP** feed and serves
**WHEP** low-latency playback to the website. This is the free-of-platform-fees
route: you only pay for a small VPS (or use an always-free one). The control hub
stays on Cloudflare Workers.

```
operator switcher ──WHIP──▶  MediaMTX (this server)  ──WHEP──▶  website player
                                   (TLS via Caddy)
```

## What you need
- A small Linux VPS with a public IP. Free option: **Oracle Cloud Always Free**
  (ARM). Paid-but-cheap: Hetzner/DigitalOcean (~$4–6/mo). Ubuntu is fine.
- A **subdomain** you control, e.g. `live.startmanaging-legal.com`, with an
  **A record** pointing at the VPS public IP. (Browsers require HTTPS for WHEP,
  and Caddy gets a free Let's Encrypt cert for that subdomain automatically.)

## Setup (once)
1. Point the subdomain's A record at the VPS IP and wait for it to resolve.
2. Copy this `media-server/` folder onto the VPS.
3. Edit **`mediamtx.yml`**: set `webrtcAdditionalHosts` to your subdomain, and
   change the `publisher` password.
4. Edit **`Caddyfile`**: set your subdomain and your email.
5. Open the firewall: **TCP 80, 443** and **UDP+TCP 8189**.
   (Ubuntu ufw: `sudo ufw allow 80,443/tcp && sudo ufw allow 8189`.
   On Oracle Cloud also open these in the VCN Security List.)
6. Install Docker, then from this folder: `docker compose up -d`.

## The two URLs this produces
- **WHIP (give to the operator):**
  `https://live.<your-domain>/patriot/whip?user=publisher&pass=<your-secret>`
  (The credentials are in the URL, so the operator's `Authorization: Bearer`
  field can be left blank — MediaMTX authenticates from the query.)
- **WHEP (give to me → website `PATRIOT_WHEP_URL`):**
  `https://live.<your-domain>/patriot/whep`
  (Public/anonymous read so anyone can watch the broadcast.)

The website's `WhepPlayer` already speaks standard WHEP, so once `PATRIOT_WHEP_URL`
is set to that URL the live page just works.

## Notes
- `network_mode: host` is used so WebRTC's ICE (UDP/TCP 8189) works without port
  juggling. Linux host required.
- HLS (for very large audiences) is available from MediaMTX too; we can expose it
  later if a tournament needs to scale beyond what direct WebRTC handles.
