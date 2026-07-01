import { Info, AlertTriangle, HelpCircle } from "lucide-react";
import type { TrainingBlock, TrainingLesson } from "@/lib/training/types";
import { lookupTerm, type GlossaryEntry } from "@/lib/training/glossary";

/**
 * A glossary term: bold, dotted-underlined, with a pure-CSS hover popup that
 * appears BELOW the term (definition + a flashcard-style hypothetical) and
 * disappears the moment the cursor leaves the term. No JS/state required.
 */
function GlossaryTerm({ label, entry }: { label: string; entry: GlossaryEntry }) {
  return (
    <span className="group/term relative inline-block align-baseline">
      <span className="cursor-help font-semibold text-[#1b3a6b] underline decoration-dotted decoration-[#1b3a6b]/60 underline-offset-2">
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[80vw] rounded-lg border border-[#1b3a6b]/25 bg-[var(--c-surface)] p-3 text-left opacity-0 shadow-xl transition-opacity duration-100 group-hover/term:visible group-hover/term:opacity-100"
      >
        <span className="block text-sm font-semibold capitalize text-[#1b3a6b]">{entry.term}</span>
        <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--c-ink-muted)]">{entry.definition}</span>
        <span className="mt-2 block rounded-md bg-[var(--c-surface-2)] p-2 text-xs font-normal leading-relaxed text-[var(--c-ink)]">
          <span className="font-semibold text-[var(--c-accent)]">Hypothetical: </span>
          {entry.hypothetical}
        </span>
      </span>
    </span>
  );
}

/** Inline formatter: **bold**, and bold terms in the glossary get a hover popup. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          const inner = p.slice(2, -2);
          const entry = lookupTerm(inner);
          if (entry) return <GlossaryTerm key={i} label={inner} entry={entry} />;
          return (
            <strong key={i} className="font-semibold text-[var(--c-ink)]">
              {inner}
            </strong>
          );
        }
        return <span key={i}>{p}</span>;
      })}
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
    case "questions":
      return (
        <div className="my-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)] p-4">
          <p className="flex items-center gap-1.5 font-semibold text-[var(--c-ink)] mb-3">
            <HelpCircle size={16} className="text-[var(--c-accent)]" /> Check your understanding
          </p>
          <ol className="space-y-2 pl-5 list-decimal text-sm text-[var(--c-ink)]">
            {block.items.map((item, i) => (
              <li key={i}>
                {item.a ? (
                  <details className="group">
                    <summary className="cursor-pointer marker:text-[var(--c-ink-muted)]">
                      <span className="font-medium">
                        <Inline text={item.q} />
                      </span>
                      <span className="ml-2 text-xs text-[var(--c-accent)] group-open:hidden">Show answer</span>
                    </summary>
                    <p className="mt-1.5 rounded-md bg-[var(--c-surface)] p-2.5 text-[var(--c-ink-muted)] leading-relaxed">
                      <Inline text={item.a} />
                    </p>
                  </details>
                ) : (
                  <span className="font-medium">
                    <Inline text={item.q} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
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
