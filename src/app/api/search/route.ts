import { NextResponse } from "next/server";
import { searchSite } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const results = await searchSite(q, 12);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
