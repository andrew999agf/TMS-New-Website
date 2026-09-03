import { ShieldCheck } from "lucide-react";
import { getDebtDefenseStats, DEBT_WINS_PUBLIC_KEY } from "@/lib/debt-wins";
import { getSetting } from "@/lib/content";

/**
 * The debt-defense scoreboard — collection suits beaten and the dollars that
 * were claimed. One source of truth (the admin's Debt Defense Wins log), so
 * this same component can later sit on the Results page too without a second
 * counter. Renders nothing until the first win is logged.
 */
export async function DebtWinsCounter() {
  // Master switch — stays hidden until the office turns it on (default off,
  // so the numbers can be fully populated first).
  const on = await getSetting<boolean>(DEBT_WINS_PUBLIC_KEY, false);
  if (!on) return null;
  const { count, total } = await getDebtDefenseStats();
  if (count === 0) return null;
  const money = "$" + Math.round(total).toLocaleString("en-US");
  // The case count appears only once it reaches 100, and always as a rounded
  // "100+", "150+", "200+" figure in 50-case steps — understated, verifiable.
  const countLabel = count >= 100 ? `${Math.floor(count / 50) * 50}+` : null;
  return (
    <section className="mb-12 rounded-lg border border-[var(--c-accent)]/30 bg-[var(--c-accent)]/[0.05] p-6 lg:p-8">
      <p className="flex items-center gap-2 font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-[0.16em] text-[var(--c-accent)]">
        <ShieldCheck size={15} /> Debt Defense Results
      </p>
      {countLabel ? (
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <div className="font-[family-name:var(--font-display)] text-4xl leading-none text-[var(--c-ink)] lg:text-5xl">{countLabel}</div>
            <div className="mt-2 text-sm text-[var(--c-ink-muted)]">collection lawsuits resolved in our clients&apos; favor</div>
          </div>
          <div>
            <div className="font-[family-name:var(--font-display)] text-4xl leading-none text-[var(--c-ink)] lg:text-5xl">{money}</div>
            <div className="mt-2 text-sm text-[var(--c-ink-muted)]">in claimed debt defeated — non-suits, dismissals, and judgments for our clients</div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="font-[family-name:var(--font-display)] text-4xl leading-none text-[var(--c-ink)] lg:text-5xl">{money}</div>
          <div className="mt-2 text-sm text-[var(--c-ink-muted)]">in claimed debt defeated — non-suits, dismissals, and judgments for our clients</div>
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
        Figures drawn from the firm&apos;s case records. Every case is different — past results do not guarantee future outcomes.
      </p>
    </section>
  );
}
