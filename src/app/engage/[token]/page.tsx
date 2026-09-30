import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagementLetters } from "@/db/schema";
import { ensureDiscoveryTables } from "@/db/ensure";
import { FIRM } from "@/lib/firm";
import { OFFICE_INFO, type EngagementOffice } from "@/lib/engagement/config";
import { SignForm } from "./sign-form";

export const metadata: Metadata = { title: `Engagement Letter — ${FIRM.name}`, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const CT = { timeZone: "America/Chicago" } as const;

/**
 * The client-facing e-sign page. Reached only by the unguessable link the
 * engagement email carries. The letter itself is shown in a PDF viewer —
 * no summary, no editable Word copy — with a sign call-to-action up top and
 * the signature block (typed in script, or drawn) below.
 */
export default async function EngagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!db || !token || token.length < 16) notFound();
  await ensureDiscoveryTables();
  const [letter] = await db.select().from(engagementLetters).where(eq(engagementLetters.signToken, token));
  if (!letter) notFound();

  const office = OFFICE_INFO[letter.office as EngagementOffice] ?? OFFICE_INFO["fort-worth"];
  const expired = Boolean(letter.openUntil && new Date() > letter.openUntil && letter.status !== "signed");
  const client = letter.businessName
    ? `${letter.businessName}${letter.andIndividually ? ` and ${letter.clientName}, individually` : ` (by ${letter.clientName}${letter.officerTitle ? `, ${letter.officerTitle}` : ""})`}`
    : letter.clientName;
  const canSign = letter.status !== "signed" && !expired;
  const letterUrl = `/engage/${token}/letter`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-relaxed text-[var(--c-ink,#1a1a1a)]">
      {/* Script face for the typed-signature preview. */}
      <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet" />

      <header className="mb-8 border-b border-neutral-300 pb-4">
        <p className="font-[family-name:var(--font-display,Georgia)] text-2xl font-semibold">{FIRM.name}</p>
        <p className="text-sm text-neutral-500">Engagement letter — review and sign · Office: {office.label} · {office.phone}</p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Engagement letter for {client}</h1>
          {letter.generalDescription && <p className="text-neutral-600">{letter.generalDescription}</p>}
        </div>
        {canSign && (
          <a href="#sign" className="rounded-md bg-[#7a1f2b] px-6 py-3 font-semibold text-white hover:opacity-90">
            Sign the letter
          </a>
        )}
      </div>

      {/* The letter itself, in a PDF viewer. */}
      <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
        <span className="font-semibold">The engagement letter</span>
        <span className="flex-1" />
        <a href={`${letterUrl}?dl=1`} className="font-medium text-[#7a1f2b] hover:underline">Download PDF</a>
        <a href={letterUrl} target="_blank" rel="noreferrer" className="font-medium text-[#7a1f2b] hover:underline">Open / print</a>
      </div>
      <iframe
        src={letterUrl}
        title="Engagement letter (PDF)"
        className="mb-2 h-[70vh] min-h-[420px] w-full rounded-lg border border-neutral-300 bg-neutral-100"
      />
      <p className="mb-6 text-xs text-neutral-500">
        If the letter doesn&apos;t display above, use <a href={`${letterUrl}?dl=1`} className="underline">Download PDF</a>.
        {letter.openUntil && letter.status !== "signed" && (
          <> This offer of representation is open until {letter.openUntil.toLocaleString("en-US", { ...CT, dateStyle: "long", timeStyle: "short" })} (Central).</>
        )}
      </p>

      {letter.status === "signed" ? (
        <div className="rounded-lg border border-green-600/40 bg-green-600/10 p-4">
          <p className="font-semibold text-green-800">This engagement letter has been signed.</p>
          <p className="mt-1 text-sm text-neutral-700">
            Signed by {letter.signerName} on {letter.signedAt?.toLocaleString("en-US", { ...CT, dateStyle: "long", timeStyle: "short" })} (Central).
            A copy of the signed letter was emailed to you, and the viewer above shows the signed version.
            Next steps from the engagement email: pay the applicable retainer and email a copy of your driver license.
            Questions? Call {office.phone}.
          </p>
        </div>
      ) : expired ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="font-semibold text-amber-800">This offer of representation has expired.</p>
          <p className="mt-1 text-sm text-neutral-700">Please call the office at {office.phone} to discuss next steps — we may be able to reissue the letter.</p>
        </div>
      ) : (
        <SignForm token={token} clientName={letter.clientName} presetEmail={letter.email} officePhone={office.phone} />
      )}

      <footer className="mt-10 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        <p>{FIRM.name} · {office.label} office · {office.phone}. This page is for the addressee of the engagement letter only.
        Reading this page or the letter does not create an attorney-client relationship; representation begins only as stated in the signed letter.</p>
      </footer>
    </main>
  );
}
