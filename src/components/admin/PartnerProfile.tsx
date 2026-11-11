"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, RotateCcw, Save, Trash2 } from "lucide-react";
import { uploadToBlob } from "@/lib/upload-client";
import { media } from "@/lib/media";
import { savePartnerLogo, savePartnerContactDetails } from "@/app/admin/(panel)/intake/partner-actions";

type Props = {
  partner: { slug: string; name: string };
  logoUrl: string;
  logoIsOriginal: boolean;
  hasOriginalLogo: boolean;
  contact: string;
};

/** On the partner's tab: the logo and the contact details that appear on
 *  that office's intake form. */
export function PartnerProfile({ partner, logoUrl, logoIsOriginal, hasOriginalLogo, contact }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(contact);
  // When the saved text changes on the server (after a save), follow it.
  const [saved, setSaved] = useState(contact);
  if (contact !== saved) { setSaved(contact); setText(contact); }
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();

  const run = (key: string, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setBusy(key); setMsg(null);
    start(async () => {
      try {
        const r = await fn();
        setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      } catch (e) { setMsg({ ok: false, text: (e as Error)?.message || "That didn't go through. Try again." }); }
      setBusy(null);
    });
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|svg|heic|heif)$/i.test(file.name)) { setMsg({ ok: false, text: "Choose an image file (PNG, JPG, SVG or WebP)." }); return; }
    run("upload", async () => {
      const url = await uploadToBlob(file, "partners");
      return savePartnerLogo({ partner: partner.slug, url });
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const small = "inline-flex items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-xs hover:border-[var(--c-accent)] disabled:opacity-50";

  return (
    <div className="mb-6 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5" data-testid="partner-profile">
      <p className="text-sm font-semibold">{partner.name} — logo and contact details</p>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--c-ink-muted)]">Both appear on their intake form: the logo at the top, the contact details at the bottom.</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Logo</p>
          <div className="flex min-h-[96px] items-center justify-center rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] p-4" data-testid="logo-preview">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={media(logoUrl)} alt={`${partner.name} logo`} className="max-h-20 w-auto max-w-full rounded" data-testid="logo-img" />
              : <span className="text-xs text-[var(--c-ink-muted)]" data-testid="logo-none">No logo — their name is shown instead.</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,.svg,.heic,.heif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="logo-file" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-[var(--c-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="logo-upload"><ImageUp size={14} /> {busy === "upload" ? "Uploading…" : logoUrl ? "Upload a different logo" : "Upload a logo"}</button>
            {!logoIsOriginal && hasOriginalLogo && <button type="button" disabled={busy !== null} onClick={() => run("orig", () => savePartnerLogo({ partner: partner.slug, url: null }))} className={small} data-testid="logo-original"><RotateCcw size={13} /> Use the original</button>}
            {logoUrl && <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm("Remove the logo from their intake form? Their name will be shown in its place.")) run("rm", () => savePartnerLogo({ partner: partner.slug, url: "" })); }} className={small} data-testid="logo-remove"><Trash2 size={13} /> Remove</button>}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--c-ink-muted)]">PNG, JPG, SVG or WebP. A wide logo at least 600 pixels across looks sharpest.</p>
        </div>

        <div>
          <label htmlFor="partner-contact-text" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">Contact details</label>
          <textarea id="partner-contact-text" rows={9} className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-[var(--c-accent)]" value={text} onChange={(e) => setText(e.target.value)} data-testid="contact-text" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-[var(--c-ink-muted)]">One office per block, with a blank line between offices. Phone numbers and email addresses become tappable links.</p>
            <button type="button" disabled={busy !== null || text === contact} onClick={() => run("contact", () => savePartnerContactDetails({ partner: partner.slug, text }))} className="inline-flex items-center gap-2 rounded-md border border-[var(--c-accent)] px-4 py-2 text-xs font-semibold text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-white disabled:opacity-50" data-testid="contact-text-save"><Save size={13} /> {busy === "contact" ? "Saving…" : "Save contact details"}</button>
          </div>
        </div>
      </div>
      {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-[var(--c-success,#1c7c3c)]" : "text-[var(--c-error,#b3261e)]"}`} role="status" data-testid="profile-msg">{msg.text}</p>}
    </div>
  );
}
