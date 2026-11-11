"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, AlertTriangle } from "lucide-react";
import { Turnstile } from "./Turnstile";
import type { PartnerArea } from "@/lib/intake/partners";

type Props = {
  partner: { slug: string; name: string };
  areas: PartnerArea[];
  firmName: string;
  consentText: string;
  turnstileSiteKey?: string;
};

type Form = {
  name: string; phone: string; email: string; street: string; city: string; state: string; zip: string;
  preferredContact: string; preferredLanguage: string;
  description: string; opposingParty: string; opposingCounsel: string; county: string;
  caseFiled: string; caseInfo: string; urgent: string; deadline: string; urgentReason: string; helpedBy: string; consent: boolean;
};
const EMPTY: Form = {
  name: "", phone: "", email: "", street: "", city: "", state: "TX", zip: "", preferredContact: "", preferredLanguage: "",
  description: "", opposingParty: "", opposingCounsel: "", county: "", caseFiled: "", caseInfo: "", urgent: "", deadline: "", urgentReason: "", helpedBy: "", consent: false,
};

const input = "w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-3 px-4 focus:border-[var(--c-accent)] outline-none";
const labelCls = "mb-1.5 block font-[family-name:var(--font-ui)] text-sm font-semibold";

/**
 * The short intake a partner office fills out with a walk-in (or hands them
 * the link for). Same look as the firm's own intake; three steps; submits to
 * the same endpoint, tagged with the partner, so it lands in the same place.
 */
