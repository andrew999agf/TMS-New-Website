"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { saveBlocks } from "@/app/admin/(panel)/pages/actions";

/** Edit the Make a Payment (Clio) link used by the header button and /payment. */
export function PaymentLinkSetting({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveBlocks([{ key: "payment.url", value }]);
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Save failed");
    });
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">Make a Payment link (Clio)</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="https://app.clio.com/link/…"
          className="flex-1 border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]"
        />
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {saved && <p className="mt-2 text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Saved — the header button now points here.</p>}
      {error && <p className="mt-2 text-sm text-[var(--c-error)]">{error}</p>}
    </div>
  );
}
