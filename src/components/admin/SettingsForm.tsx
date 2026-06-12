"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { saveSetting } from "@/app/admin/(panel)/settings/actions";

export function SettingsForm({
  settingKey,
  label,
  placeholder,
  initial,
}: {
  settingKey: string;
  label: string;
  placeholder?: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveSetting(settingKey, value);
      if (res.ok) setSaved(true);
    });
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder={placeholder}
          className="flex-1 border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]"
        />
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {saved && (
        <p className="mt-2 text-sm text-[var(--c-success)] flex items-center gap-1">
          <Check size={15} /> Saved
        </p>
      )}
    </div>
  );
}
