import type { ReactNode } from "react";
import Link from "next/link";
import { Lock, LogIn } from "lucide-react";
import { getSession } from "@/lib/auth";
import { PatriotAdminSidebar } from "./PatriotAdminSidebar";
import styles from "../patriot.module.css";

/**
 * Patriot admin shell. Self-gates on the session (the host-routed /admin on
 * patriotseriestexas.com isn't covered by the firm middleware's auth, so we
 * check here), then renders the sidebar + the active tab.
 */
export default async function PatriotAdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    return (
      <div className={`${styles.page} flex min-h-screen flex-col items-center justify-center px-5`}>
        <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-white/[0.04] p-7 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
            <Lock size={20} className="text-blue-300" />
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-xl font-bold">Admin sign-in required</h1>
          <p className="mt-1 text-xs text-white/60">Sign in to manage the Patriot Series site.</p>
          <Link
            href="/admin/login"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            <LogIn size={15} /> Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} flex min-h-screen flex-col lg:flex-row`}>
      <PatriotAdminSidebar name={session.name} />
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
