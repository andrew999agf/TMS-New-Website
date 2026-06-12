"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ImageUploadField } from "./ImageUploadField";
import {
  saveTeamMember,
  deleteTeamMember,
  reorderTeamMember,
  type TeamInput,
} from "@/app/admin/(panel)/team/actions";

type Member = TeamInput & { id: number; slug: string };

const empty: TeamInput = {
  name: "", role: "", office: "", email: "", directPhone: "", barNumber: "", languages: "",
  photo: "", isAttorney: false, isLead: false, visible: true,
  bioProfessional: "", bioBeyond: "", bioPersonal: "",
  services: [], practiceAreas: [], memberships: [], barAdmissions: [], courtAdmissions: [],
};

export function TeamManager({ members, dbEnabled }: { members: Member[]; dbEnabled: boolean }) {
  const [editing, setEditing] = useState<TeamInput | null>(null);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[var(--c-ink-muted)]">{members.length} team members · drag order controls page order</p>
        <button onClick={() => setEditing(empty)} disabled={!dbEnabled} className="btn btn-accent text-sm py-2.5 px-4 disabled:opacity-50">
          <Plus size={16} /> Add member
        </button>
      </div>

      {editing && <TeamForm initial={editing} onClose={() => setEditing(null)} />}

      <div className="mt-5 rounded-lg border border-[var(--c-border)] overflow-hidden divide-y divide-[var(--c-border)]">
        {members.map((m, i) => (
          <Row key={m.id} member={m} first={i === 0} last={i === members.length - 1} onEdit={() => setEditing(m)} dbEnabled={dbEnabled} />
        ))}
      </div>
      {!dbEnabled && (
        <p className="mt-4 text-sm text-[var(--c-ink-muted)]">
          Showing seed data. Connect the database and run the seed to enable editing.
        </p>
      )}
    </div>
  );
}

function Row({ member, first, last, onEdit, dbEnabled }: { member: Member; first: boolean; last: boolean; onEdit: () => void; dbEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => startTransition(() => { void fn(); });
  return (
    <div className={`px-5 py-3.5 bg-[var(--c-surface)] flex items-center justify-between gap-4 ${member.visible ? "" : "opacity-60"}`}>
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-2">
          {member.name}
          {member.isLead && <span className="text-[10px] uppercase tracking-wide bg-[var(--c-accent)] text-[var(--c-on-accent)] px-1.5 py-0.5 rounded">Lead</span>}
        </div>
        <div className="text-xs text-[var(--c-ink-muted)]">{member.role}{member.office ? ` · ${member.office}` : ""}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button disabled={first || pending} onClick={() => run(() => reorderTeamMember(member.id, "up"))} className="text-[var(--c-ink-muted)] disabled:opacity-30"><ChevronUp size={16} /></button>
        <button disabled={last || pending} onClick={() => run(() => reorderTeamMember(member.id, "down"))} className="text-[var(--c-ink-muted)] disabled:opacity-30"><ChevronDown size={16} /></button>
        <Link href={`/about/${member.slug}`} target="_blank" className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)]"><ExternalLink size={15} /></Link>
        <button onClick={onEdit} disabled={!dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-accent)] disabled:opacity-40"><Pencil size={15} /></button>
        <button onClick={() => run(() => deleteTeamMember(member.id))} disabled={pending || !dbEnabled} className="text-[var(--c-ink-muted)] hover:text-[var(--c-error)] disabled:opacity-40"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function TeamForm({ initial, onClose }: { initial: TeamInput; onClose: () => void }) {
  const [form, setForm] = useState<TeamInput>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cls = "w-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-sm outline-none focus:border-[var(--c-accent)]";

  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const text = (a: string[]) => a.join("\n");

  function save() {
    startTransition(async () => {
      const res = await saveTeamMember(form);
      if (res.ok) onClose();
      else setError(res.error ?? "Save failed");
    });
  }

  return (
    <div className="rounded-lg border border-[var(--c-accent)] bg-[var(--c-surface)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-ui)] font-semibold">{initial.id ? "Edit member" : "New member"}</h3>
        <button onClick={onClose} className="text-[var(--c-ink-muted)]"><X size={18} /></button>
      </div>

      <ImageUploadField value={form.photo} onChange={(url) => setForm({ ...form, photo: url })} slot="portrait" folder="team" label="Photo" />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={cls} /></Field>
        <Field label="Role"><input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={cls} /></Field>
        <Field label="Office"><input value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} className={cls} /></Field>
        <Field label="Languages"><input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} className={cls} /></Field>
        <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={cls} /></Field>
        <Field label="Direct phone"><input value={form.directPhone} onChange={(e) => setForm({ ...form, directPhone: e.target.value })} className={cls} /></Field>
        <Field label="Texas Bar #"><input value={form.barNumber} onChange={(e) => setForm({ ...form, barNumber: e.target.value })} className={cls} /></Field>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isAttorney} onChange={(e) => setForm({ ...form, isAttorney: e.target.checked })} className="accent-[var(--c-accent)]" /> Attorney</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isLead} onChange={(e) => setForm({ ...form, isLead: e.target.checked })} className="accent-[var(--c-accent)]" /> Lead (featured)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} className="accent-[var(--c-accent)]" /> Visible</label>
      </div>

      <Field label="Professional bio"><textarea value={form.bioProfessional} onChange={(e) => setForm({ ...form, bioProfessional: e.target.value })} rows={4} className={cls} /></Field>
      <Field label="Beyond the firm"><textarea value={form.bioBeyond} onChange={(e) => setForm({ ...form, bioBeyond: e.target.value })} rows={2} className={cls} /></Field>
      <Field label="Personal"><textarea value={form.bioPersonal} onChange={(e) => setForm({ ...form, bioPersonal: e.target.value })} rows={2} className={cls} /></Field>

      <p className="text-xs text-[var(--c-ink-muted)] pt-1">One item per line:</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Practice areas"><textarea value={text(form.practiceAreas)} onChange={(e) => setForm({ ...form, practiceAreas: lines(e.target.value) })} rows={4} className={cls} /></Field>
        <Field label="Services"><textarea value={text(form.services)} onChange={(e) => setForm({ ...form, services: lines(e.target.value) })} rows={4} className={cls} /></Field>
        <Field label="Bar admissions"><textarea value={text(form.barAdmissions)} onChange={(e) => setForm({ ...form, barAdmissions: lines(e.target.value) })} rows={3} className={cls} /></Field>
        <Field label="Court admissions"><textarea value={text(form.courtAdmissions)} onChange={(e) => setForm({ ...form, courtAdmissions: lines(e.target.value) })} rows={3} className={cls} /></Field>
        <Field label="Memberships"><textarea value={text(form.memberships)} onChange={(e) => setForm({ ...form, memberships: lines(e.target.value) })} rows={3} className={cls} /></Field>
      </div>
      <p className="text-xs text-[var(--c-ink-muted)]">Education, prior experience, and representative matters are managed via the seed data for now.</p>

      {error && <p className="text-sm text-[var(--c-error)]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="btn btn-accent text-sm py-2 px-4 disabled:opacity-60"><Check size={15} /> Save</button>
        <button onClick={onClose} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
