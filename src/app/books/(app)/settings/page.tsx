import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbMemberships, sbTaxRules, sbUsers } from "@/db/schema";
import { requireBooks, booksCompany, primaryAdmin, pendingAccessRequests, booksPublicBase, requestHost } from "@/lib/books/auth";
import { booksBase } from "@/lib/books/host";
import { getGustoConnection, gustoConfigured, gustoEnv, gustoRedirectUri } from "@/lib/books/gusto";
import { GustoConnection, type GustoCard } from "@/components/books/GustoConnection";
import { CompanySettings, type RuleRow, type UserRow, type RequestRow } from "@/components/books/CompanySettings";
import { BooksClose } from "@/components/books/BooksClose";
import { closedThrough } from "@/lib/books/ledger";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ gusto?: string; why?: string }> }) {
  const session = await requireBooks();
  const sp = await searchParams;
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
  const [publicBase, host, conn, closed] = await Promise.all([booksPublicBase(), requestHost(), getGustoConnection(company.id), closedThrough(company.id)]);
  const gusto: GustoCard = {
    configured: gustoConfigured(), environment: gustoEnv(), redirectUri: gustoRedirectUri(publicBase),
    startUrl: `${booksBase(host)}/integrations/gusto/start`,
    connection: conn ? { status: conn.status, environment: conn.environment, companyName: conn.companyName, connectedBy: conn.connectedBy, connectedAt: conn.connectedAt, lastCheckedAt: conn.lastCheckedAt, lastError: conn.lastError } : null,
    flash: sp.gusto === "connected" ? { kind: "ok", text: "Gusto is connected." } : sp.gusto === "error" ? { kind: "error", text: (sp.why ?? "Gusto couldn't be connected.").slice(0, 300) } : null,
  };
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Settings</h1>
      <div className="mt-4"><GustoConnection data={gusto} owner={session.role === "owner"} /></div>
      <div className="mt-6"><BooksClose key={closed} closedThrough={closed} owner={session.role === "owner"} /></div>
      <div className="mt-6"><CompanySettings company={form} users={users} rules={ruleRows} requests={requestRows} owner={session.role === "owner"} /></div>
    </div>
  );
}
