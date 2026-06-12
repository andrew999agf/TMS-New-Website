import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB (covers banner video clips)
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Media storage not configured (BLOB_READ_WRITE_TOKEN missing)." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 413 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 415 });
  }

  const folder = String(form.get("folder") ?? "uploads");
  const blob = await put(`${folder}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  let id: number | null = null;
  if (db) {
    try {
      const [row] = await db
        .insert(mediaAssets)
        .values({
          url: blob.url,
          pathname: blob.pathname,
          kind: file.type.startsWith("video") ? "video" : "image",
          sizeBytes: file.size,
          folder,
        })
        .returning({ id: mediaAssets.id });
      id = row?.id ?? null;
    } catch {
      /* metadata persistence is best-effort */
    }
  }

  return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname, id });
}
