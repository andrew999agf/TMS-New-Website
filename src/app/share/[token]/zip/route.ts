import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareFiles, shareAccessLog } from "@/db/schema";
import { resolveRecipient } from "@/lib/share/access";
import { shareCan } from "@/lib/share/types";
import { zipResponse } from "@/lib/share/zip";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Download every document in the share as one ZIP (folder structure preserved). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const ctx = await resolveRecipient(token);
  if (!ctx || !shareCan(ctx.rec.permission, "download")) return NextResponse.json({ error: "This link is no longer active." }, { status: 403 });

  const idSet = new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => Number(s.trim())).filter(Number.isFinite));
  let files = await db.select().from(shareFiles).where(eq(shareFiles.folderId, ctx.folder.id));
  if (idSet.size > 0) files = files.filter((f) => idSet.has(f.id));
  if (files.length === 0) return NextResponse.json({ error: "No documents to download." }, { status: 404 });
  try { await db.insert(shareAccessLog).values({ folderId: ctx.folder.id, recipientId: ctx.rec.id, action: "download" }); } catch { /* best-effort */ }

  const zipName = `${(ctx.folder.name || "documents").replace(/[\\/:*?"<>|]/g, "-")}.zip`;
  return zipResponse(files.map((f) => ({ url: f.url, name: f.filename })), zipName);
}
