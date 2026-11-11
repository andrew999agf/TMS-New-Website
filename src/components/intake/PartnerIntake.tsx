"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Globe } from "lucide-react";
import { Turnstile } from "./Turnstile";
import type { PartnerArea } from "@/lib/intake/partners";

type Props = {
  partner: { slug: string; name: string };
  areas: PartnerArea[];
  firmName: string;
  /** The firm's own consent wording (English), from the admin. */
  consentText: string;
  turnstileSiteKey?: string;
};

type Lang = "en" | "es";

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

/**
 * Everything the form says, in both languages. Only the WORDS change with the
 * switch: what is stored and emailed (matter type, Yes/No, contact method) is
 * always the English value, so the intake team and the urgency logic see the
 * same data either way. The language the form was completed in is recorded.
 */
const T = {
  en: {
    sub: (firm: string) => <>Civil, probate and injury matters — legal services provided by <strong className="font-semibold text-[var(--c-ink)]">{firm}</strong></>,
    pickTitle: "What do you need help with?", pickSub: "Choose the closest fit. It takes about three minutes.",
    youTitle: "First, about you", matterTitle: "Now, about the matter",
    name: "Full name", phone: "Phone", email: "Email", address: "Mailing address", street: "Street", city: "City", state: "State", zip: "ZIP",
    reach: "Best way to reach you", language: "Preferred language",
    desc: "Briefly, what is going on?", descPh: "A few sentences is plenty.",
    county: "County where this is happening", countyPh: "e.g., Tarrant", countyHelp: "If there is a court case, the county of that court. Otherwise, where it happened or where you live.",
    opp: "Who is on the other side?", oppPh: "Person or company", oc: "Their attorney", ocPh: "Attorney or law firm", ifKnown: "(if known)", optional: "(optional)",
    caseFiled: "Is there already a court case?", caseInfoPh: "Court and case number, if you have them",
    urgent: "Is this urgent?", urgentPh: "What makes it urgent? (served with papers, a hearing, a sale date…)",
    deadline: "Any deadline or court date?", helped: (partner: string) => `${partner} staff member helping with this form`,
    back: "Back", next: "Continue", submit: "Submit request", sending: "Sending…",
    opts: { Telephone: "Telephone", Text: "Text", Email: "Email", English: "English", "Español": "Español", Other: "Other", Yes: "Yes", No: "No", "Not sure": "Not sure" } as Record<string, string>,
    errs: { name: "Please enter your full name.", phone: "Please enter a phone number with area code.", email: "That email doesn't look right.", description: "Please tell us briefly what happened.", county: "Please enter the county.", urgent: "Please choose one.", consent: "Please check the box to continue." } as Record<string, string>,
    failed: "That didn't go through. Please try again.", offline: "We couldn't reach the server. Check the connection and try again.",
    doneTitle: "Thank you. We have it.",
    doneBody: (firm: string, partner: string, how: string) => `${firm} will review what you sent and follow up${how ? ` by ${how}` : ""}. If this is urgent, tell the front desk at ${partner} before you leave.`,
    how: { Telephone: "telephone", Text: "text message", Email: "email" } as Record<string, string>,
    doneNote: (firm: string) => `Sending this form has not created an attorney-client relationship. ${firm} does not represent you until you have signed a representation agreement issued by the firm and paid the applicable retainer fee.`,
    again: "Start another intake",
    footer: (firm: string, partner: string) => `${firm} is a separate law firm from ${partner}. Matters submitted here are reviewed and, if accepted, handled by ${firm}.`,
  },
  es: {
    sub: (firm: string) => <>Asuntos civiles, sucesorios y de lesiones — servicios legales prestados por <strong className="font-semibold text-[var(--c-ink)]">{firm}</strong></>,
    pickTitle: "¿En qué necesita ayuda?", pickSub: "Elija la opción más cercana. Toma unos tres minutos.",
    youTitle: "Primero, sobre usted", matterTitle: "Ahora, sobre el asunto",
    name: "Nombre completo", phone: "Teléfono", email: "Correo electrónico", address: "Dirección postal", street: "Calle", city: "Ciudad", state: "Estado", zip: "Código postal",
    reach: "La mejor forma de comunicarnos con usted", language: "Idioma preferido",
    desc: "Brevemente, ¿qué está pasando?", descPh: "Con unas cuantas oraciones basta.",
    county: "Condado donde ocurre esto", countyPh: "p. ej., Tarrant", countyHelp: "Si hay un caso en un tribunal, el condado de ese tribunal. Si no, donde ocurrió o donde usted vive.",
    opp: "¿Quién es la otra parte?", oppPh: "Persona o empresa", oc: "El abogado de la otra parte", ocPh: "Abogado o despacho", ifKnown: "(si lo sabe)", optional: "(opcional)",
    caseFiled: "¿Ya existe un caso en un tribunal?", caseInfoPh: "Tribunal y número de caso, si los tiene",
    urgent: "¿Es urgente?", urgentPh: "¿Por qué es urgente? (le entregaron una demanda, hay una audiencia, una fecha de venta…)",
    deadline: "¿Alguna fecha límite o fecha de audiencia?", helped: (partner: string) => `Empleado(a) de ${partner} que ayuda con este formulario`,
    back: "Atrás", next: "Continuar", submit: "Enviar solicitud", sending: "Enviando…",
    opts: { Telephone: "Teléfono", Text: "Mensaje de texto", Email: "Correo electrónico", English: "English", "Español": "Español", Other: "Otro", Yes: "Sí", No: "No", "Not sure": "No estoy seguro(a)" } as Record<string, string>,
    errs: { name: "Escriba su nombre completo.", phone: "Escriba un número de teléfono con código de área.", email: "Ese correo electrónico no parece correcto.", description: "Cuéntenos brevemente qué pasó.", county: "Escriba el condado.", urgent: "Elija una opción.", consent: "Marque la casilla para continuar." } as Record<string, string>,
    failed: "No se pudo enviar. Inténtelo de nuevo.", offline: "No pudimos conectar con el servidor. Revise la conexión e inténtelo de nuevo.",
    doneTitle: "Gracias. Lo recibimos.",
    doneBody: (firm: string, partner: string, how: string) => `${firm} revisará lo que envió y se comunicará con usted${how ? ` por ${how}` : ""}. Si es urgente, avise en la recepción de ${partner} antes de irse.`,
    how: { Telephone: "teléfono", Text: "mensaje de texto", Email: "correo electrónico" } as Record<string, string>,
    doneNote: (firm: string) => `Enviar este formulario no ha creado una relación abogado-cliente. ${firm} no le representa hasta que usted haya firmado un contrato de representación emitido por el despacho y haya pagado el anticipo de honorarios correspondiente.`,
    again: "Comenzar otro formulario",
    footer: (firm: string, partner: string) => `${firm} es un despacho de abogados independiente de ${partner}. Los asuntos enviados aquí son revisados y, si se aceptan, atendidos por ${firm}.`,
  },
};

