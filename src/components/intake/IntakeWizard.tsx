"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Search, Info, Plus, X, UploadCloud, FileText, Loader2, Eye } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { Turnstile } from "./Turnstile";
import {
  BRANCHES,
  rankBranches,
  branchForPractice,
  COMMON_STEPS,
  condMet,
  condMetAll,
  ESTATE_DEPTH,
  type Branch,
  type Field,
  type Step,
  type Person,
  type Gift,
  type ResShare,
  type ResiduaryValue,
  type IntakeFile,
  type Address,
  formatAddress,
} from "@/lib/intake/config";

type Answers = Record<string, unknown>;

const emptyPerson = (): Person => ({ name: "", phone: "", street: "", city: "", state: "", zip: "" });
const asPeople = (v: unknown): Person[] => (Array.isArray(v) ? (v as Person[]) : []);

/** Progressive US phone formatting: digits in → "(512) 555-1234" out. */
function formatPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** The name portion of a "Full name — DOB" style entry (strips a trailing date). */
const nameOnly = (s: string): string => String(s).replace(/\s*[—–-]\s*\d.*$/, "").replace(/,\s*\d.*$/, "").trim();

/** Every distinct person already entered anywhere in the flow — for autocomplete. */
function collectPeople(answers: Answers): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const add = (p: Person | undefined) => {
    if (!p || !p.name?.trim()) return;
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const v of Object.values(answers)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === "object") {
          if ("name" in item) add(item as Person);
          if ("to" in item && Array.isArray((item as Gift).to)) (item as Gift).to.forEach(add);
          if ("person" in item) add((item as ResShare).person);
        }
      }
    } else if (v && typeof v === "object" && "shares" in (v as object)) {
      (v as ResiduaryValue).shares?.forEach((s) => add(s.person));
    }
  }
  return out;
}

/** Sum of residuary percentages (when not splitting evenly). */
function residuaryTotal(v: ResiduaryValue | undefined): number {
  if (!v || v.even) return 100;
  return v.shares.reduce((sum, s) => sum + (parseFloat(s.percent) || 0), 0);
}

const REP_NOTICE =
  "This firm does not represent you until you have signed a representation agreement issued by our firm and paid the applicable retainer fee.";

/** Low-profile representation disclaimer shown at the top of every step. */
function RepNotice() {
  return (
    <p className="mb-5 text-[11px] leading-relaxed text-[var(--c-ink-muted)] bg-[var(--c-surface2)] border border-[var(--c-border)] rounded-md px-3 py-2">
      {REP_NOTICE}
    </p>
  );
}

