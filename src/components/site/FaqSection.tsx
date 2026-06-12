import { JsonLd } from "./JsonLd";
import type { Faq } from "@/lib/content/defaults/faqs";

/** Accessible FAQ accordion (native <details>) with FAQPage structured data. */
export function FaqSection({ faqs, heading = "Common questions" }: { faqs: Faq[]; heading?: string }) {
  if (faqs.length === 0) return null;
  return (
    <section className="container-page py-16 lg:py-24 border-t border-[var(--c-border)]">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2 className="h2 mt-3">{heading}</h2>
        </div>
        <div className="divide-y divide-[var(--c-border)] border-t border-[var(--c-border)]">
          {faqs.map((f, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 list-none font-[family-name:var(--font-display)] text-lg">
                {f.q}
                <span className="text-[var(--c-accent)] text-2xl leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[var(--c-ink-muted)] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
