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

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0 })}`;
const CT = { timeZone: "America/Chicago" } as const;

/**
 * The client-facing e-sign page. Reached only by the unguessable link the
 * engagement email carries. Shows who the letter is for, the key terms, a
 * download of the full letter, and the signature block. The letter itself is
 * the controlling document — this page's summary never replaces it.
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
  const fees = letter.fees;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed text-[var(--c-ink,#1a1a1a)]">
      <header className="mb-8 border-b border-neutral-300 pb-4">
        <p className="font-[family-name:var(--font-display,Georgia)] text-2xl font-semibold">{FIRM.name}</p>
        <p className="text-sm text-neutral-500">Engagement letter — review and sign · Office: {office.label} · {office.phone}</p>
      </header>

      <h1 className="mb-1 text-xl font-semibold">Proposed engagement for {client}</h1>
      {letter.generalDescription && <p className="mb-4 text-neutral-600">{letter.generalDescription}</p>}

      <div className="mb-6 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
        <p className="mb-2 font-semibold">Key terms (summary only — the letter controls)</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Attorney rate {money(fees.attorneyRate)}/hr · associate {money(fees.associateRate)}/hr · staff {money(fees.staffRate)}/hr</li>
          {letter.phase1 && <li>Phase 1 retainer: {money(fees.phase1Retainer)}</li>}
          {letter.phase2 && <li>Litigation retainer: {money(fees.litigationRetainer)} · minimum trust balance {money(fees.minTrustBalance)} · trial retainer {money(fees.trialRetainer)}</li>}
          {letter.caseStyling && <li>Matter: {letter.caseStyling}{letter.caseNumber ? ` (No. ${letter.caseNumber})` : ""}</li>}
          {letter.openUntil && (
            <li>This offer of representation is open until {letter.openUntil.toLocaleString("en-US", { ...CT, dateStyle: "long", timeStyle: "short" })} (Central).</li>
          )}
        </ul>
      </div>

      <p className="mb-6">
        <a href={`/engage/${token}/letter`}
          className="inline-block rounded-md bg-[#7a1f2b] px-5 py-2.5 font-semibold text-white hover:opacity-90">
          Download the full engagement letter (Word)
        </a>
      </p>

      {letter.status === "signed" ? (
        <div className="rounded-lg border border-green-600/40 bg-green-600/10 p-4">
          <p className="font-semibold text-green-800">This engagement letter has been signed.</p>
          <p className="mt-1 text-sm text-neutral-700">
            Signed by {letter.signerName} on {letter.signedAt?.toLocaleString("en-US", { ...CT, dateStyle: "long", timeStyle: "short" })} (Central).
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
