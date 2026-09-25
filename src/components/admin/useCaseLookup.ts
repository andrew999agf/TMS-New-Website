"use client";

import { useEffect, useRef, useState } from "react";
import { lookupCaseForMatter } from "@/app/admin/(panel)/cases/actions";

export type CaseLookup =
  | { status: "idle" }
  | { status: "looking" }
  | { status: "new" }
  | { status: "found"; name: string; causeNumber: string; court: string; county: string; plaintiff: string; defendant: string };

/**
 * Debounced "do we already have this case?" check against the Matters/Cases
 * hub. `onFound` fires once per distinct matter so the caller can fill its
 * empty form fields from the central record.
 */
export function useCaseLookup(matter: string, onFound: (c: Extract<CaseLookup, { status: "found" }>) => void) {
  const [state, setState] = useState<CaseLookup>({ status: "idle" });
  const seq = useRef(0);
  const lastFilled = useRef("");

  useEffect(() => {
    const value = matter.trim();
    if (!value) { setState({ status: "idle" }); return; }
    const mySeq = ++seq.current;
    setState({ status: "looking" });
    const t = setTimeout(async () => {
      try {
        const r = await lookupCaseForMatter(value);
        if (mySeq !== seq.current) return;
        if (r.found) {
          setState({ status: "found", name: r.name, causeNumber: r.causeNumber, court: r.court, county: r.county, plaintiff: r.plaintiff, defendant: r.defendant });
          if (lastFilled.current !== value) {
            lastFilled.current = value;
            onFound({ status: "found", name: r.name, causeNumber: r.causeNumber, court: r.court, county: r.county, plaintiff: r.plaintiff, defendant: r.defendant });
          }
        } else {
          setState({ status: "new" });
        }
      } catch {
        if (mySeq === seq.current) setState({ status: "idle" });
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matter]);

  return state;
}

/** The little status line under a matter field. */
export function lookupNote(state: CaseLookup): { text: string; tone: "ok" | "info" } | null {
  if (state.status === "found") return { text: "Case found in Matters / Cases — details filled in.", tone: "ok" };
  if (state.status === "new") return { text: "New matter — what you enter here is saved to Matters / Cases, so next time it auto-fills.", tone: "info" };
  return null;
}
