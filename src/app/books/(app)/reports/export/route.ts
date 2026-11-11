import { NextResponse } from "next/server";
import { getBooksSession, booksCompany } from "@/lib/books/auth";
import { ensureBooks } from "@/lib/books/ensure";
import { toCsv } from "@/lib/books/ledger";
import { buildReport, REPORTS, type ReportId } from "@/lib/books/reports";
import { isIsoDate, todayIso } from "@/lib/books/money";

export const dynamic = "force-dynamic";

/** Any report as a spreadsheet (CSV). Read-only; needs a signed-in books login. */
export async function GET(req: Request) {
  const session = await getBooksSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  await ensureBooks();
  const u = new URL(req.url);
  const id = (REPORTS.some(([k]) => k === u.searchParams.get("r")) ? u.searchParams.get("r") : "pl") as ReportId;
  const today = todayIso();
  const from = isIsoDate(u.searchParams.get("from")) ? u.searchParams.get("from")! : `${today.slice(0, 4)}-01-01`;
  const to = isIsoDate(u.searchParams.get("to")) ? u.searchParams.get("to")! : today;
  const company = await booksCompany(session.companyId);
  const report = await buildReport(session.companyId, id, { from, to, accountId: Number(u.searchParams.get("account")) || undefined, fiscalStartMonth: company?.fiscalYearStartMonth ?? 1, companyName: company?.legalName || company?.name || "" });
  const csv = toCsv([[report.title], [report.subtitle], [], report.columns.map((c) => c.label), ...report.rows.map((r) => r.cells)]);
  const name = `${id}-${id === "bs" || id === "tb" || id === "trust" ? to : `${from}-to-${to}`}.csv`;
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
