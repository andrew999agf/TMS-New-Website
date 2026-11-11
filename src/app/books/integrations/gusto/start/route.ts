import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getBooksSession, booksPublicBase } from "@/lib/books/auth";
import { gustoAuthorizeUrl, gustoConfigured, gustoRedirectUri } from "@/lib/books/gusto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings → "Connect Gusto": send the owner to Gusto's own sign-in page. */
export async function GET() {
  const base = await booksPublicBase();
  const s = await getBooksSession();
  if (!s) return NextResponse.redirect(`${base}/login`);
  const back = (q: string) => NextResponse.redirect(`${base}/settings?${q}#connections`);
  if (s.role !== "owner") return back("gusto=error&why=" + encodeURIComponent("Only an owner can connect payroll."));
  if (!gustoConfigured()) return back("gusto=error&why=" + encodeURIComponent("The Gusto keys aren't set on the server yet."));
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("sb_gusto_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(gustoAuthorizeUrl(state, gustoRedirectUri(base)));
}
