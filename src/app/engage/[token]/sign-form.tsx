"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Type, Eraser } from "lucide-react";
import { signEngagement } from "../actions";

/**
 * The signature block. The client signs by typing their name (rendered in a
 * script face) or by drawing with a finger or mouse. The consent language is
 * client-facing legal text — Max-approved wording required before changing it.
 */
export function SignForm({ token, clientName, presetEmail, officePhone }: {
  token: string; clientName: string; presetEmail: string; officePhone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(presetEmail);
  const [initials, setInitials] = useState("");
  const [initialsTouched, setInitialsTouched] = useState(false);
  /** Initials follow the typed name until the client edits them directly. */
  function nameChanged(v: string) {
    setName(v);
    if (!initialsTouched) {
      setInitials(v.trim().split(/\s+/).map((w) => w[0] ?? "").join("").replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase());
    }
  }
  const [agree, setAgree] = useState(false);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ------------------------- draw-to-sign canvas ------------------------- */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function penDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = c.getContext("2d")!;
    const { x, y } = canvasPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function penMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = canvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }
  function penUp() { drawing.current = false; }
  function clearCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const signature = mode === "drawn"
      ? { kind: "drawn" as const, image: canvasRef.current?.toDataURL("image/png") }
      : { kind: "typed" as const };
    const r = await signEngagement(token, { name, email, agree, initials, signature });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return; }
    router.refresh();
  }

  const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[#7a1f2b]";
  const tab = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-medium ${active ? "border-[#7a1f2b] bg-[#7a1f2b] text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"}`;

  return (
    <form id="sign" onSubmit={(e) => void submit(e)} className="scroll-mt-6 rounded-lg border border-neutral-300 p-4">
      <p className="mb-3 font-semibold">Sign the engagement letter</p>
      <p className="mb-4 text-sm text-neutral-600">
        Please read the full engagement letter above before signing. By signing you accept the engagement on the terms
        stated in the letter, including the fees and retainers it describes.
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr,1fr,110px]">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your full legal name</span>
          <input className={input} value={name} onChange={(e) => nameChanged(e.target.value)} placeholder={clientName} autoComplete="name" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your email address</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your initials</span>
          <input className={input} value={initials} maxLength={8}
            onChange={(e) => { setInitialsTouched(true); setInitials(e.target.value.replace(/[^A-Za-z.]/g, "").toUpperCase()); }} required />
        </label>
      </div>
      <p className="-mt-1 mb-3 text-xs text-neutral-500">Your initials are placed at each &ldquo;Client Initials&rdquo; blank in the letter, including the one on every page.</p>

      {/* How would you like to sign? */}
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => setMode("typed")} className={tab(mode === "typed")}><Type size={15} /> Type my signature</button>
        <button type="button" onClick={() => setMode("drawn")} className={tab(mode === "drawn")}><PenLine size={15} /> Draw my signature</button>
      </div>

      {mode === "typed" ? (
        <div className="mb-4">
          <span className="mb-1 block text-sm font-medium">Signature</span>
          <div className="rounded-md border border-neutral-300 bg-white px-4 py-3">
            <span style={{ fontFamily: "'Great Vibes', 'Snell Roundhand', cursive", fontSize: 34, lineHeight: 1.2 }} className="block min-h-[44px] text-neutral-900">
              {name || <span className="text-neutral-300">{clientName || "Your name"}</span>}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Your typed name above is your signature — it appears in this script on the signed letter.</p>
        </div>
      ) : (
        <div className="mb-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm font-medium">Signature — sign with your finger or mouse</span>
            <button type="button" onClick={clearCanvas} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"><Eraser size={12} /> Clear</button>
          </div>
          <canvas
            ref={canvasRef}
            width={560}
            height={180}
            onPointerDown={penDown}
            onPointerMove={penMove}
            onPointerUp={penUp}
            onPointerLeave={penUp}
            className="w-full touch-none rounded-md border border-neutral-300 bg-white"
            style={{ height: 160 }}
          />
          {!hasDrawn && <p className="mt-1 text-xs text-neutral-500">Sign inside the box.</p>}
        </div>
      )}

      <label className="mb-4 flex items-start gap-2.5 text-sm leading-snug">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" required />
        <span>
          I have read the engagement letter and agree to its terms. I consent to conduct this transaction electronically,
          and I agree that the signature I provide above — typed or drawn — together with submitting this form constitutes
          my electronic signature on the engagement letter, with the same force and effect as a handwritten signature, and
          that my initials as entered above may be placed at each place in the letter where initials are indicated.
        </span>
      </label>
      {error && <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !agree || name.trim().length < 3 || initials.trim().length < 1 || (mode === "drawn" && !hasDrawn)}
        className="rounded-md bg-[#7a1f2b] px-6 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="inline animate-spin" /> : "Sign the engagement letter"}
      </button>
      <p className="mt-3 text-xs text-neutral-500">
        A copy of the signed letter will be emailed to you. Your signature is recorded with the date, time, and the network
        address it was submitted from. If anything in the letter looks wrong, call the office at {officePhone} before signing.
      </p>
    </form>
  );
}
