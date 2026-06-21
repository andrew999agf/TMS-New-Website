import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getSession } from "@/lib/auth";
import { mintControlToken } from "@/lib/patriot/token";
import { OperatorConsole } from "../control/OperatorConsole";

export const metadata: Metadata = {
  title: "Switchboard · Patriot Series Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SwitchboardAdmin() {
  const session = await getSession();
  const operatorToken = mintControlToken("operator") ?? "";
  const switcherToken = mintControlToken("switcher", 24 * 60 * 60) ?? "";
  const wsUrl = process.env.PATRIOT_WS_URL ?? "";
  const whipUrl = process.env.PATRIOT_WHIP_URL ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Switchboard Operator</h1>
          <p className="mt-1 text-sm text-white/55">
            {session ? `Signed in as ${session.name}. ` : ""}Control channel below.
          </p>
        </div>
        <a
          href="https://patriot-series-scoreboard-webbased.vercel.app/switchboard"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
        >
          <ExternalLink size={15} /> Open Switchboard
        </a>
      </div>
      <OperatorConsole wsUrl={wsUrl} operatorToken={operatorToken} switcherToken={switcherToken} whipUrl={whipUrl} />
    </div>
  );
}
