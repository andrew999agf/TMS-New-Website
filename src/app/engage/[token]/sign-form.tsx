"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signEngagement } from "../actions";

/**
 * The signature block. The consent language below is client-facing legal
 * text — Max approved wording required before changing it.
 */
export function SignForm({ token, clientName, presetEmail, officePhone }: {
  token: string; clientName: string; presetEmail: string; officePhone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(presetEmail);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await signEngagement(token, { name, email, agree });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    router.refresh();
  }

  const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[#7a1f2b]";

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-lg border border-neutral-300 p-4">
      <p className="mb-3 font-semibold">Sign the engagement letter</p>
      <p className="mb-4 text-sm text-neutral-600">
        Please read the full engagement letter above before signing. By signing you accept the engagement on the terms
        stated in the letter, including the fees and retainers it describes.
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your full legal name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={clientName} autoComplete="name" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your email address</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
      </div>
      <label className="mb-4 flex items-start gap-2.5 text-sm leading-snug">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" required />
        <span>
          I have read the engagement letter and agree to its terms. I consent to conduct this transaction electronically,
          and I agree that typing my name below and submitting this form constitutes my electronic signature on the
          engagement letter, with the same force and effect as a handwritten signature.
        </span>
      </label>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block font-medium">Signature (type your full name)</span>
        <input className={`${input} font-[cursive] text-lg`} value={name} onChange={(e) => setName(e.target.value)} placeholder={clientName} required />
      </label>
      {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !agree || name.trim().length < 3}
        className="rounded-md bg-[#7a1f2b] px-6 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="inline animate-spin" /> : "Sign the engagement letter"}
      </button>
      <p className="mt-3 text-xs text-neutral-500">
        Your signature is recorded with the date, time, and the network address it was submitted from.
        If anything in the letter looks wrong, call the office at {officePhone} before signing.
      </p>
    </form>
  );
}
