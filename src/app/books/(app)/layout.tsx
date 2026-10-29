import { requireBooks, booksCompany, requestHost } from "@/lib/books/auth";
import { ensureBooks } from "@/lib/books/ensure";
import { adminHomeUrl, booksBase } from "@/lib/books/host";
import { BooksShell } from "@/components/books/BooksShell";

export const dynamic = "force-dynamic";

export default async function BooksAppLayout({ children }: { children: React.ReactNode }) {
  await ensureBooks();
  const session = await requireBooks();
  const host = await requestHost();
  const company = await booksCompany(session.companyId);
  return (
    <BooksShell base={booksBase(host)} adminUrl={adminHomeUrl(host)} company={{ name: company?.name ?? "Company", state: company?.state ?? "", taxElection: company?.taxElection ?? "" }} user={{ name: session.name, email: session.email, role: session.role }}>
      {children}
    </BooksShell>
  );
}
