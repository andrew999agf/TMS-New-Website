import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbMemberships, sbTaxRules, sbUsers } from "@/db/schema";
import { requireBooks, booksCompany, primaryAdmin, pendingAccessRequests } from "@/lib/books/auth";
import { CompanySettings, type RuleRow, type UserRow, type RequestRow } from "@/components/books/CompanySettings";

export default async function SettingsPage() {
  const session = await requireBooks();
  const company = await booksCompany(session.companyId);
  if (!company || !db) return null;
  const [members, rules, primary, requests] = await Promise.all([
    db.select({ id: sbUsers.id, email: sbUsers.email, name: sbUsers.name, role: sbMemberships.role, lastLoginAt: sbUsers.lastLoginAt }).from(sbMemberships).innerJoin(sbUsers, eq(sbUsers.id, sbMemberships.userId)).where(eq(sbMemberships.companyId, company.id)).orderBy(asc(sbUsers.email)),
    db.select().from(sbTaxRules).where(eq(sbTaxRules.year, new Date().getFullYear())).orderBy(asc(sbTaxRules.jurisdiction), asc(sbTaxRules.id)),
    primaryAdmin(company.id),
    session.role === "owner" ? pendingAccessRequests(company.id) : Promise.resolve([]),
  ]);
  const users: UserRow[] = members.map((m) => ({ id: m.id, email: m.email, name: m.name, role: m.role, lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null, me: String(m.id) === session.sub, primary: m.id === primary?.id }));
  const requestRows: RequestRow[] = requests.map((r) => ({ id: r.id, email: r.email, name: r.name, adminRole: r.adminRole, createdAt: r.createdAt.toISOString() }));
  const ruleRows: RuleRow[] = rules.map((r) => ({ id: r.id, jurisdiction: r.jurisdiction, key: r.key, label: r.label, value: r.value, unit: r.unit, source: r.source, note: r.note, verified: r.verified, verifiedBy: r.verifiedBy }));
  const { id: _id, createdAt: _c, updatedAt: _u, settings: _s, primaryUserId: _p, ...form } = company; void _id; void _c; void _u; void _s; void _p;
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Settings</h1>
      <div className="mt-4"><CompanySettings company={form} users={users} rules={ruleRows} requests={requestRows} owner={session.role === "owner"} /></div>
    </div>
  );
}