export function IntakeWizard({
  initialPractice,
  initialAnswers,
  consentText,
  turnstileSiteKey,
}: {
  initialPractice?: string;
  initialAnswers?: Answers;
  consentText: string;
  turnstileSiteKey?: string;
}) {
  const initialBranch = initialPractice
    ? branchForPractice(initialPractice) ?? null
    : null;

  const [branch, setBranch] = useState<Branch | null>(initialBranch);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initialAnswers ?? {});
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileGen, setTurnstileGen] = useState(0); // bump to remount the widget for a fresh token
  // Honeypot: hidden field humans never see; bots that fill it are dropped server-side.
  const [honeypot, setHoneypot] = useState("");

  /* ---- Saved progress (comprehensive estate questionnaire only) ----
   * Each completed step is saved server-side (flagged incomplete for the
   * intake team) and mirrored in localStorage so THIS browser can offer
   * "continue where you left off". No emails are involved. */
  const RESUME_KEY = "tms_intake_resume_v1";
  type ResumeRecord = { token: string; branchId: string; answers: Answers; stepIndex: number; savedAt: string };
  const resumeTokenRef = useRef<string | null>(null);
  const [resumeOffer, setResumeOffer] = useState<ResumeRecord | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const rec = JSON.parse(raw) as ResumeRecord;
      const fresh = Date.now() - new Date(rec.savedAt).getTime() < 14 * 86_400_000;
      const eligible = rec?.token && rec.branchId === "estate" && rec.answers?.estateDepth === ESTATE_DEPTH.FULL;
      if (fresh && eligible && BRANCHES.some((b) => b.id === rec.branchId)) setResumeOffer(rec);
      else localStorage.removeItem(RESUME_KEY);
    } catch {
      /* corrupt record — ignore */
    }
  }, []);

  function resumeSaved() {
    if (!resumeOffer) return;
    const b = BRANCHES.find((x) => x.id === resumeOffer.branchId);
    if (!b) return;
    resumeTokenRef.current = resumeOffer.token;
    setBranch(b);
    setAnswers(resumeOffer.answers);
    setStepIndex(resumeOffer.stepIndex);
    setResumeOffer(null);
  }
  function discardSaved() {
    localStorage.removeItem(RESUME_KEY);
    setResumeOffer(null);
  }

  const savingEligible = branch?.id === "estate" && answers.estateDepth === ESTATE_DEPTH.FULL;
  useEffect(() => {
    if (!savingEligible || done || stepIndex === 0) return;
    if (!resumeTokenRef.current) resumeTokenRef.current = crypto.randomUUID().replace(/-/g, "");
    const rec: ResumeRecord = {
      token: resumeTokenRef.current,
      branchId: "estate",
      answers,
      stepIndex,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify(rec));
    } catch {
      /* storage full/blocked */
    }
    void fetch("/api/intake/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rec.token, branch: "estate", step: stepIndex, answers }),
    }).catch(() => {});
    // Saves fire when the visitor advances to a new step (latest answers included).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, savingEligible, done]);

  // Each step renders in place (it's not a real page load), so scroll the new
  // step's questions into view when advancing/going back — except on first load.
  const topRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    if (firstScroll.current) {
      firstScroll.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stepIndex, branch]);

  const filteredBranches = useMemo(() => {
    if (!query.trim()) return BRANCHES;
    return rankBranches(query);
  }, [query]);
  const queryWordCount = query.trim() ? query.trim().split(/\s+/).length : 0;

  // Conditional steps: a step is shown only when its showIf condition holds
  // (e.g. ask for trustee details only if the visitor checked a trust).
  const allSteps: Step[] = branch
    ? [...branch.steps, ...COMMON_STEPS.map((s) => branch.commonOverrides?.[s.id] ?? s)]
    : [];
  const steps: Step[] = allSteps.filter((s) => condMet(s.showIf, answers) && condMetAll(s.requireIf, answers));
  const totalSteps = steps.length;
  // Selections can change which steps exist; never index past the end.
  const safeIndex = Math.min(stepIndex, Math.max(0, totalSteps - 1));
  const currentStep = steps[safeIndex];
  const visibleFields = (step: Step) => step.fields.filter((f) => condMet(f.showIf, answers));
  // People entered anywhere so far — powers the in-flow autocomplete. Children,
  // spouse, and other dependents are surfaced first, since a plan usually names
  // them as the executor and beneficiaries.
  const people = (() => {
    const first: Person[] = [];
    for (const c of Array.isArray(answers.children) ? answers.children : []) { const n = nameOnly(String(c)); if (n) first.push({ name: n }); }
    if (typeof answers.spouseName === "string" && answers.spouseName.trim()) first.push({ name: answers.spouseName.trim() });
    for (const o of Array.isArray(answers.otherDependents) ? answers.otherDependents : []) { const n = nameOnly(String(o)); if (n) first.push({ name: n }); }
    // Keep the children-first order, but fill in phone/address from wherever the
    // same person was entered with fuller detail (e.g. named again as executor).
    const byName = new Map<string, Person>();
    for (const p of [...first, ...collectPeople(answers)]) {
      const k = p.name.trim().toLowerCase();
      if (!k) continue;
      const ex = byName.get(k);
      byName.set(k, ex
        ? { name: ex.name, phone: ex.phone || p.phone, street: ex.street || p.street, city: ex.city || p.city, state: ex.state || p.state, zip: ex.zip || p.zip, address: ex.address || p.address }
        : { ...p });
    }
    return [...byName.values()];
  })();

  function setField(name: string, value: unknown) {
    setAnswers((a) => ({ ...a, [name]: value }));
  }

  function canAdvance(step: Step): boolean {
    return visibleFields(step).every((f) => {
      // A residuary must total exactly 100% (when not split evenly) before moving on.
      if (f.type === "residuary") {
        const v = answers[f.name] as ResiduaryValue | undefined;
        if (v && !v.even && v.shares.some((s) => s.person.name.trim() || s.percent.trim())) {
          return Math.round(residuaryTotal(v)) === 100;
        }
        return true;
      }
      if (!f.required) return true;
      const v = answers[f.name];
      if (f.type === "party") return asPeople(v).some((p) => p.name.trim());
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v && String(v).trim());
    });
  }

  async function handleSubmit() {
    if (!branch) return;
    setSubmitting(true);
    setError(null);
    // Drop empty entries from repeaters/parties/checklists before sending.
    const clean = (v: unknown): unknown => {
      if (Array.isArray(v)) {
        return v
          .filter((x) => {
            if (x && typeof x === "object" && "name" in x) return Boolean((x as Person).name?.trim());
            if (x && typeof x === "object" && "item" in x) return Boolean((x as Gift).item?.trim() || (x as Gift).to?.some((p) => p.name?.trim()));
            return String(x ?? "").trim();
          })
          .map((x) => (x && typeof x === "object" && "to" in x ? { ...(x as Gift), to: (x as Gift).to.filter((p) => p.name?.trim()) } : x));
      }
      return v;
    };
    const cleanAnswers: Answers = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, clean(v)]));
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: branch.id,
          practiceSlug: branch.practiceSlug,
          answers: cleanAnswers,
          referrer: typeof document !== "undefined" ? document.referrer : "",
          turnstileToken: turnstileToken ?? undefined,
          resumeToken: resumeTokenRef.current ?? undefined,
          company: honeypot,
        }),
      });
      if (!res.ok) {
        // Turnstile tokens expire after ~5 minutes; a failed verification
        // needs a FRESH token, so remount the widget before the retry.
        let msg = "";
        try {
          msg = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          /* non-JSON error body */
        }
        if (/verification/i.test(msg)) {
          setTurnstileToken(null);
          setTurnstileGen((g) => g + 1);
          setError("The security check expired — it has been refreshed. Please press Submit again.");
        } else {
          setError(msg || "Something went wrong. Please call us or try again.");
        }
        return;
      }
      try {
        localStorage.removeItem(RESUME_KEY);
      } catch {
        /* ignore */
      }
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
        <p className="mt-6 max-w-xl mx-auto text-sm font-semibold text-[var(--c-ink)]">
          {REP_NOTICE}
        </p>
      </div>
    );
  }

  // ---- Entry screen (no branch selected) ----
  if (!branch) {
    return (
      <div>
        <RepNotice />
        {resumeOffer && (
          <div className="mb-6 max-w-xl border border-[var(--c-accent)]/40 bg-[var(--c-accent)]/5 p-5">
            <p className="font-[family-name:var(--font-ui)] font-semibold">Welcome back — pick up where you left off?</p>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">
              You have an estate-planning questionnaire in progress from{" "}
              {new Date(resumeOffer.savedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}. Your answers
              were saved.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={resumeSaved} className="btn btn-accent px-4 py-2 text-sm">
                Continue where I left off
              </button>
              <button onClick={discardSaved} className="btn btn-outline px-4 py-2 text-sm">
                Start fresh
              </button>
            </div>
          </div>
        )}
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
        {filteredBranches.length === 0 && query.trim() && (
          // While someone is mid-thought (a word or two), a red "Nothing matched"
          // is jarring — e.g. typing "Mom…" before "Mom passed away". Nudge them
          // to keep going, and only offer the fallback once they've written
          // enough (3+ words) that a real match should have surfaced.
          queryWordCount < 3 ? (
            <p className="mt-6 text-[var(--c-ink-muted)]">Keep typing…</p>
          ) : (
            <p className="mt-6 text-[var(--c-ink-muted)]">
              Still nothing matched. Try a different word, or{" "}
              <button onClick={() => setBranch(BRANCHES.find((b) => b.id === "other")!)} className="text-[var(--c-accent)] underline">
                start a general consultation
              </button>
              .
            </p>
          )
        )}
      </div>
    );
  }

  // ---- Step flow ----
  const isLast = safeIndex === totalSteps - 1;

  return (
    <div className="max-w-2xl" ref={topRef} style={{ scrollMarginTop: "100px" }}>
      <RepNotice />
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= safeIndex ? "bg-[var(--c-accent)]" : "bg-[var(--c-border)]"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--c-ink-muted)] mb-2">
        <span className="font-[family-name:var(--font-ui)] uppercase tracking-[0.12em] text-xs text-[var(--c-accent)]">
          {branch.label}
        </span>
        <span>
          Step {safeIndex + 1} of {totalSteps}
        </span>
      </div>

      <h2 className="h3">{currentStep.title}</h2>
      {currentStep.subtitle && (
        <p className="mt-2 text-[var(--c-ink-muted)]">{currentStep.subtitle}</p>
      )}

      <div className="mt-8 space-y-6">
        {visibleFields(currentStep).map((f) => (
          <div key={f.name}>
            {f.guidance && <GuidanceNote text={f.guidance} />}
            <FieldInput
              field={f}
              value={answers[f.name]}
              onChange={(v) => setField(f.name, v)}
              consentText={f.name === "consent" ? consentText : undefined}
              people={people}
            />
          </div>
        ))}
      </div>

      {/* Honeypot — visually hidden, excluded from tab order and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Company
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {currentStep.id === "consent" && turnstileSiteKey && (
        <Turnstile key={turnstileGen} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
      )}

      {error && <p className="mt-6 text-[var(--c-error)]">{error}</p>}

      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={() => {
            if (safeIndex === 0) {
              setBranch(initialBranch);
              if (initialBranch) return;
              setBranch(null);
            } else {
              setStepIndex(safeIndex - 1);
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
            onClick={() => setStepIndex(safeIndex + 1)}
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


const asFiles = (v: unknown): IntakeFile[] =>
  Array.isArray(v) ? (v as IntakeFile[]).filter((f) => f && typeof f === "object" && typeof f.url === "string") : [];

const fmtBytes = (n?: number) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Drag-and-drop document upload (court papers). Files go straight from the
 *  browser to media storage through the public intake token endpoint; the
 *  submission stores {name, url, size} for each attachment. */
function FilesField({ value, onChange, max = 5 }: { value: IntakeFile[]; onChange: (v: IntakeFile[]) => void; max?: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const MAX_BYTES = 20 * 1024 * 1024;
  const ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,.heif,.tif,.tiff";

  async function addFiles(picked: FileList | File[]) {
    setError(null);
    const room = max - value.length;
    const files = [...picked].slice(0, Math.max(room, 0));
    if ([...picked].length > room) setError(`Up to ${max} files — the extras were skipped.`);
    const next = [...value];
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        setError(`“${f.name}” is over 20 MB — you can email it to us instead.`);
        continue;
      }
      setBusy((b) => b + 1);
      try {
        const blob = await upload(`intake-docs/${f.name}`, f, { access: "public", handleUploadUrl: "/api/intake/upload" });
        next.push({ name: f.name, url: blob.url, size: f.size });
        onChange([...next]);
      } catch {
        setError(`Couldn’t upload “${f.name}”. You can continue without it and email the papers instead.`);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed px-4 py-8 text-center transition-colors ${
          drag ? "border-[var(--c-accent)] bg-[var(--c-accent)]/5" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)]/60"
        }`}
      >
        {busy > 0 ? <Loader2 size={22} className="animate-spin text-[var(--c-accent)]" /> : <UploadCloud size={22} className="text-[var(--c-accent)]" />}
        <span className="text-sm font-medium">{busy > 0 ? "Uploading…" : "Drag & drop the papers here, or tap to browse"}</span>
        <span className="text-xs text-[var(--c-ink-muted)]">PDF, Word, or photos · up to {max} files · 20 MB each</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {value.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {value.map((f, i) => (
            <li key={f.url} className="flex items-center gap-2 border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
              <FileText size={15} className="shrink-0 text-[var(--c-accent)]" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-[var(--c-ink-muted)]">{fmtBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
                aria-label={`Remove ${f.name}`}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1.5 text-xs text-[var(--c-accent)]">{error}</p>}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  consentText,
  people = [],
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  consentText?: string;
  people?: Person[];
}) {
  const labelEl = (
    <div className="flex items-center gap-1.5 font-[family-name:var(--font-ui)] font-medium mb-2">
      <span>
        {field.label}
        {field.required && <span className="text-[var(--c-accent)]"> *</span>}
      </span>
      {field.help && <InfoTip text={field.help} />}
    </div>
  );

  const inputClass =
    "w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-3 px-4 focus:border-[var(--c-accent)] outline-none";

  if (field.type === "party") {
    return (
      <div>
        {labelEl}
        <PartyField value={asPeople(value)} onChange={onChange} people={people} addLabel={field.addLabel} max={field.max} />
      </div>
    );
  }
  if (field.type === "address") {
    return (
      <div>
        {labelEl}
        <AddressField value={(value && typeof value === "object" ? value : {}) as Address} onChange={onChange} />
      </div>
    );
  }
  if (field.type === "gifts") {
    return (
      <div>
        {labelEl}
        <GiftsField value={Array.isArray(value) ? (value as Gift[]) : []} onChange={onChange} people={people} addLabel={field.addLabel} />
      </div>
    );
  }
  if (field.type === "files") {
    return (
      <div>
        {labelEl}
        <FilesField value={asFiles(value)} onChange={onChange} max={field.max} />
      </div>
    );
  }
  if (field.type === "residuary") {
    return (
      <div>
        {labelEl}
        <ResiduaryField value={value as ResiduaryValue | undefined} onChange={onChange} people={people} />
      </div>
    );
  }

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
    case "repeater": {
      const arr = (value as string[]) ?? [];
      const list = arr.length ? arr : [""];
      const setAt = (i: number, v: string) => onChange(list.map((x, idx) => (idx === i ? v : x)));
      const removeAt = (i: number) => onChange(list.length <= 1 ? [""] : list.filter((_, idx) => idx !== i));
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {list.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={item}
                  onChange={(e) => setAt(i, e.target.value)}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
                {list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label="Remove"
                    className="shrink-0 p-2 text-[var(--c-ink-muted)] hover:text-[var(--c-error)]"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange([...list, ""])}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--c-accent)] hover:opacity-80"
          >
            <Plus size={15} /> {field.addLabel ?? "Add another"}
          </button>
        </div>
      );
    }
    default:
      return (
        <div>
          {labelEl}
          <input
            type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
            inputMode={field.type === "tel" ? "tel" : undefined}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.type === "tel" ? formatPhone(e.target.value) : e.target.value)}
            placeholder={field.type === "tel" ? (field.placeholder ?? "(555) 555-5555") : field.placeholder}
            className={inputClass}
          />
        </div>
      );
  }
}

const ROW = "w-full rounded border border-[var(--c-border)] bg-[var(--c-surface)] py-2.5 px-3 text-sm outline-none focus:border-[var(--c-accent)]";
const ADD = "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--c-accent)] hover:opacity-80";

/** A single person: name (with autocomplete over people already entered) + phone + address. */
function PersonInput({ value, onChange, people }: { value: Person; onChange: (p: Person) => void; people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const q = value.name.trim().toLowerCase();
    const pool = people.filter((p) => p.name.trim().toLowerCase() !== q);
    return (q ? pool.filter((p) => p.name.toLowerCase().includes(q)) : pool).slice(0, 8);
  }, [value.name, people]);

  function pick(p: Person) {
    // Pull the split parts (falling back to a legacy single address string).
    onChange({ name: p.name, phone: p.phone ?? "", street: p.street ?? "", city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "", address: p.address ?? "" });
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={value.name}
          onChange={(e) => { onChange({ ...value, name: e.target.value }); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || matches.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
            else if (e.key === "Enter") { e.preventDefault(); pick(matches[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Full name (include middle name)"
          className={ROW}
        />
        {open && matches.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg">
            {matches.map((p, i) => (
              <button
                key={`${p.name}-${i}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-2 text-left ${i === active ? "bg-[var(--c-surface2)]" : "hover:bg-[var(--c-surface2)]"}`}
              >
                <span className="text-sm font-medium">{p.name}</span>
                {(p.phone || formatAddress(p) || p.address) && (
                  <span className="block truncate text-xs text-[var(--c-ink-muted)]">{[p.phone, formatAddress(p) || p.address].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <input value={value.phone ?? ""} onChange={(e) => onChange({ ...value, phone: formatPhone(e.target.value) })} inputMode="tel" placeholder="Phone — (555) 555-5555" className={ROW} />
      <input value={value.street ?? ""} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Street address" className={ROW} />
      <div className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem]">
        <input value={value.city ?? ""} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="City" className={ROW} />
        <input value={value.state ?? ""} onChange={(e) => onChange({ ...value, state: e.target.value })} placeholder="State" className={ROW} />
        <input value={value.zip ?? ""} onChange={(e) => onChange({ ...value, zip: e.target.value })} inputMode="numeric" placeholder="ZIP" className={ROW} />
      </div>
    </div>
  );
}

/** Street / City / State / ZIP composite (for a standalone address field). */
function AddressField({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  return (
    <div className="space-y-2">
      <input value={value.street ?? ""} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Street address" className={ROW} />
      <div className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem]">
        <input value={value.city ?? ""} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="City" className={ROW} />
        <input value={value.state ?? ""} onChange={(e) => onChange({ ...value, state: e.target.value })} placeholder="State" className={ROW} />
        <input value={value.zip ?? ""} onChange={(e) => onChange({ ...value, zip: e.target.value })} inputMode="numeric" placeholder="ZIP" className={ROW} />
      </div>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove" className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)]">
      <X size={15} />
    </button>
  );
}

/** Repeatable people with name/phone/address, +/remove, optional max. */
function PartyField({ value, onChange, people, addLabel, max }: { value: Person[]; onChange: (v: Person[]) => void; people: Person[]; addLabel?: string; max?: number }) {
  const list = value.length ? value : [emptyPerson()];
  const setAt = (i: number, p: Person) => onChange(list.map((x, idx) => (idx === i ? p : x)));
  const removeAt = (i: number) => onChange(list.length <= 1 ? [emptyPerson()] : list.filter((_, idx) => idx !== i));
  const canAdd = !max || list.length < max;
  return (
    <div className="space-y-3">
      {list.map((p, i) => (
        <div key={i} className="rounded-md border border-[var(--c-border)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-[var(--c-ink-muted)]">{i === 0 ? "Primary" : `#${i + 1}`}</span>
            {list.length > 1 && <RemoveBtn onClick={() => removeAt(i)} />}
          </div>
          <PersonInput value={p} onChange={(np) => setAt(i, np)} people={people} />
        </div>
      ))}
      {canAdd && (
        <button type="button" onClick={() => onChange([...list, emptyPerson()])} className={ADD}>
          <Plus size={15} /> {addLabel ?? "Add another"}
        </button>
      )}
    </div>
  );
}

