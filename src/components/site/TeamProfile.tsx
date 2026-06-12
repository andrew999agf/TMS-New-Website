import { Mail, Phone } from "lucide-react";
import { MediaPlaceholder } from "@/components/site/MediaPlaceholder";
import { telHref } from "@/lib/utils";
import type { TeamMemberSeed } from "@/lib/content/defaults/team";

/** Full attorney/staff profile. Used for the lead member and on detail pages. */
export function TeamProfile({ member }: { member: TeamMemberSeed }) {
  const hasSidebar =
    (member.practiceAreas?.length ||
      member.services?.length ||
      member.education?.length ||
      member.barAdmissions?.length ||
      member.courtAdmissions?.length ||
      member.memberships?.length ||
      member.languages) ?? false;

  return (
    <div className={`grid gap-12 ${hasSidebar ? "lg:grid-cols-[1.5fr_0.6fr] lg:gap-16" : ""}`}>
      <div>
        <div className="grid gap-8 sm:grid-cols-[200px_1fr] sm:items-start">
          {member.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.photo}
              alt={member.name}
              className="w-full sm:w-[200px] aspect-[4/5] object-cover border border-[var(--c-border)]"
            />
          ) : (
            <MediaPlaceholder slot="portrait" className="w-full sm:w-[200px] aspect-[4/5]" />
          )}

          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight">{member.name}</h2>
            <p className="eyebrow mt-2">{member.role}</p>

            <div className="mt-5 space-y-1.5 text-sm">
              {member.email && (
                <a href={`mailto:${member.email}`} className="flex items-center gap-2 link-underline w-fit">
                  <Mail size={15} /> {member.email}
                </a>
              )}
              {member.directPhone && (
                <a href={telHref(member.directPhone)} className="flex items-center gap-2 link-underline w-fit">
                  <Phone size={15} /> {member.directPhone}
                </a>
              )}
              {member.barNumber && (
                <p className="text-[var(--c-ink-muted)]">Texas Bar No. {member.barNumber}</p>
              )}
              {member.languages && <p className="text-[var(--c-ink-muted)]">{member.languages}</p>}
            </div>
          </div>
        </div>

        {member.bioProfessional && (
          <div className="mt-10 prose-firm">
            <h3 className="eyebrow eyebrow-muted !mt-0">Professional bio</h3>
            <p>{member.bioProfessional}</p>
          </div>
        )}

        {member.representativeMatters && member.representativeMatters.length > 0 && (
          <div className="mt-10">
            <h3 className="eyebrow eyebrow-muted mb-4">Representative matters</h3>
            <div className="space-y-5">
              {member.representativeMatters.map((m, i) => (
                <div key={i} className="border-l-2 border-[var(--c-accent)] pl-5">
                  <p className="font-[family-name:var(--font-display)] text-lg leading-snug italic">{m.title}</p>
                  {(m.cite || m.court) && (
                    <p className="text-xs text-[var(--c-ink-muted)] uppercase tracking-[0.1em] mt-1">
                      {[m.cite, m.court].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  {m.description && <p className="text-sm text-[var(--c-ink-muted)] mt-2">{m.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {member.experience && member.experience.length > 0 && (
          <div className="mt-10">
            <h3 className="eyebrow eyebrow-muted mb-4">Before T. Maxwell Smith, PLLC</h3>
            <div className="space-y-5">
              {member.experience.map((e, i) => (
                <div key={i}>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-[var(--c-ink-muted)] uppercase tracking-[0.1em] mt-0.5">
                    {[e.org, e.dates, e.location].filter(Boolean).join(" • ")}
                  </p>
                  {e.bullets && (
                    <ul className="mt-2 space-y-1 text-sm text-[var(--c-ink-muted)] list-disc pl-5">
                      {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {member.bioBeyond && (
          <div className="mt-10">
            <h3 className="eyebrow eyebrow-muted mb-3">Beyond T. Maxwell Smith, PLLC</h3>
            <p className="text-[var(--c-ink-muted)] leading-relaxed">{member.bioBeyond}</p>
          </div>
        )}

        {member.bioPersonal && (
          <div className="mt-10">
            <h3 className="eyebrow eyebrow-muted mb-3">Personal</h3>
            <p className="text-[var(--c-ink-muted)] leading-relaxed">{member.bioPersonal}</p>
          </div>
        )}
      </div>

      {hasSidebar && (
        <aside className="space-y-9">
          <SidebarList title="Practice areas" items={member.practiceAreas} />
          <SidebarList title="Services" items={member.services} />
          {member.education && member.education.length > 0 && (
            <div>
              <h3 className="eyebrow eyebrow-muted mb-3">Education</h3>
              <ul className="space-y-3">
                {member.education.map((e, i) => (
                  <li key={i} className="text-sm">
                    <span className="block font-medium">{e.degree}</span>
                    <span className="text-[var(--c-ink-muted)]">
                      {[e.school, e.year, e.location].filter(Boolean).join(" • ")}
                    </span>
                    {e.note && <span className="block text-[var(--c-ink-muted)] text-xs mt-0.5">{e.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <SidebarList title="Bar admissions" items={member.barAdmissions} />
          <SidebarList title="Court admissions" items={member.courtAdmissions} />
          <SidebarList title="Memberships" items={member.memberships} />
        </aside>
      )}
    </div>
  );
}

function SidebarList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="eyebrow eyebrow-muted mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-[var(--c-ink-muted)]">{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function TeamCard({ member }: { member: TeamMemberSeed }) {
  const initials = member.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <a
      href={`/about/${member.slug}`}
      className="group block border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-accent)] transition-colors"
    >
      <div className="aspect-[4/5] bg-[var(--c-surface2)] flex items-center justify-center overflow-hidden">
        {member.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.photo} alt={member.name} className="h-full w-full object-cover" />
        ) : (
          <span className="font-[family-name:var(--font-display)] text-5xl text-[var(--c-ink-muted)] opacity-30">
            {initials}
          </span>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight group-hover:text-[var(--c-accent)] transition-colors">
          {member.name}
        </h3>
        <p className="text-sm text-[var(--c-ink-muted)] mt-1">{member.role}</p>
        {member.office && <p className="text-xs text-[var(--c-ink-muted)] mt-2">{member.office}</p>}
      </div>
    </a>
  );
}
