"use client";

import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";
import { Turnstile } from "./Turnstile";
import {
  BRANCHES,
  COMMON_STEPS,
  type Branch,
  type Field,
  type Step,
} from "@/lib/intake/config";

type Answers = Record<string, string | string[]>;

export function IntakeWizard({
  initialPractice,
  consentText,
  turnstileSiteKey,
}: {
  initialPractice?: string;
  consentText: string;
  turnstileSiteKey?: string;
}) {
  const initialBranch = initialPractice
    ? BRANCHES.find((b) => b.practiceSlug === initialPractice) ?? null
    : null;

  const [branch, setBranch] = useState<Branch | null>(initialBranch);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const fuse = useMemo(
    () =>
      new Fuse(BRANCHES, {
        keys: ["label", "blurb", "keywords"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [],
  );

  const filteredBranches = useMemo(() => {
    if (!query.trim()) return BRANCHES;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse]);

  const steps: Step[] = branch ? [...branch.steps, ...COMMON_STEPS] : [];
  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;

  function setField(name: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [name]: value }));
  }

  function canAdvance(step: Step): boolean {
    return step.fields.every((f) => {
      if (!f.required) return true;
      const v = answers[f.name];
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v && String(v).trim());
    });
  }

  async function handleSubmit() {
    if (!branch) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: branch.id,
          practiceSlug: branch.practiceSlug,
          answers,
          referrer: typeof document !== "undefined" ? document.referrer : "",
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setDone(true);
    } catch {
      setError("Something went wrong. Please call us or try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Done screen ----
  if (done) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-success)] text-white">
          <Check size={32} />
        </div>
        <h2 className="h2 mt-6">We have your request.</h2>
        <p className="lead mt-4 max-w-lg mx-auto">
          Thank you. The firm will review what you sent and follow up using the contact method
          you chose. If your matter is urgent, please call the office directly.
        </p>
      </div>
    );
  }

  // ---- Entry screen (no branch selected) ----
  if (!branch) {
    return (
      <div>
        <div className="relative max-w-xl">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--c-ink-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe it in a word — sued, wreck, will, foreclosure…"
            className="w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-4 pl-12 pr-4 text-base focus:border-[var(--c-accent)] outline-none"
            aria-label="Describe your matter"
            autoFocus
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {filteredBranches.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBranch(b);
                setStepIndex(0);
              }}
              className="group text-left rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-4 hover:border-[var(--c-accent)] hover:bg-[var(--c-surface2)] transition-colors"
            >
              <span className="block font-[family-name:var(--font-ui)] font-semibold group-hover:text-[var(--c-accent)] transition-colors">
                {b.label}
              </span>
              <span className="block text-sm text-[var(--c-ink-muted)] mt-0.5">{b.blurb}</span>
            </button>
          ))}
        </div>
        {filteredBranches.length === 0 && (
          <p className="mt-6 text-[var(--c-ink-muted)]">
            Nothing matched. Try a different word, or{" "}
            <button onClick={() => setBranch(BRANCHES.find((b) => b.id === "other")!)} className="text-[var(--c-accent)] underline">
              start a general consultation
            </button>
            .
          </p>
        )}
      </div>
    );
  }

  // ---- Step flow ----
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div className="max-w-2xl">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? "bg-[var(--c-accent)]" : "bg-[var(--c-border)]"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--c-ink-muted)] mb-2">
        <span className="font-[family-name:var(--font-ui)] uppercase tracking-[0.12em] text-xs text-[var(--c-accent)]">
          {branch.label}
        </span>
        <span>
          Step {stepIndex + 1} of {totalSteps}
        </span>
      </div>

      <h2 className="h3">{currentStep.title}</h2>
      {currentStep.subtitle && (
        <p className="mt-2 text-[var(--c-ink-muted)]">{currentStep.subtitle}</p>
      )}

      <div className="mt-8 space-y-6">
        {currentStep.fields.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            value={answers[f.name]}
            onChange={(v) => setField(f.name, v)}
            consentText={f.name === "consent" ? consentText : undefined}
          />
        ))}
      </div>

      {currentStep.id === "consent" && turnstileSiteKey && (
        <Turnstile siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
      )}

      {error && <p className="mt-6 text-[var(--c-error)]">{error}</p>}

      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={() => {
            if (stepIndex === 0) {
              setBranch(initialBranch);
              if (initialBranch) return;
              setBranch(null);
            } else {
              setStepIndex((i) => i - 1);
            }
          }}
          className="btn btn-outline"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {isLast ? (
          <button
            onClick={handleSubmit}
            disabled={!canAdvance(currentStep) || submitting || (Boolean(turnstileSiteKey) && !turnstileToken)}
            className="btn btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Sending…" : "Submit request"} <Check size={16} />
          </button>
        ) : (
          <button
            onClick={() => setStepIndex((i) => i + 1)}
            disabled={!canAdvance(currentStep)}
            className="btn btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  consentText,
}: {
  field: Field;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  consentText?: string;
}) {
  const labelEl = (
    <label className="block font-[family-name:var(--font-ui)] font-medium mb-2">
      {field.label}
      {field.required && <span className="text-[var(--c-accent)]"> *</span>}
    </label>
  );

  const inputClass =
    "w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-3 px-4 focus:border-[var(--c-accent)] outline-none";

  switch (field.type) {
    case "textarea":
      return (
        <div>
          {labelEl}
          <textarea
            rows={4}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
          />
        </div>
      );
    case "select":
      return (
        <div>
          {labelEl}
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case "radio":
      return (
        <div>
          {labelEl}
          <div className="flex flex-wrap gap-2">
            {field.options?.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => onChange(o)}
                className={`px-4 py-2.5 text-sm rounded-md border transition-colors ${
                  value === o
                    ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]"
                    : "border-[var(--c-border)] hover:border-[var(--c-ink)]"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    case "yesno":
      return (
        <div>
          {labelEl}
          <div className="flex gap-2">
            {["Yes", "No"].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => onChange(o)}
                className={`px-6 py-2.5 text-sm rounded-md border transition-colors ${
                  value === o
                    ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]"
                    : "border-[var(--c-border)] hover:border-[var(--c-ink)]"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    case "checklist": {
      const arr = (value as string[]) ?? [];
      return (
        <div>
          {field.name !== "consent" && labelEl}
          <div className="space-y-2">
            {field.options?.map((o) => {
              const checked = arr.includes(o);
              return (
                <label
                  key={o}
                  className="flex items-start gap-3 cursor-pointer p-3 border border-[var(--c-border)] rounded-md hover:border-[var(--c-ink)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(checked ? arr.filter((x) => x !== o) : [...arr, o])
                    }
                    className="mt-1 accent-[var(--c-accent)]"
                  />
                  <span className="text-sm">
                    {field.name === "consent" ? consentText ?? field.label : o}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      );
    }
    default:
      return (
        <div>
          {labelEl}
          <input
            type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
          />
          {field.help && <p className="mt-1.5 text-xs text-[var(--c-ink-muted)]">{field.help}</p>}
        </div>
      );
  }
}