/** Specific gifts: each an item + recipients (split with +), plus + for the next gift. */
function GiftsField({ value, onChange, people, addLabel }: { value: Gift[]; onChange: (v: Gift[]) => void; people: Person[]; addLabel?: string }) {
  const setGift = (i: number, g: Gift) => onChange(value.map((x, idx) => (idx === i ? g : x)));
  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-[var(--c-ink-muted)]">No specific gifts yet — add one if particular items should go to particular people.</p>
      )}
      {value.map((g, i) => {
        const recips = g.to.length ? g.to : [emptyPerson()];
        const setRecip = (ri: number, p: Person) => setGift(i, { ...g, to: recips.map((x, idx) => (idx === ri ? p : x)) });
        return (
          <div key={i} className="rounded-md border border-[var(--c-border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-[var(--c-ink-muted)]">Gift #{i + 1}</span>
              <RemoveBtn onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
            </div>
            <input value={g.item} onChange={(e) => setGift(i, { ...g, item: e.target.value })} placeholder="Item or amount — e.g., my truck, or $5,000" className={ROW} />
            <p className="mb-1 mt-3 text-xs text-[var(--c-ink-muted)]">Goes to:</p>
            <div className="space-y-2">
              {recips.map((p, ri) => (
                <div key={ri} className="rounded border border-[var(--c-border)] p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--c-ink-muted)]">Recipient {ri + 1}</span>
                    {recips.length > 1 && <RemoveBtn onClick={() => setGift(i, { ...g, to: recips.filter((_, idx) => idx !== ri) })} />}
                  </div>
                  <PersonInput value={p} onChange={(np) => setRecip(ri, np)} people={people} />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setGift(i, { ...g, to: [...recips, emptyPerson()] })} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--c-accent)]">
              <Plus size={13} /> Split with another person
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...value, { item: "", to: [emptyPerson()] }])} className={ADD}>
        <Plus size={15} /> {addLabel ?? "Add a specific gift"}
      </button>
    </div>
  );
}

