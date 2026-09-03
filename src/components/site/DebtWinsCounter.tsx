import { ShieldCheck } from "lucide-react";
import { getDebtDefenseStats } from "@/lib/debt-wins";

/**
 * The debt-defense scoreboard — collection suits beaten and the dollars that
 * were claimed. One source of truth (the admin's Debt Defense Wins log), so
 * this same component can later sit on the Results page too without a second
 * counter. Renders nothing until the first win is logged.
 */
export async function DebtWinsCounter() {
  const { count, total } = await getDebtDefenseStats();
  if (count === 0) return null;
  const money = "$" + Math.round(total).toLocaleString("en-US");
  return (
    <section className="mb-12 rounded-lg border border-[var(--c-accent)]/30 bg-[var(--c-accent)]/[0.05] p-6 lg:p-8">
      <p className="flex items-center gap-2 font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">
        <ShieldCheck size={15} /> The scoreboard
      </p>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="font-[family-name:var(--font-display)] text-4xl leading-none text-[var(--c-ink)] lg:text-5xl">{count}</div>
          <div className="mt-2 text-sm text-[var(--c-ink-muted)]">collection lawsuit{count === 1 ? "" : "s"} defeated — non-suited or judgment for our client</div>
        </div>
        <div>
          <div className="font-[family-name:var(--font-display)] text-4xl leading-none text-[var(--c-ink)] lg:text-5xl">{money}</div>
          <div className="mt-2 text-sm text-[var(--c-ink-muted)]">in claimed debt those suits demanded — and counting</div>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
        Running totals from the firm&apos;s own case records. Every case is different — past results do not guarantee future outcomes.
      </p>
    </section>
  );
}
