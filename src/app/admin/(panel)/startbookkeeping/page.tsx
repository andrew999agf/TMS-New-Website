import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AdminHeader } from "@/components/admin/AdminShell";
import { StartBookkeepingBridge } from "@/components/admin/StartBookkeepingBridge";
import { requireAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { booksHomeUrl } from "@/lib/books/host";
import { bridgeState } from "./actions";

export const dynamic = "force-dynamic";

export default async function StartBookkeepingPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/startbookkeeping", session.role, session.permissions)) notFound();
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").trim();
  const state = await bridgeState();
  return (
    <>
      <AdminHeader title="StartBookkeeping" description="The firm's books, trust, payroll and tax reporting — its own product, its own login." />
      <div className="max-w-3xl p-6">
        {state ? <StartBookkeepingBridge booksUrl={booksHomeUrl(host)} state={state} email={session.email} /> : <p className="text-sm text-[var(--c-ink-muted)]">Database not configured.</p>}
      </div>
    </>
  );
}