/** Residuary: even-split Y/N; when No, percentages with +; must total 100% to advance. */
function ResiduaryField({ value, onChange, people }: { value: ResiduaryValue | undefined; onChange: (v: ResiduaryValue) => void; people: Person[] }) {
  const v: ResiduaryValue = value ?? { even: true, shares: [{ person: emptyPerson(), percent: "" }] };
  const shares = v.shares.length ? v.shares : [{ person: emptyPerson(), percent: "" }];
  const setShare = (i: number, s: ResShare) => onChange({ ...v, shares: shares.map((x, idx) => (idx === i ? s : x)) });
  const total = residuaryTotal(v);
  const ok = Math.round(total) === 100;
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-sm">Split the residuary evenly between all beneficiaries?</p>
        <div className="flex gap-2">
          {([["Yes", true], ["No", false]] as const).map(([label, val]) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ ...v, shares, even: val })}
              className={`px-6 py-2.5 text-sm rounded-md border transition-colors ${v.even === val ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] border-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {shares.map((s, i) => (
          <div key={i} className="rounded-md border border-[var(--c-border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--c-ink-muted)]">Beneficiary {i + 1}</span>
              <div className="flex items-center gap-2">
                {!v.even && (
                  <span className="flex items-center gap-1">
                    <input value={s.percent} onChange={(e) => setShare(i, { ...s, percent: e.target.value })} inputMode="decimal" placeholder="0" className="w-16 rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1 text-right text-sm outline-none focus:border-[var(--c-accent)]" />
                    <span className="text-sm">%</span>
                  </span>
                )}
                {shares.length > 1 && <RemoveBtn onClick={() => onChange({ ...v, shares: shares.filter((_, idx) => idx !== i) })} />}
              </div>
            </div>
            <PersonInput value={s.person} onChange={(np) => setShare(i, { ...s, person: np })} people={people} />
          </div>
        ))}
      </div>

      <button type="button" onClick={() => onChange({ ...v, shares: [...shares, { person: emptyPerson(), percent: "" }] })} className={ADD}>
        <Plus size={15} /> Add a residuary beneficiary
      </button>

      {!v.even && (
        <p className={`text-sm ${ok ? "text-[var(--c-ink-muted)]" : "text-[var(--c-error)]"}`}>
          Total: {total}%{ok ? " ✓" : " — must equal 100% to continue"}
        </p>
      )}
    </div>
  );
}

/** Small info icon that reveals help text on hover (desktop) or tap (mobile). */
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onBlur={() => setShow(false)}
        aria-label="More information"
        className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"
      >
        <Info size={15} />
      </button>
      {show && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] z-30 w-64 max-w-[80vw] rounded-md bg-[var(--c-ink)] text-[var(--c-bg)] text-xs font-normal leading-relaxed px-3 py-2 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** A prominent, auto-shown (but dismissible) help bubble for tough elective
 *  questions. Shows the question-specific explanation plus a standard note to
 *  answer as best they can and contact the office. */
function GuidanceNote({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--c-accent)] hover:opacity-80"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--c-accent)]"><Eye size={12} /></span>
        Not sure how to answer? Show help
      </button>
    );
  }
  return (
    <div className="mb-3 rounded-lg border border-[var(--c-accent)]/45 bg-[var(--c-accent)]/[0.06] p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--c-accent)] text-[var(--c-accent)]"><Eye size={13} /></span>
        <div className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--c-ink)]">
          <p>{text}</p>
          <p className="mt-2 text-[var(--c-ink-muted)]">Answer to the best of your ability. If you&rsquo;re unsure or would like to talk it through, please contact our office — we make the final determinations before preparing your documents.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="shrink-0 text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
