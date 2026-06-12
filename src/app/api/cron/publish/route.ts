import { NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/**
 * Publishes any scheduled post whose publishAt has arrived. Hit by Vercel Cron
 * (see vercel.json). Protected by CRON_SECRET — Vercel sends it as a Bearer
 * token in the Authorization header.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!db) return NextResponse.json({ ok: true, published: 0, note: "no database" });

  const now = new Date();
  const due = await db
    .update(blogPosts)
    .set({ status: "published", publishedAt: now })
    .where(and(eq(blogPosts.status, "scheduled"), lte(blogPosts.publishAt, now)))
    .returning({ slug: blogPosts.slug });

  if (due.length > 0) {
    revalidatePath("/blog");
    revalidatePath("/");
    for (const p of due) revalidatePath(`/blog/${p.slug}`);
  }

  return NextResponse.json({ ok: true, published: due.length, slugs: due.map((d) => d.slug) });
}