/** Spanish rendering of the firm's standard consent language. The English
 *  original is shown beneath it, and governs. */
const CONSENT_ES = "Enviar este formulario no crea una relación abogado-cliente. Entiendo y acepto que el despacho no me representa hasta que yo haya firmado un contrato de representación emitido por el despacho y haya pagado el anticipo de honorarios correspondiente. Por favor, no envíe aquí información confidencial ni urgente.";

const input = "w-full border border-[var(--c-border)] bg-[var(--c-surface)] py-3 px-4 focus:border-[var(--c-accent)] outline-none";
const labelCls = "mb-1.5 block font-[family-name:var(--font-ui)] text-sm font-semibold";
const LANG_KEY = "partner-intake-lang";

/**
 * The short intake a partner office fills out with a walk-in (or hands them
 * the link for). Same look as the firm's own intake; three steps; submits to
 * the same endpoint, tagged with the partner, so it lands in the same place.
 * A prominent English / Español switch changes every word on the page.
 */
export function PartnerIntake({ partner, areas, firmName, consentText, turnstileSiteKey }: Props) {
  const [lang, setLangState] = useState<Lang>("en");
  const [area, setArea] = useState<PartnerArea | null>(null);
  const [step, setStep] = useState(0); // 0 pick · 1 you · 2 the matter
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, true>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<"failed" | "offline" | string | null>(null);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  const [honeypot, setHoneypot] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const t = T[lang];

  // Remember the choice on this device (a front-desk tablet stays in the
  // language the office uses); a first visit follows the browser's language.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(LANG_KEY); } catch { /* private window */ }
    const initial: Lang = saved === "es" || saved === "en" ? saved : (navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
    if (initial !== "en") setLangState(initial);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* fine */ }
    // Someone who switches to Spanish almost certainly wants to be contacted in it.
    if (l === "es") setF((p) => (p.preferredLanguage ? p : { ...p, preferredLanguage: "Español" }));
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((p) => ({ ...p, [k]: v })); setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; }); };
  const scrollTop = () => setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);

  const checkYou = () => {
    const e: Record<string, true> = {};
    if (!f.name.trim()) e.name = true;
    if (f.phone.replace(/\D/g, "").length < 10) e.phone = true;
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = true;
    setErrors(e); return Object.keys(e).length === 0;
  };
  const checkMatter = () => {
    const e: Record<string, true> = {};
    if (f.description.trim().length < 10) e.description = true;
    if (!f.county.trim()) e.county = true;
    if (!f.urgent) e.urgent = true;
    if (!f.consent) e.consent = true;
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
      helpedBy: f.helpedBy.trim(), formLanguage: lang === "es" ? "Spanish" : "English", consent: "Agreed",
    };
    for (const k of Object.keys(answers)) if (answers[k] === "") delete answers[k];
    try {
      const res = await fetch("/api/intake", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ branch: area.branch, practiceSlug: area.practiceSlug, answers, partner: partner.slug, referrer: typeof document !== "undefined" ? document.referrer : "", turnstileToken: token ?? undefined, company: honeypot }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { setFailed("failed"); setToken(null); setGen((g) => g + 1); }
      else { setDone(true); scrollTop(); }
    } catch { setFailed("offline"); }
    setSubmitting(false);
  }

  const restart = () => { setArea(null); setStep(0); setF({ ...EMPTY, preferredLanguage: lang === "es" ? "Español" : "" }); setErrors({}); setDone(false); setFailed(null); setToken(null); setGen((g) => g + 1); scrollTop(); };
  const err = (k: string) => errors[k] ? <p className="mt-1 text-sm text-[var(--c-error,#b3261e)]" data-testid={`err-${k}`}>{t.errs[k]}</p> : null;
  /** Buttons show the current language; the value kept is always the English one. */
  const radios = (k: keyof Form, opts: string[]) => (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button key={o} type="button" onClick={() => set(k, o as never)} aria-pressed={f[k] === o} data-testid={`${k}-${o}`}
          className={`rounded-md border px-4 py-2.5 text-sm transition-colors ${f[k] === o ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)]"}`}>{t.opts[o] ?? o}</button>
      ))}
    </div>
  );
  const soft = (s: string) => <span className="font-normal text-[var(--c-ink-muted)]">{s}</span>;
  const areaLabel = (a: PartnerArea) => (lang === "es" ? a.labelEs : a.label);

  let body: React.ReactNode;
  if (done) {
    body = (
      <div className="max-w-2xl" data-testid="partner-done">
        <h2 className="display-3 font-[family-name:var(--font-display)]">{t.doneTitle}</h2>
        <p className="mt-4 text-lg leading-relaxed text-[var(--c-ink-muted)]">{t.doneBody(firmName, partner.name, t.how[f.preferredContact] ?? "")}</p>
        <p className="mt-4 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--c-ink-muted)]">{t.doneNote(firmName)}</p>
        <button onClick={restart} className="btn btn-outline mt-8 inline-flex items-center gap-2" data-testid="partner-again">{t.again} <ArrowRight size={16} /></button>
      </div>
    );
  } else if (!area || step === 0) {
    body = (
      <div className="max-w-2xl">
        <h2 className="display-3 font-[family-name:var(--font-display)]">{t.pickTitle}</h2>
        <p className="mt-3 text-[var(--c-ink-muted)]">{t.pickSub}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {areas.map((a) => (
            <button key={a.id} onClick={() => { setArea(a); setStep(1); scrollTop(); }} data-testid={`area-${a.id}`}
              className="group w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-4 text-left transition-colors hover:border-[var(--c-accent)] hover:bg-[var(--c-surface2)] sm:w-[calc(50%-0.375rem)]">
              <span className="block font-[family-name:var(--font-ui)] font-semibold transition-colors group-hover:text-[var(--c-accent)]">{areaLabel(a)}</span>
              <span className="mt-0.5 block text-sm text-[var(--c-ink-muted)]">{lang === "es" ? a.blurbEs : a.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="max-w-2xl">
        <div className="mb-8 flex items-center gap-2">{[1, 2].map((i) => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-[var(--c-accent)]" : "bg-[var(--c-border)]"}`} />)}</div>
        <p className="eyebrow mb-2">{areaLabel(area)}</p>
        {step === 1 ? (
          <>
            <h2 className="display-3 font-[family-name:var(--font-display)]">{t.youTitle}</h2>
            <div className="mt-8 space-y-6">
              <div><label className={labelCls} htmlFor="pi-name">{t.name} *</label><input id="pi-name" className={input} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" data-testid="pi-name" />{err("name")}</div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div><label className={labelCls} htmlFor="pi-phone">{t.phone} *</label><input id="pi-phone" type="tel" className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" data-testid="pi-phone" />{err("phone")}</div>
                <div><label className={labelCls} htmlFor="pi-email">{t.email}</label><input id="pi-email" type="email" className={input} value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" data-testid="pi-email" />{err("email")}</div>
              </div>
              <div>
                <label className={labelCls} htmlFor="pi-street">{t.address}</label>
                <input id="pi-street" className={input} value={f.street} onChange={(e) => set("street", e.target.value)} placeholder={t.street} autoComplete="address-line1" data-testid="pi-street" />
                <div className="mt-2 grid grid-cols-[1fr_5rem_7rem] gap-2">
                  <input className={input} value={f.city} onChange={(e) => set("city", e.target.value)} placeholder={t.city} autoComplete="address-level2" aria-label={t.city} data-testid="pi-city" />
                  <input className={input} value={f.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} placeholder={t.state} autoComplete="address-level1" aria-label={t.state} />
                  <input className={input} value={f.zip} onChange={(e) => set("zip", e.target.value)} placeholder={t.zip} autoComplete="postal-code" aria-label={t.zip} inputMode="numeric" data-testid="pi-zip" />
                </div>
              </div>
              <div><span className={labelCls}>{t.reach}</span>{radios("preferredContact", ["Telephone", "Text", "Email"])}</div>
              <div><span className={labelCls}>{t.language}</span>{radios("preferredLanguage", ["English", "Español", "Other"])}</div>
            </div>
          </>
        ) : (
          <>
            <h2 className="display-3 font-[family-name:var(--font-display)]">{t.matterTitle}</h2>
            <div className="mt-8 space-y-6">
              <div><label className={labelCls} htmlFor="pi-desc">{t.desc} *</label><textarea id="pi-desc" rows={5} className={input} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder={t.descPh} data-testid="pi-description" />{err("description")}</div>
              <div><label className={labelCls} htmlFor="pi-county">{t.county} *</label><input id="pi-county" className={input} value={f.county} onChange={(e) => set("county", e.target.value)} placeholder={t.countyPh} data-testid="pi-county" /><p className="mt-1 text-xs text-[var(--c-ink-muted)]">{t.countyHelp}</p>{err("county")}</div>
              <div><label className={labelCls} htmlFor="pi-opp">{t.opp} {soft(t.ifKnown)}</label><input id="pi-opp" className={input} value={f.opposingParty} onChange={(e) => set("opposingParty", e.target.value)} placeholder={t.oppPh} data-testid="pi-opposingParty" /></div>
              <div><label className={labelCls} htmlFor="pi-oc">{t.oc} {soft(t.ifKnown)}</label><input id="pi-oc" className={input} value={f.opposingCounsel} onChange={(e) => set("opposingCounsel", e.target.value)} placeholder={t.ocPh} data-testid="pi-opposingCounsel" /></div>
              <div><span className={labelCls}>{t.caseFiled}</span>{radios("caseFiled", ["Yes", "No", "Not sure"])}
                {f.caseFiled === "Yes" && <input className={`${input} mt-2`} value={f.caseInfo} onChange={(e) => set("caseInfo", e.target.value)} placeholder={t.caseInfoPh} aria-label={t.caseInfoPh} data-testid="pi-caseInfo" />}</div>
              <div><span className={labelCls}>{t.urgent} *</span>{radios("urgent", ["Yes", "No"])}{err("urgent")}
                {f.urgent === "Yes" && <input className={`${input} mt-2`} value={f.urgentReason} onChange={(e) => set("urgentReason", e.target.value)} placeholder={t.urgentPh} aria-label={t.urgentPh} data-testid="pi-urgentReason" />}</div>
              <div><label className={labelCls} htmlFor="pi-deadline">{t.deadline} {soft(t.ifKnown)}</label><input id="pi-deadline" type="date" className={`${input} max-w-xs`} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} data-testid="pi-deadline" /></div>
              <div><label className={labelCls} htmlFor="pi-helped">{t.helped(partner.name)} {soft(t.optional)}</label><input id="pi-helped" className={input} value={f.helpedBy} onChange={(e) => set("helpedBy", e.target.value)} data-testid="pi-helpedBy" /></div>
              <div>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-sm leading-relaxed">
                  <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--c-accent)]" data-testid="pi-consent" />
                  {lang === "es" ? (
                    <span data-testid="pi-consent-text"><span className="block">{CONSENT_ES}</span><span className="mt-2 block border-t border-[var(--c-border)] pt-2 text-xs text-[var(--c-ink-muted)]" lang="en">English original: {consentText}</span></span>
                  ) : <span data-testid="pi-consent-text">{consentText}</span>}
                </label>
                {err("consent")}
              </div>
            </div>
            {/* Honeypot: real people never see or fill this. */}
            <input type="text" name="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute left-[-9999px] h-0 w-0 opacity-0" aria-hidden />
            {turnstileSiteKey && <div className="mt-6"><Turnstile key={gen} siteKey={turnstileSiteKey} onToken={setToken} /></div>}
            {failed && <p className="mt-4 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-[var(--c-error,#b3261e)]" data-testid="partner-failed"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {failed === "offline" ? t.offline : t.failed}</p>}
          </>
        )}
        <div className="mt-10 flex items-center justify-between gap-3">
          <button type="button" onClick={() => { if (step === 1) { setArea(null); setStep(0); } else setStep(1); scrollTop(); }} className="btn btn-outline inline-flex items-center gap-2" data-testid="partner-back"><ArrowLeft size={16} /> {t.back}</button>
          {step === 1
            ? <button type="button" onClick={() => { if (checkYou()) { setStep(2); scrollTop(); } }} className="btn btn-accent inline-flex items-center gap-2" data-testid="partner-next">{t.next} <ArrowRight size={16} /></button>
            : <button type="button" onClick={submit} disabled={submitting} className="btn btn-accent inline-flex items-center gap-2 disabled:opacity-60" data-testid="partner-submit">{submitting ? t.sending : t.submit} <Check size={16} /></button>}
        </div>
      </div>
    );
  }

  const langBtn = (l: Lang, label: string) => (
    <button type="button" onClick={() => setLang(l)} aria-pressed={lang === l} lang={l} data-testid={`lang-${l}`}
      className={`min-w-[6.5rem] rounded-full px-5 py-2.5 text-base font-semibold transition-colors ${lang === l ? "bg-[var(--c-accent)] text-white shadow" : "text-[var(--c-ink)] hover:bg-[var(--c-surface2)]"}`}>{label}</button>
  );

  return (
    <>
      <header className="border-b border-[var(--c-border)] bg-[var(--c-surface)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-2xl leading-tight">{partner.name}</p>
            <p className="mt-1 text-sm text-[var(--c-ink-muted)]">{t.sub(firmName)}</p>
          </div>
          {/* The language switch: always in view at the top, both names in their own language. */}
          <div className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--c-accent)] bg-[var(--c-bg)] p-1" role="group" aria-label="Language / Idioma" data-testid="lang-switch">
            <Globe size={18} className="ml-2 mr-1 shrink-0 text-[var(--c-accent)]" aria-hidden />
            {langBtn("en", "English")}
            {langBtn("es", "Español")}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14" ref={top} style={{ scrollMarginTop: "16px" }}>{body}</div>
      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs leading-relaxed text-[var(--c-ink-muted)]">{t.footer(firmName, partner.name)}</footer>
    </>
  );
}
