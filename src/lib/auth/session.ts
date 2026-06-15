import { SignJWT, jwtVerify } from "jose";

/**
 * Session tokens — signed JWTs in an httpOnly cookie. `jose` is used so the
 * same verification works in the Edge middleware and in Node server actions.
 */

export const SESSION_COOKIE = "tms_session";
const ALG = "HS256";
const MAX_AGE = 60 * 60 * 8; // 8 hours

export type SessionPayload = {
  sub: string; // admin id
  email: string;
  name: string;
  role: string;
  permissions?: string[];
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
