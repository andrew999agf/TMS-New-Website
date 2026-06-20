# Patriot Series 250 — Control Hub (Cloudflare Worker)

The real-time control channel (Channel B). A token-authed WebSocket relay between
the operator's desktop switcher (dial-out), the website operator panel, and the
public viewer overlay. Deployed separately from the website (Vercel can't host
WebSockets).

## One-time setup

```bash
cd control-worker
npm install
npx wrangler login                 # authenticates to your Cloudflare account
npx wrangler secret put CONTROL_SECRET   # paste a long random string
npm run deploy
```

`wrangler deploy` prints the public URL, e.g.
`https://patriot-control-hub.<your-subdomain>.workers.dev`.

The **WebSocket URL** is that host + `/control`:
`wss://patriot-control-hub.<your-subdomain>.workers.dev/control`

## CONTROL_SECRET

Set the **same** value here and as `CONTROL_SECRET` in the website's environment.
The website mints the operator + switcher tokens; this worker verifies them with
that shared secret. (Viewers need no token.)

## How clients connect

`wss://<host>/control?role=<switcher|operator|viewer>&token=<token>`

- `role=switcher` — the desktop app dials out with its switcher token.
- `role=operator` — the logged-in web panel (token issued after website login).
- `role=viewer` — the public page; no token; receives state only.

## What the relay does

- Caches the latest `{type:"state"}` snapshot and sends it to any operator/viewer
  the moment they connect (instant initial state).
- Forwards operator commands verbatim to the switcher (protocol stays on the
  switcher's side). If the switcher is offline, it fails that command's ack.
- Forwards the switcher's `ack` / `pong` / heartbeat to operators, and broadcasts
  `state` to operators + viewers.
- Emits `{type:"presence",switcher:bool}` so panels know if the switcher is live.

## Token format (for the website minter)

`base64url(JSON {role, exp}) + "." + base64url(HMAC-SHA256(payloadB64, CONTROL_SECRET))`
