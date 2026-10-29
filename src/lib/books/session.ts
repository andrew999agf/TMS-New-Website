import { SignJWT, jwtVerify } from "jose";

/**
 * StartBookkeeping's OWN session: a separate cookie from the admin's, signed
 * the same way (jose, so the Edge middleware can verify it). Short-lived —
 * two hours — and only ever issued after the emailed sign-in code checks out.
 */
export const BOOKS_COOKIE = "sb_session";
export const BOOKS_MAX_AGE = 60 * 60 * 2;
const ALG = "HS256";

export type BooksSession = {
  sub: string; // sb_users.id
  email: string;
  name: string;
  role: string; // owner | bookkeeper | viewer
  companyId: number;
  mfa: true;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export async function createBooksToken(payload: BooksSession): Promise<string> {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: ALG }).setIssuedAt().setExpirationTime(`${BOOKS_MAX_AGE}s`).sign(secret());
}

export async function verifyBooksToken(token: string): Promise<BooksSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.mfa !== true || typeof payload.email !== "string") return null;
    return payload as unknown as BooksSession;
  } catch {
    return null;
  }
}
