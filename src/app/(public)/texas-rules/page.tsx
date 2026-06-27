import type { Metadata } from "next";
import { FileDown, ExternalLink } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { getSetting } from "@/lib/content";
import { TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES, TXCOURTS_RULES_URL, type TexasRule } from "@/lib/texas-rules";

export const metadata: Metadata = {
  title: "Texas Rules",
  description:
    "Download the current Texas Rules of Civil Procedure, Appellate Procedure, Evidence, and more — the latest versions approved by the Supreme Court of Texas.",
};

export const dynamic = "force-dynamic";

export default async function TexasRulesPage() {
  const rules = await getSetting<TexasRule[]>(TEXAS_RULES_KEY, DEFAULT_TEXAS_RULES);

  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Texas Rules"
        lead="The current statewide rules approved by the Supreme Court of Texas — download the PDF or view the source at the Texas Judicial Branch."
      />
      <div className="container-page py-16 lg:py-24">
        <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--color-muted)]">
          The rules below are the most current versions approved by the Supreme Court of Texas, as published by the Texas
          Judicial Branch. For questions about the rules, call (512) 463-4097, or visit the{" "}
          <a href={TXCOURTS_RULES_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-accent)] underline underline-offset-2">
            Texas Courts Rules &amp; Standards page
          </a>
          .
        </p>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[var(--color-surface)]">
          {rules.map((r, i) => (
            <div key={r.id} className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? "border-t border-[color:var(--color-line)]" : ""}`}>
              <div className="min-w-0">
                <p className="font-medium text-[color:var(--color-ink)]">{r.title}</p>
                <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">Last amended: {r.lastAmended}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {r.pdfUrl && (
                  <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110">
                    <FileDown size={14} /> Download PDF
                  </a>
                )}
                <a href={r.sourceUrl || TXCOURTS_RULES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-xs font-medium text-[color:var(--color-ink)] transition hover:bg-[var(--color-surface2)]">
                  <ExternalLink size={14} /> txcourts.gov
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-[color:var(--color-muted)]">
          Rules and amendment dates are maintained by the Texas Judicial Branch and are reviewed quarterly. Always
          confirm the current version at txcourts.gov before relying on a downloaded copy.
        </p>
      </div>
    </>
  );
}
