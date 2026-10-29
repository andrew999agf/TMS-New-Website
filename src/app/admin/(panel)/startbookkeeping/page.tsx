import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AdminHeader } from "@/components/admin/AdminShell";
import { StartBookkeepingBridge } from "@/components/admin/StartBookkeepingBridge";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { canAccessPath } from "@/lib/admin-sections";
import { booksHomeUrl } from "@/lib/books/host";
import { myBooksLogin } from "./actions";

export const dynamic = "force-dynamic";

export default async function StartBookkeepingPage() {
  const session = await requireAdmin();
  if (!canAccessPath("/admin/startbookkeeping", session.role, session.permissions)) notFound();
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").trim();
  const mine = await myBooksLogin();
  return (
    <>
      <AdminHeader title="StartBookkeeping" description="The firm's books, trust, payroll and tax reporting — its own product, its own login." />
      <div className="max-w-3xl p-6">
        <StartBookkeepingBridge booksUrl={booksHomeUrl(host)} hasLogin={!!mine?.exists} lastLoginAt={mine?.lastLoginAt ?? null} fullAdmin={isFullAdmin(session.role)} email={session.email} />
      </div>
    </>
  );
}
