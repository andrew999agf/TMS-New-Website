import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero, Breadcrumbs } from "@/components/site/PageHero";
import { TeamProfile } from "@/components/site/TeamProfile";
import { JsonLd } from "@/components/site/JsonLd";
import { getTeam, getTeamMember } from "@/lib/content";

export async function generateStaticParams() {
  const team = await getTeam(false);
  return team.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const member = await getTeamMember(slug);
  if (!member) return {};
  return {
    title: `${member.name} — ${member.role}`,
    description: member.bioProfessional?.slice(0, 160),
  };
}

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const member = await getTeamMember(slug);
  if (!member) notFound();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": member.isAttorney ? "Attorney" : "Person",
          name: member.name,
          jobTitle: member.role,
          email: member.email,
          telephone: member.directPhone,
          worksFor: { "@type": "LegalService", name: "T. Maxwell Smith, PLLC" },
        }}
      />
      <PageHero eyebrow={member.role} title={member.name}>
        <div className="mt-6">
          <Breadcrumbs items={[{ label: "Our Team", href: "/about" }, { label: member.name }]} />
        </div>
      </PageHero>
      <div className="container-page py-16 lg:py-24">
        <TeamProfile member={member} />
      </div>
    </>
  );
}
