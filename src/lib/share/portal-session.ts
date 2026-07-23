import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/** Signed httpOnly session cookie for external portal users (recipients). */
export const PORTAL_COOKIE = "tms_portal";
const ALG = "HS256";
const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export async function createPortalToken(email: string): Promise<string> {
  return new SignJWT({ email: email.toLowerCase() }).setProtectedHeader({ alg: ALG }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}

/** The signed-in portal user's email, or null. */
export async function portalEmail(): Promise<string | null> {
  try {
    const c = (await cookies()).get(PORTAL_COOKIE)?.value;
    if (!c) return null;
    const { payload } = await jwtVerify(c, secret());
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function setPortalCookie(email: string): Promise<void> {
  const token = await createPortalToken(email);
  (await cookies()).set(PORTAL_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function clearPortalCookie(): Promise<void> {
  (await cookies()).set(PORTAL_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
