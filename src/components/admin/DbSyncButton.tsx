"use client";

import { useState } from "react";
import { Loader2, Check, Database } from "lucide-react";

/** One-click "apply database updates" — creates any new tables and seeds them. */
export function DbSyncButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  async function run() {
    setState("running");
    setMsg("");
    try {
      const res = await fetch("/api/admin/db-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setState("done");
      setMsg((data.applied ?? []).join(" · ") || "Up to date");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div>
      <button onClick={run} disabled={state === "running"} className="btn btn-outline text-sm py-2.5 px-4 disabled:opacity-60">
        {state === "running" ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
        {state === "running" ? "Applying…" : "Apply database updates"}
      </button>
      {state === "done" && (
        <p className="mt-2 text-sm text-[var(--c-success)] flex items-center gap-1">
          <Check size={15} /> {msg}
        </p>
      )}
      {state === "error" && <p className="mt-2 text-sm text-[var(--c-error)]">{msg}</p>}
    </div>
  );
}
