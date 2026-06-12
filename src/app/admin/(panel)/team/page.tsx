import { AdminHeader } from "@/components/admin/AdminShell";
import { TeamManager } from "@/components/admin/TeamManager";
import { getTeam } from "@/lib/content";
import { db, hasDb } from "@/db";
import { teamMembers } from "@/db/schema";
import { asc } from "drizzle-orm";
import type { TeamInput } from "@/app/admin/(panel)/team/actions";

export const dynamic = "force-dynamic";

type Row = TeamInput & { id: number; slug: string };

export default async function TeamAdmin() {
  let members: Row[] = [];

  if (db) {
    try {
      const rows = await db.select().from(teamMembers).orderBy(asc(teamMembers.sort));
      members = rows.map(toRow);
    } catch {
      members = [];
    }
  }
  if (members.length === 0) {
    const seed = await getTeam(false);
    members = seed.map((m, i) => ({
      id: -(i + 1),
      slug: m.slug,
      name: m.name,
      role: m.role,
      office: m.office ?? "",
      email: m.email ?? "",
      directPhone: m.directPhone ?? "",
      barNumber: m.barNumber ?? "",
      languages: m.languages ?? "",
      photo: m.photo ?? "",
      isAttorney: m.isAttorney,
      isLead: m.isLead,
      visible: true,
      bioProfessional: m.bioProfessional ?? "",
      bioBeyond: m.bioBeyond ?? "",
      bioPersonal: m.bioPersonal ?? "",
      services: m.services ?? [],
      practiceAreas: m.practiceAreas ?? [],
      memberships: m.memberships ?? [],
      barAdmissions: m.barAdmissions ?? [],
      courtAdmissions: m.courtAdmissions ?? [],
    }));
  }

  return (
    <>
      <AdminHeader title="Our Team" description="Attorneys and staff. The lead member is featured at the top of the team page." />
      <div className="p-8">
        <TeamManager members={members} dbEnabled={hasDb} />
      </div>
    </>
  );
}

function toRow(r: typeof teamMembers.$inferSelect): Row {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    role: r.role,
    office: r.office ?? "",
    email: r.email ?? "",
    directPhone: r.directPhone ?? "",
    barNumber: r.barNumber ?? "",
    languages: r.languages ?? "",
    photo: r.photo ?? "",
    isAttorney: r.isAttorney,
    isLead: r.isLead,
    visible: r.visible,
    bioProfessional: r.bioProfessional ?? "",
    bioBeyond: r.bioBeyond ?? "",
    bioPersonal: r.bioPersonal ?? "",
    services: (r.services as string[]) ?? [],
    practiceAreas: (r.practiceAreas as string[]) ?? [],
    memberships: (r.memberships as string[]) ?? [],
    barAdmissions: (r.barAdmissions as string[]) ?? [],
    courtAdmissions: (r.courtAdmissions as string[]) ?? [],
  };
}
