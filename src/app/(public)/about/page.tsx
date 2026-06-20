import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/site/PageHero";
import { TeamProfile, TeamCard } from "@/components/site/TeamProfile";
import { getBlocks, getTeam, getLeadMember } from "@/lib/content";

export const metadata: Metadata = {
  title: "Our Team",
  description:
    "The team behind T. Maxwell Smith, PLLC — led by trial attorney Max Smith, supported by staff across Bosque County and Fort Worth.",
};

export const dynamic = "force-dynamic";

export default async function OurTeamPage() {
  const [about, team, lead] = await Promise.all([
    getBlocks("about"),
    getTeam(),
    getLeadMember(),
  ]);

  const others = team.filter((m) => m.slug !== lead?.slug);

  return (
    <>
      <PageHero
        eyebrow={about["about.hero.eyebrow"]}
        title={about["about.hero.heading"]}
        lead={about["about.hero.subhead"]}
        bgImage={about["about.hero.image"] || undefined}
        focal={about["about.hero.image.focal"]}
      />

      {/* Lead attorney — featured */}
      {lead && (
        <section className="container-page py-16 lg:py-24">
          <TeamProfile member={lead} />
          {lead.bioBeyond || lead.bioPersonal ? null : null}
          <div className="mt-10">
            <Link href="/practice-areas/appellate-law" className="btn btn-outline">
              Watch Max argue before the Court of Appeals <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      )}

      {/* The rest of the team */}
      {others.length > 0 && (
        <section className="bg-[var(--c-surface2)] py-16 lg:py-24">
          <div className="container-page">
            <h2 className="h2">{about["about.team.heading"] ?? "Our Texas Team"}</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((m) => (
                <TeamCard key={m.slug} member={m} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Patriot Series 250 — placeholder entry point */}
      <section className="container-page py-12">
        <Link
          href="/patriot-series-250"
          className="group inline-flex items-center gap-3 rounded-full border border-blue-500/30 bg-gradient-to-r from-blue-700 via-blue-600 to-red-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-blue-900/30 transition-all hover:shadow-xl hover:shadow-red-900/30 hover:brightness-110"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          Patriot Series 250 Whiffle Ball Tournament
          <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </section>
    </>
  );
}
