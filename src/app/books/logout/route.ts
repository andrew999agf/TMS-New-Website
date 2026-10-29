import { NextResponse } from "next/server";
import { booksLogout, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await booksLogout();
  const base = booksBase(await requestHost());
  return NextResponse.redirect(new URL(`${base}/login`, req.url));
}
