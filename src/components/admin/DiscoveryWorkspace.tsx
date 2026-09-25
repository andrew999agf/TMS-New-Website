"use client";

import { useState } from "react";
import { DiscoveryReviewer } from "./DiscoveryReviewer";
import { ProductionPipeline, type ClientFile, type StagedDoc, type ProductionRow } from "./ProductionPipeline";
import type { ComponentProps } from "react";

type Mode = "opposing" | "received" | "staged" | "produced";

/**
 * The Discovery Reviewer's four working surfaces: the opposing side's
 * productions (the original page-level reviewer), and our own pipeline —
 * pale red (received from client), pale yellow (to be produced), pale green
 * (produced).
 */
export function DiscoveryWorkspace({ reviewerProps, clientFiles, staged, prods, batesDefaults }: {
  reviewerProps: ComponentProps<typeof DiscoveryReviewer>;
  clientFiles: ClientFile[];
  staged: StagedDoc[];
  prods: ProductionRow[];
  batesDefaults: { prefix: string; nextStart: number };
}) {
  const [mode, setMode] = useState<Mode>("opposing");
  const receivedCount = clientFiles.length;
  const stagedCount = staged.filter((d) => d.batesStart && !prods.some((p) => p.id === d.productionId && p.producedAt)).length;
  const producedCount = prods.filter((p) => p.producedAt).length;

  const tab = (m: Mode, label: string, cls: string, active: string, count?: number) => (
    <button onClick={() => setMode(m)}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? active : `${cls} hover:brightness-95`}`}>
      {label}{count != null && count > 0 ? ` (${count})` : ""}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2">
        {tab("opposing", "Opposing production", "border-[var(--c-border)] bg-[var(--c-bg)]", "border-[var(--c-accent)] bg-[var(--c-accent)] text-[var(--c-on-accent)]")}
        {tab("received", "Documents received from Client", "border-red-300 bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900", "border-red-400 bg-red-200 text-red-900 ring-1 ring-red-400", receivedCount)}
        {tab("staged", "Documents to be produced", "border-yellow-300 bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200 dark:border-yellow-900", "border-yellow-400 bg-yellow-200 text-yellow-900 ring-1 ring-yellow-400", stagedCount)}
        {tab("produced", "Documents produced", "border-green-300 bg-green-100 text-green-900 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900", "border-green-400 bg-green-200 text-green-900 ring-1 ring-green-400", producedCount)}
      </div>
      {mode === "opposing" ? (
        <DiscoveryReviewer {...reviewerProps} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProductionPipeline mode={mode} setId={reviewerProps.setId} clientFiles={clientFiles} staged={staged} prods={prods} batesDefaults={batesDefaults} />
        </div>
      )}
    </div>
  );
}
