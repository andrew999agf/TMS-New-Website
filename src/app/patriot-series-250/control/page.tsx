import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, LogIn } from "lucide-react";
import { getSession } from "@/lib/auth";
import { mintControlToken } from "@/lib/patriot/token";
import { OperatorConsole } from "./OperatorConsole";
import styles from "../patriot.module.css";

export const metadata: Metadata = {
  title: "Switchboard Operator · Patriot Series 250",
  description: "Operator console for the Patriot Series 250 broadcast.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.page} flex min-h-screen flex-col`}>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/patriot-series-250" className="flex items-center gap-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white">
            <ArrowLeft size={14} /> Live feed
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">Operator · Patriot Series 250</span>
          <span className="w-16" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">{children}</main>
    </div>
  );
}

/**
 * Patriot Series 250 — operator console. Gated behind the existing admin
 * session (the logged-in admin is the operator for now; a dedicated operator
 * login can be added later). When signed in it mints the Channel B tokens and
 * connects to the control hub.
 */
export default async function OperatorConsolePage() {
  const session = await getSession();

  if (!session) {
    return (
      <Frame>
        <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-white/12 bg-white/[0.04] p-7 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
            <Lock size={20} className="text-blue-300" />
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-xl font-bold">Operator sign-in required</h1>
          <p className="mt-1 text-xs text-white/45">Sign in to control the live broadcast.</p>
          <Link
            href="/admin/login"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            <LogIn size={15} /> Sign in
          </Link>
        </div>
      </Frame>
    );
  }

  const operatorToken = mintControlToken("operator") ?? "";
  const switcherToken = mintControlToken("switcher", 24 * 60 * 60) ?? "";
  const wsUrl = process.env.PATRIOT_WS_URL ?? "";
  const whipUrl = process.env.PATRIOT_WHIP_URL ?? "";

  return (
    <Frame>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Switchboard Operator</h1>
        <p className="mt-1 text-sm text-white/50">Signed in as {session.name}. Control channel below.</p>
      </div>
      <OperatorConsole wsUrl={wsUrl} operatorToken={operatorToken} switcherToken={switcherToken} whipUrl={whipUrl} />
    </Frame>
  );
}
