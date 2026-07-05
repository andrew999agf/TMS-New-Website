import type { Metadata } from "next";
import { hasDb } from "@/db";
import { getPageVisibility } from "@/lib/patriot/visibility";
import { PatriotVisibilityForm } from "./PatriotVisibilityForm";
import { requirePatriotSignIn } from "../require";

export const metadata: Metadata = { title: "Visibility · Patriot Series Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VisibilityAdmin() {
  await requirePatriotSignIn();
  const vis = await getPageVisibility();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Page Visibility</h1>
      <p className="mt-1 text-sm text-white/55">Choose which public pages are live on patriotseriestexas.com.</p>
      {!hasDb && <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs text-amber-100/80">Database not connected yet — changes can&apos;t be saved.</div>}
      <div className="mt-6">
        <PatriotVisibilityForm initial={vis} />
      </div>
    </div>
  );
}
