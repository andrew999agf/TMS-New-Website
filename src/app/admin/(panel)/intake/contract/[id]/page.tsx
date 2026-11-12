import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { leadForContract, loadContract } from "@/lib/intake/contracts";
import { ContractBuilder } from "@/components/admin/ContractBuilder";

export const dynamic = "force-dynamic";

/** Fill in a partner-office lead's engagement letter and download it as Word or PDF. */
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const lead = await leadForContract(Number((await params).id));
  if (!lead) notFound();
  const { data, saved, updatedAt, updatedBy } = await loadContract(lead);
  const a = lead.answers;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const intake = [
    { label: "Type of matter", value: s("practiceArea") }, { label: "What they wrote", value: s("description") }, { label: "Other side", value: s("opposingParty") },
    { label: "Other side's attorney", value: s("opposingCounsel") }, { label: "Court case already filed?", value: [s("caseFiled"), s("caseInfo")].filter(Boolean).join(" — ") },
    { label: "County", value: lead.county }, { label: "Telephone", value: lead.phone }, { label: "Preferred language", value: s("preferredLanguage") }, { label: "Their contact at the referring office", value: s("helpedBy") },
  ].filter((x) => x.value);
  const when = updatedAt ? new Date(updatedAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return <ContractBuilder leadId={lead.id} partnerName={lead.partnerName} backHref={`/admin/intake?partner=${lead.partnerSlug}`} initial={data} saved={saved} intake={intake}
    updatedNote={saved ? `Last saved ${when} by ${updatedBy}.` : "Not saved yet: this is what the intake form already told us."} />;
}
