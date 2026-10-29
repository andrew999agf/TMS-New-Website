import { ComingNext } from "@/components/books/ComingNext";
export default function Page() {
  return <ComingNext title="Reports" blurb="What the firm, the State Bar, and the CPA each need to see." items={[
    "Profit and loss, balance sheet, cash flow — by month, quarter, or year.",
    "Income by matter and by attorney, read from the Time Tracker (read-only).",
    "Aged receivables and write-offs.",
    "Trust liability and three-way reconciliation history.",
    "Year-end CPA package: general ledger, trial balance, fixed assets and depreciation, 1099 summary, payroll summary.",
  ]} />;
}
