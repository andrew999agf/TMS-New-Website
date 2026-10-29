import { Hammer } from "lucide-react";

/** A module that is laid out but not yet built: says exactly what it will hold. */
export function ComingNext({ title, blurb, items }: { title: string; blurb: string; items: string[] }) {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{blurb}</p>
      <div className="mt-5 rounded-lg border border-dashed border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <p className="inline-flex items-center gap-2 text-sm font-semibold"><Hammer size={15} className="text-[var(--c-accent)]" /> Being built — what this screen will hold</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--c-ink-muted)]">{items.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
    </div>
  );
}