export function PartnerIntake({ partner, areas, firmName, consentText, turnstileSiteKey }: Props) {
  const [area, setArea] = useState<PartnerArea | null>(null);
  const [step, setStep] = useState(0); // 0 pick · 1 you · 2 the matter
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  const [honeypot, setHoneypot] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((p) => ({ ...p, [k]: v })); setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; }); };
  const scrollTop = () => setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);

  const checkYou = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Please enter your full name.";
    if (f.phone.replace(/\D/g, "").length < 10) e.phone = "Please enter a phone number with area code.";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "That email doesn't look right.";
    setErrors(e); return Object.keys(e).length === 0;
  };
  const checkMatter = () => {
    const e: Record<string, string> = {};
    if (f.description.trim().length < 10) e.description = "Please tell us briefly what happened.";
    if (!f.county.trim()) e.county = "Please enter the county.";
    if (!f.urgent) e.urgent = "Please choose one.";
    if (!f.consent) e.consent = "Please check the box to continue.";
    setErrors(e); return Object.keys(e).length === 0;
  };

  async function submit() {
    if (!area || !checkMatter()) { scrollTop(); return; }
    setSubmitting(true); setFailed(null);
    const hasAddress = f.street.trim() || f.city.trim() || f.zip.trim();
    const answers: Record<string, unknown> = {
      practiceArea: area.label,
      name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(),
      ...(hasAddress ? { address: { street: f.street.trim(), city: f.city.trim(), state: f.state.trim(), zip: f.zip.trim() } } : {}),
      preferredContact: f.preferredContact, preferredLanguage: f.preferredLanguage,
      county: f.county.trim(), description: f.description.trim(),
      opposingParty: f.opposingParty.trim(), opposingCounsel: f.opposingCounsel.trim(),
      caseFiled: f.caseFiled, caseInfo: f.caseFiled === "Yes" ? f.caseInfo.trim() : "",
      urgent: f.urgent, deadline: f.deadline, urgentReason: f.urgent === "Yes" ? f.urgentReason.trim() : "",
      helpedBy: f.helpedBy.trim(), consent: "Agreed",
    };
    for (const k of Object.keys(answers)) if (answers[k] === "") delete answers[k];
    try {
      const res = await fetch("/api/intake", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ branch: area.branch, practiceSlug: area.practiceSlug, answers, partner: partner.slug, referrer: typeof document !== "undefined" ? document.referrer : "", turnstileToken: token ?? undefined, company: honeypot }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setFailed(json.error || "That didn't go through. Please try again."); setToken(null); setGen((g) => g + 1); }
      else { setDone(true); scrollTop(); }
    } catch { setFailed("We couldn't reach the server. Check the connection and try again."); }
    setSubmitting(false);
  }

  const restart = () => { setArea(null); setStep(0); setF(EMPTY); setErrors({}); setDone(false); setFailed(null); setToken(null); setGen((g) => g + 1); scrollTop(); };
  const err = (k: string) => errors[k] ? <p className="mt-1 text-sm text-[var(--c-error,#b3261e)]" data-testid={`err-${k}`}>{errors[k]}</p> : null;
  const radios = (k: keyof Form, opts: string[]) => (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button key={o} type="button" onClick={() => set(k, o as never)} aria-pressed={f[k] === o} data-testid={`${k}-${o}`}
          className={`rounded-md border px-4 py-2.5 text-sm transition-colors ${f[k] === o ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)]"}`}>{o}</button>
      ))}
    </div>
  );

  if (done) {
    return (
      <div className="max-w-2xl" ref={top} data-testid="partner-done">
        <h2 className="display-3 font-[family-name:var(--font-display)]">Thank you. We have it.</h2>
        <p className="mt-4 text-lg leading-relaxed text-[var(--c-ink-muted)]">{firmName} will review what you sent and follow up{f.preferredContact ? ` by ${f.preferredContact.toLowerCase()}` : ""}. If this is urgent, tell the front desk at {partner.name} before you leave.</p>
        <p className="mt-4 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--c-ink-muted)]">Sending this form has not created an attorney-client relationship. {firmName} does not represent you until you have signed a representation agreement issued by the firm.</p>
        <button onClick={restart} className="btn btn-outline mt-8 inline-flex items-center gap-2" data-testid="partner-again">Start another intake <ArrowRight size={16} /></button>
      </div>
    );
  }

  if (!area || step === 0) {
    return (
      <div className="max-w-2xl" ref={top}>
        <h2 className="display-3 font-[family-name:var(--font-display)]">What do you need help with?</h2>
        <p className="mt-3 text-[var(--c-ink-muted)]">Choose the closest fit. It takes about three minutes.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {areas.map((a) => (
            <button key={a.id} onClick={() => { setArea(a); setStep(1); scrollTop(); }} data-testid={`area-${a.id}`}
              className="group w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-4 text-left transition-colors hover:border-[var(--c-accent)] hover:bg-[var(--c-surface2)] sm:w-[calc(50%-0.375rem)]">
              <span className="block font-[family-name:var(--font-ui)] font-semibold transition-colors group-hover:text-[var(--c-accent)]">{a.label}</span>
              <span className="mt-0.5 block text-sm text-[var(--c-ink-muted)]">{a.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl" ref={top} style={{ scrollMarginTop: "24px" }}>
      <div className="mb-8 flex items-center gap-2">{[1, 2].map((i) => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-[var(--c-accent)]" : "bg-[var(--c-border)]"}`} />)}</div>
      <p className="eyebrow mb-2">{area.label}</p>
      {step === 1 ? (
        <>
          <h2 className="display-3 font-[family-name:var(--font-display)]">First, about you</h2>
          <div className="mt-8 space-y-6">
            <div><label className={labelCls} htmlFor="pi-name">Full name *</label><input id="pi-name" className={input} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" data-testid="pi-name" />{err("name")}</div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="pi-phone">Phone *</label><input id="pi-phone" type="tel" className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" data-testid="pi-phone" />{err("phone")}</div>
              <div><label className={labelCls} htmlFor="pi-email">Email</label><input id="pi-email" type="email" className={input} value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" data-testid="pi-email" />{err("email")}</div>
            </div>
            <div>
              <label className={labelCls} htmlFor="pi-street">Mailing address</label>
              <input id="pi-street" className={input} value={f.street} onChange={(e) => set("street", e.target.value)} placeholder="Street" autoComplete="address-line1" data-testid="pi-street" />
              <div className="mt-2 grid grid-cols-[1fr_5rem_7rem] gap-2">
                <input className={input} value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="City" autoComplete="address-level2" aria-label="City" data-testid="pi-city" />
                <input className={input} value={f.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="State" autoComplete="address-level1" aria-label="State" />
                <input className={input} value={f.zip} onChange={(e) => set("zip", e.target.value)} placeholder="ZIP" autoComplete="postal-code" aria-label="ZIP" inputMode="numeric" data-testid="pi-zip" />
              </div>
            </div>
            <div><span className={labelCls}>Best way to reach you</span>{radios("preferredContact", ["Telephone", "Text", "Email"])}</div>
            <div><span className={labelCls}>Preferred language</span>{radios("preferredLanguage", ["English", "Español", "Other"])}</div>
          </div>
        </>
      ) : (
        <>
          <h2 className="display-3 font-[family-name:var(--font-display)]">Now, about the matter</h2>
          <div className="mt-8 space-y-6">
            <div><label className={labelCls} htmlFor="pi-desc">Briefly, what is going on? *</label><textarea id="pi-desc" rows={5} className={input} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="A few sentences is plenty." data-testid="pi-description" />{err("description")}</div>
            <div><label className={labelCls} htmlFor="pi-county">County where this is happening *</label><input id="pi-county" className={input} value={f.county} onChange={(e) => set("county", e.target.value)} placeholder="e.g., Tarrant" data-testid="pi-county" /><p className="mt-1 text-xs text-[var(--c-ink-muted)]">If there is a court case, the county of that court. Otherwise, where it happened or where you live.</p>{err("county")}</div>
            <div><label className={labelCls} htmlFor="pi-opp">Who is on the other side? <span className="font-normal text-[var(--c-ink-muted)]">(if known)</span></label><input id="pi-opp" className={input} value={f.opposingParty} onChange={(e) => set("opposingParty", e.target.value)} placeholder="Person or company" data-testid="pi-opposingParty" /></div>
            <div><label className={labelCls} htmlFor="pi-oc">Their attorney <span className="font-normal text-[var(--c-ink-muted)]">(if known)</span></label><input id="pi-oc" className={input} value={f.opposingCounsel} onChange={(e) => set("opposingCounsel", e.target.value)} placeholder="Attorney or law firm" data-testid="pi-opposingCounsel" /></div>
            <div><span className={labelCls}>Is there already a court case?</span>{radios("caseFiled", ["Yes", "No", "Not sure"])}
              {f.caseFiled === "Yes" && <input className={`${input} mt-2`} value={f.caseInfo} onChange={(e) => set("caseInfo", e.target.value)} placeholder="Court and case number, if you have them" aria-label="Court and case number" data-testid="pi-caseInfo" />}</div>
            <div><span className={labelCls}>Is this urgent? *</span>{radios("urgent", ["Yes", "No"])}{err("urgent")}
              {f.urgent === "Yes" && <input className={`${input} mt-2`} value={f.urgentReason} onChange={(e) => set("urgentReason", e.target.value)} placeholder="What makes it urgent? (served with papers, a hearing, a sale date…)" aria-label="What makes it urgent" data-testid="pi-urgentReason" />}</div>
            <div><label className={labelCls} htmlFor="pi-deadline">Any deadline or court date? <span className="font-normal text-[var(--c-ink-muted)]">(if known)</span></label><input id="pi-deadline" type="date" className={`${input} max-w-xs`} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} data-testid="pi-deadline" /></div>
            <div><label className={labelCls} htmlFor="pi-helped">{partner.name} staff member helping with this form <span className="font-normal text-[var(--c-ink-muted)]">(optional)</span></label><input id="pi-helped" className={input} value={f.helpedBy} onChange={(e) => set("helpedBy", e.target.value)} data-testid="pi-helpedBy" /></div>
            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-sm leading-relaxed">
                <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--c-accent)]" data-testid="pi-consent" />
                <span>{consentText}</span>
              </label>
              {err("consent")}
            </div>
          </div>
          {/* Honeypot: real people never see or fill this. */}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute left-[-9999px] h-0 w-0 opacity-0" aria-hidden />
          {turnstileSiteKey && <div className="mt-6"><Turnstile key={gen} siteKey={turnstileSiteKey} onToken={setToken} /></div>}
          {failed && <p className="mt-4 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-[var(--c-error,#b3261e)]" data-testid="partner-failed"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {failed}</p>}
        </>
      )}
      <div className="mt-10 flex items-center justify-between gap-3">
        <button type="button" onClick={() => { if (step === 1) { setArea(null); setStep(0); } else setStep(1); scrollTop(); }} className="btn btn-outline inline-flex items-center gap-2" data-testid="partner-back"><ArrowLeft size={16} /> Back</button>
        {step === 1
          ? <button type="button" onClick={() => { if (checkYou()) { setStep(2); scrollTop(); } }} className="btn btn-accent inline-flex items-center gap-2" data-testid="partner-next">Continue <ArrowRight size={16} /></button>
          : <button type="button" onClick={submit} disabled={submitting} className="btn btn-accent inline-flex items-center gap-2 disabled:opacity-60" data-testid="partner-submit">{submitting ? "Sending…" : "Submit request"} <Check size={16} /></button>}
      </div>
    </div>
  );
}
