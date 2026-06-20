import crypto from "crypto";

/**
 * Mints the HMAC tokens the control worker verifies (Channel B). Format must
 * match control-worker/src/index.ts verifyToken():
 *
 *   base64url(JSON {role, exp}) + "." + base64url(HMAC_SHA256(payloadB64, secret))
 *
 * The secret is the shared CONTROL_SECRET (same value set on the worker). Server
 * side only — never ship the secret to the browser.
 */
export type ControlRole = "switcher" | "operator";

const b64url = (b: Buffer) => b.toString("base64url");

export function mintControlToken(
  role: ControlRole,
  ttlSeconds = 12 * 60 * 60,
  secret = process.env.CONTROL_SECRET ?? "",
): string | null {
  if (!secret) return null;
  const payload = { role, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

/** Is Channel B configured enough to mint tokens + connect? */
export function controlConfigured(): boolean {
  return Boolean(process.env.CONTROL_SECRET) && Boolean(process.env.PATRIOT_WS_URL);
}
