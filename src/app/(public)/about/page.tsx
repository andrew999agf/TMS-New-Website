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
    </>
  );
}
