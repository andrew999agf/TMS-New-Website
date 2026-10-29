import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbMemberships, sbTaxRules, sbUsers } from "@/db/schema";
import { requireBooks, booksCompany } from "@/lib/books/auth";
import { CompanySettings, type RuleRow, type UserRow } from "@/components/books/CompanySettings";

export default async function SettingsPage() {
  const session = await requireBooks();
  const company = await booksCompany(session.companyId);
  if (!company || !db) return null;
  const [members, rules] = await Promise.all([
    db.select({ id: sbUsers.id, email: sbUsers.email, name: sbUsers.name, role: sbMemberships.role, lastLoginAt: sbUsers.lastLoginAt }).from(sbMemberships).innerJoin(sbUsers, eq(sbUsers.id, sbMemberships.userId)).where(eq(sbMemberships.companyId, company.id)).orderBy(asc(sbUsers.email)),
    db.select().from(sbTaxRules).where(eq(sbTaxRules.year, new Date().getFullYear())).orderBy(asc(sbTaxRules.jurisdiction), asc(sbTaxRules.id)),
  ]);
  const users: UserRow[] = members.map((m) => ({ id: m.id, email: m.email, name: m.name, role: m.role, lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null, me: String(m.id) === session.sub }));
  const ruleRows: RuleRow[] = rules.map((r) => ({ id: r.id, jurisdiction: r.jurisdiction, key: r.key, label: r.label, value: r.value, unit: r.unit, source: r.source, note: r.note, verified: r.verified, verifiedBy: r.verifiedBy }));
  const { id: _id, createdAt: _c, updatedAt: _u, settings: _s, ...form } = company; void _id; void _c; void _u; void _s;
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Settings</h1>
      <div className="mt-4"><CompanySettings company={form} users={users} rules={ruleRows} owner={session.role === "owner"} /></div>
    </div>
  );
}
