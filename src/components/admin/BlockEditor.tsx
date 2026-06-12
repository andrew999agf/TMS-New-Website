"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { saveBlocks } from "@/app/admin/(panel)/pages/actions";
import { ImageUploadField } from "./ImageUploadField";
import type { EditableBlock } from "@/lib/content";
import type { MediaSlot } from "@/lib/media-specs";

function slotForKey(key: string): MediaSlot | undefined {
  if (key.includes("logo")) return "logoHeader";
  if (key.includes("portrait")) return "portrait";
  if (key.includes("og")) return "ogImage";
  return undefined;
}

export function BlockEditor({
  blocks,
  previewHref,
}: {
  blocks: EditableBlock[];
  previewHref?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(blocks.map((b) => [b.key, b.value])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sections = [...new Set(blocks.map((b) => b.section))];

  function update(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty((d) => new Set(d).add(key));
    setSaved(false);
  }

  function save() {
    const updates = [...dirty].map((key) => ({ key, value: values[key] }));
    if (updates.length === 0) return;
    startTransition(async () => {
      const res = await saveBlocks(updates);
      if (res.ok) {
        setSaved(true);
        setDirty(new Set());
      } else setError(res.error ?? "Save failed");
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 sticky top-0 z-10 bg-[var(--c-bg)] py-3 -my-3">
        <button onClick={save} disabled={pending || dirty.size === 0} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50">
          {pending ? "Publishing…" : dirty.size > 0 ? `Publish ${dirty.size} change(s)` : "Published"}
        </button>
        {saved && <span className="text-sm text-[var(--c-success)] flex items-center gap-1"><Check size={15} /> Saved</span>}
        {error && <span className="text-sm text-[var(--c-error)]">{error}</span>}
        {previewHref && (
          <Link href={previewHref} target="_blank" className="text-sm text-[var(--c-accent)] flex items-center gap-1 ml-auto">
            Preview <ExternalLink size={14} />
          </Link>
        )}
      </div>

      <div className="space-y-8 max-w-3xl">
        {sections.map((section) => (
          <section key={section} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-6">
            <h2 className="font-[family-name:var(--font-ui)] font-semibold capitalize mb-5 text-[var(--c-accent)]">
              {section.replace(/([A-Z])/g, " $1")}
            </h2>
            <div className="space-y-5">
              {blocks
                .filter((b) => b.section === section)
                .map((b) => (
                  <div key={b.key}>
                    <label className="flex items-center justify-between text-sm font-medium mb-1.5">
                      {b.label}
                      <span className="text-xs text-[var(--c-ink-muted)] font-normal">{b.type}</span>
                    </label>
                    {b.type === "image" || b.type === "video" ? (
                      <ImageUploadField
                        value={values[b.key] ?? ""}
                        onChange={(url) => update(b.key, url)}
                        slot={slotForKey(b.key)}
                        accept={b.type === "video" ? "video/*" : "image/*"}
                        folder="brand"
                      />
                    ) : b.type === "richtext" ? (
                      <textarea
                        value={values[b.key] ?? ""}
                        onChange={(e) => update(b.key, e.target.value)}
                        rows={5}
                        className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-3 text-sm font-mono outline-none focus:border-[var(--c-accent)]"
                      />
                    ) : b.value.length > 80 || b.type === "text" ? (
                      <textarea
                        value={values[b.key] ?? ""}
                        onChange={(e) => update(b.key, e.target.value)}
                        rows={2}
                        className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-3 text-sm outline-none focus:border-[var(--c-accent)]"
                      />
                    ) : (
                      <input
                        value={values[b.key] ?? ""}
                        onChange={(e) => update(b.key, e.target.value)}
                        className="w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-3 text-sm outline-none focus:border-[var(--c-accent)]"
                      />
                    )}
                    {b.type === "richtext" && (
                      <p className="mt-1 text-xs text-[var(--c-ink-muted)]">HTML allowed (e.g. &lt;p&gt;, &lt;strong&gt;).</p>
                    )}
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
