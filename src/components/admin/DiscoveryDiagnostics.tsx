"use client";

import { discoveryDiagnostics } from "@/app/admin/(panel)/discovery-reviewer/actions";
import { DiagnosticsButton } from "./DiagnosticsButton";

/**
 * "Diagnostics" on the Discovery Reviewer's tab bar: one copyable text
 * report — what the database holds for each tab, the productions, recent
 * activity, plus what this browser is doing right now (documents shown, PDF
 * loads queued/failed, memory, any errors caught) — for pasting to support.
 */
export function DiscoveryDiagnostics({ setId, mode }: { setId: number; mode: string }) {
  return (
    <DiagnosticsButton
      fetchServer={() => discoveryDiagnostics(setId)}
      browserHeading={`THIS BROWSER — tab open: ${mode}`}
      title="Build a copyable diagnostics report for this case — paste it to support when something looks wrong"
      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] px-2.5 py-1.5 text-xs text-[var(--c-ink-muted)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]"
    />
  );
}
