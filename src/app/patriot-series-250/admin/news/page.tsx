import type { Metadata } from "next";
import { getSetting } from "@/lib/content";
import { hasDb } from "@/db";
import { isBlobConfigured } from "@/lib/blob";
import { PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS, type PatriotArticle } from "@/lib/patriot/settings";
import { PatriotNewsManager } from "./PatriotNewsManager";
import { requirePatriotSignIn } from "../require";

export const metadata: Metadata = {
  title: "News · Patriot Series Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function NewsAdmin() {
  await requirePatriotSignIn();
  const articles = await getSetting<PatriotArticle[]>(PATRIOT_NEWS_KEY, DEFAULT_PATRIOT_NEWS);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">News</h1>
      <p className="mt-1 text-sm text-white/55">
        Tournament articles for the public News page. Tag a story with a tournament year and it&apos;s linked from that
        year&apos;s row on Past Tournaments. Banner photos can be added anytime.
      </p>

      {(!hasDb || !isBlobConfigured()) && (
        <div className="mt-4 space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/80">
          {!hasDb && <p>Database isn&apos;t connected, so changes can&apos;t be saved yet.</p>}
          {!isBlobConfigured() && <p>Media storage isn&apos;t configured, so banner uploads won&apos;t work yet.</p>}
        </div>
      )}

      <div className="mt-6">
        <PatriotNewsManager initial={articles.length > 0 ? articles : DEFAULT_PATRIOT_NEWS} />
      </div>
    </div>
  );
}
