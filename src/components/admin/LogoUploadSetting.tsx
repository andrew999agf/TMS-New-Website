"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";

/** Logo setting with a direct file upload (primary) + URL fallback. */
export function LogoUploadSetting({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function persist(url: string) {
    setValue(url);
    setSaved(false);
    startTransition(async () => {
      const res = await saveSetting("logo", url);
      if (res.ok) setSaved(true);
    });
  }

  return (
    <div>
      <ImageUploadField
        value={value}
        onChange={persist}
        slot="logoHeader"
        folder="brand"
        label="Logo"
      />
      {pending && <p className="mt-2 text-xs text-[var(--c-ink-muted)]">Saving…</p>}
      {saved && (
        <p className="mt-2 text-sm text-[var(--c-success)] flex items-center gap-1">
          <Check size={15} /> Saved
        </p>
      )}
    </div>
  );
}
