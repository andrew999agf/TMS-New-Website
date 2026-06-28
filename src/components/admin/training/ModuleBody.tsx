import { Info, AlertTriangle } from "lucide-react";
import type { TrainingBlock, TrainingLesson } from "@/lib/training/types";

/** Minimal inline formatter: turns **bold** into <strong>. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-[var(--c-ink)]">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: TrainingBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h3 className="font-[family-name:var(--font-ui)] font-semibold text-[var(--c-ink)] mt-6 mb-1.5">
          {block.text}
        </h3>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-[var(--c-ink-muted)] my-2">
          <Inline text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`my-2 space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--c-ink-muted)] ${
            block.ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="my-3 border-l-2 border-[var(--c-accent)] pl-4 text-sm italic text-[var(--c-ink-muted)]">
          <Inline text={block.text} />
        </blockquote>
      );
    case "callout": {
      const warning = block.tone === "warning";
      const Icon = warning ? AlertTriangle : Info;
      return (
        <div
          className={`my-3 flex gap-3 rounded-lg border p-3.5 text-sm ${
            warning
              ? "border-[var(--c-error)]/30 bg-[var(--c-error)]/5"
              : "border-[var(--c-accent)]/30 bg-[var(--c-accent)]/5"
          }`}
        >
          <Icon size={17} className={`mt-0.5 shrink-0 ${warning ? "text-[var(--c-error)]" : "text-[var(--c-accent)]"}`} />
          <div className="min-w-0">
            {block.title && <p className="font-semibold text-[var(--c-ink)] mb-0.5">{block.title}</p>}
            <p className="leading-relaxed text-[var(--c-ink-muted)]">
              <Inline text={block.text} />
            </p>
          </div>
        </div>
      );
    }
  }
}

export function ModuleBody({ lessons }: { lessons: TrainingLesson[] }) {
  return (
    <div className="space-y-10">
      {lessons.map((lesson, idx) => (
        <section key={lesson.id} id={lesson.id} className="scroll-mt-24">
          <div className="flex items-baseline gap-3">
            <span className="font-[family-name:var(--font-display)] text-[var(--c-accent)] text-lg leading-none">
              {idx + 1}
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--c-ink)]">{lesson.title}</h2>
          </div>
          <div className="mt-2 pl-7">
            {lesson.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
