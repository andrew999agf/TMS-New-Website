import { ComingNext } from "@/components/books/ComingNext";
export default function Page() {
  return <ComingNext title="Trust (IOLTA)" blurb="Client money, kept to the letter of Texas Rule 1.14." items={[
    "One ledger per client, every deposit and disbursement, never below zero.",
    "The three-way reconciliation each month: bank statement, trust ledger total, and the sum of client ledgers — must agree to the penny.",
    "Earned-fee transfers to operating only against an invoice, with the client's running balance shown.",
    "Trust liability report that ties to the IOLTA bank balance.",
    "Five-year retention of every record, with an audit trail on each entry.",
  ]} />;
}
