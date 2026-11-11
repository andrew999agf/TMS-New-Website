import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { getBooksSession, booksPublicBase, sbAudit_ } from "@/lib/books/auth";
import { completeGustoConnection, gustoRedirectUri } from "@/lib/books/gusto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Gusto sends the owner back here after they approve (or decline). */
export async function GET(req: Request) {
  const base = await booksPublicBase();
  const s = await getBooksSession();
  if (!s) return NextResponse.redirect(`${base}/login`);
  const back = (q: string) => NextResponse.redirect(`${base}/settings?${q}#connections`);
  const fail = (why: string) => back("gusto=error&why=" + encodeURIComponent(why));
  if (s.role !== "owner") return fail("Only an owner can connect payroll.");

  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("sb_gusto_state")?.value ?? "";
  jar.set("sb_gusto_state", "", { httpOnly: true, path: "/", maxAge: 0 });
  const got = url.searchParams.get("state") ?? "";
  const same = expected.length > 0 && expected.length === got.length && timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  if (!same) return fail("That sign-in didn't start here. Click Connect Gusto again.");
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "You declined the request on Gusto's page, so nothing was connected." : `Gusto reported: ${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
  const code = url.searchParams.get("code");
  if (!code) return fail("Gusto didn't send a sign-in code.");

  try {
    const r = await completeGustoConnection(s.companyId, code, gustoRedirectUri(base), s.email);
    await sbAudit_(s.companyId, s.email, "create", "integration", "gusto", `Connected Gusto${r.name ? ` (${r.name})` : ""} — read-only`);
    return back("gusto=connected");
  } catch (e) {
    await sbAudit_(s.companyId, s.email, "update", "integration", "gusto", `Gusto connection failed: ${String((e as Error).message).slice(0, 200)}`);
    return fail(String((e as Error).message).slice(0, 200));
  }
}
