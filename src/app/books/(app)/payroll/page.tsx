import { ComingNext } from "@/components/books/ComingNext";
export default function Page() {
  return <ComingNext title="Payroll" blurb="Runs in QuickBooks today; this module takes it over once it has matched QuickBooks for two cycles side by side." items={[
    "Employees: W-4, I-9, pay rate history, direct-deposit details, PTO accrual. Contractors: W-9 and 1099 tracking.",
    "Each pay run: gross, federal withholding from the IRS tables, Social Security and Medicare, net pay, pay stubs.",
    "Employer taxes: FICA match, FUTA, Texas Workforce Commission unemployment at the firm's own rate.",
    "Deposits and filings calendar: EFTPS deposits, 941, 940, W-2/W-3, 1099-NEC, TWC quarterly report, new-hire reports.",
    "Money moves only through the bank and EFTPS, or a payroll engine, never from this site.",
  ]} />;
}
