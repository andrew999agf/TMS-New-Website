import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Encryption for the few secrets StartBookkeeping has to keep (an outside
 * service's access tokens). AES-256-GCM; the key comes from SB_SECRET_KEY, or
 * from AUTH_SECRET when that isn't set. Nothing here is ever sent to a browser.
 */
function key(): Buffer {
  const s = process.env.SB_SECRET_KEY || process.env.AUTH_SECRET;
  if (!s) throw new Error("No encryption key: set SB_SECRET_KEY or AUTH_SECRET.");
  return createHash("sha256").update(`startbookkeeping:${s}`).digest();
}

export function seal(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function unseal(sealed: string): string {
  if (!sealed) return "";
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Stored secret is not readable.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
