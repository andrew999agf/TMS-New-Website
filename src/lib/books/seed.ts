/**
 * Defaults for company #1 — the firm — so nothing has to be typed in to get
 * going. Everything here is a starting value that Settings can change; none
 * of it is referenced by code.
 */
import { FIRM, OFFICES } from "@/lib/firm";

export const ENTITY_TYPES = [
  { id: "pllc", label: "PLLC (professional limited liability company)" },
  { id: "llc", label: "LLC" },
  { id: "pc", label: "Professional corporation" },
  { id: "corp", label: "Corporation" },
  { id: "partnership", label: "Partnership / LLP" },
  { id: "sole", label: "Sole proprietorship" },
] as const;

/** How the IRS taxes the entity — the election, not the entity. */
export const TAX_ELECTIONS = [
  { id: "disregarded", label: "Disregarded entity (Schedule C on the owner's return)" },
  { id: "s_corp", label: "S corporation (Form 1120-S; owner on payroll)" },
  { id: "partnership", label: "Partnership (Form 1065)" },
  { id: "c_corp", label: "C corporation (Form 1120)" },
] as const;

export const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"] as const;

const principal = OFFICES.find((o) => o.isPrincipal) ?? OFFICES[0];

export const DEFAULT_COMPANY = {
  name: FIRM.shortName,
  legalName: FIRM.name,
  dba: "",
  ein: "",
  entityType: "pllc",
  taxElection: "disregarded",
  state: "TX",
  formationState: "TX",
  fiscalYearStartMonth: 1,
  addressLine: principal.mailing?.line ?? principal.street,
  city: principal.mailing?.city ?? principal.city,
  addressState: "TX",
  zip: principal.mailing?.zip ?? principal.zip,
  phone: principal.phone,
  email: FIRM.email,
  operatingBankName: "",
  operatingLast4: "",
  ioltaBankName: "",
  ioltaLast4: "",
  settings: { payrollProvider: "quickbooks", cpaEmail: "", timeTrackerReadOnly: true },
};

export type SeedAccount = { number: string; name: string; type: "asset" | "liability" | "equity" | "income" | "expense"; subtype: string; parent?: string; trust?: boolean; key?: string };

/** A law-firm chart of accounts: operating and IOLTA kept apart from the first line. */
export const DEFAULT_CHART: SeedAccount[] = [
  { number: "1000", name: "Operating bank account", type: "asset", subtype: "bank", key: "operating_bank" },
  { number: "1010", name: "IOLTA trust bank account", type: "asset", subtype: "trust_bank", trust: true, key: "iolta_bank" },
  { number: "1100", name: "Accounts receivable", type: "asset", subtype: "ar", key: "ar" },
  { number: "1200", name: "Client cost advances", type: "asset", subtype: "current_asset", key: "client_advances" },
  { number: "1300", name: "Undeposited funds", type: "asset", subtype: "current_asset", key: "undeposited" },
  { number: "1500", name: "Fixed assets", type: "asset", subtype: "fixed_asset", key: "fixed_assets" },
  { number: "1590", name: "Accumulated depreciation", type: "asset", subtype: "fixed_asset", key: "accum_depreciation" },
  { number: "2000", name: "Accounts payable", type: "liability", subtype: "current_liability", key: "ap" },
  { number: "2100", name: "Credit card", type: "liability", subtype: "credit_card", key: "credit_card" },
  { number: "2200", name: "Client trust liability", type: "liability", subtype: "trust_liability", trust: true, key: "trust_liability" },
  { number: "2300", name: "Payroll liabilities", type: "liability", subtype: "payroll_liability", key: "payroll_liabilities" },
  { number: "2310", name: "Federal income tax withheld", type: "liability", subtype: "payroll_liability", parent: "2300", key: "fit_payable" },
  { number: "2320", name: "Social Security and Medicare payable", type: "liability", subtype: "payroll_liability", parent: "2300", key: "fica_payable" },
  { number: "2330", name: "Federal unemployment (FUTA) payable", type: "liability", subtype: "payroll_liability", parent: "2300", key: "futa_payable" },
  { number: "2340", name: "State unemployment (TWC) payable", type: "liability", subtype: "payroll_liability", parent: "2300", key: "sui_payable" },
  { number: "2400", name: "Franchise tax payable", type: "liability", subtype: "current_liability", key: "franchise_payable" },
  { number: "3000", name: "Owner's capital", type: "equity", subtype: "equity", key: "owner_capital" },
  { number: "3100", name: "Owner's draws", type: "equity", subtype: "equity", key: "owner_draws" },
  { number: "3900", name: "Retained earnings", type: "equity", subtype: "equity", key: "retained_earnings" },
  { number: "4000", name: "Legal fees", type: "income", subtype: "income", key: "fees" },
  { number: "4100", name: "Flat-fee revenue", type: "income", subtype: "income", key: "flat_fees" },
  { number: "4200", name: "Reimbursed client costs", type: "income", subtype: "income", key: "reimbursed_costs" },
  { number: "4300", name: "Interest income", type: "income", subtype: "income", key: "interest" },
  { number: "4900", name: "Other income", type: "income", subtype: "income", key: "other_income" },
  { number: "5000", name: "Salaries and wages", type: "expense", subtype: "payroll", key: "wages" },
  { number: "5100", name: "Payroll taxes (employer)", type: "expense", subtype: "payroll", key: "payroll_taxes" },
  { number: "5200", name: "Employee benefits", type: "expense", subtype: "payroll", key: "benefits" },
  { number: "5300", name: "Contract labor (1099)", type: "expense", subtype: "expense", key: "contract_labor" },
  { number: "6000", name: "Rent", type: "expense", subtype: "expense", key: "rent" },
  { number: "6100", name: "Office supplies", type: "expense", subtype: "expense" },
  { number: "6200", name: "Software and subscriptions", type: "expense", subtype: "expense" },
  { number: "6300", name: "Bar dues and CLE", type: "expense", subtype: "expense" },
  { number: "6400", name: "Malpractice and business insurance", type: "expense", subtype: "expense" },
  { number: "6500", name: "Client costs (unrecovered)", type: "expense", subtype: "expense" },
  { number: "6600", name: "Court and filing fees", type: "expense", subtype: "expense" },
  { number: "6700", name: "Marketing", type: "expense", subtype: "expense" },
  { number: "6800", name: "Travel and mileage", type: "expense", subtype: "expense" },
  { number: "6900", name: "Professional fees (CPA, consultants)", type: "expense", subtype: "expense" },
  { number: "6950", name: "Bank and merchant fees", type: "expense", subtype: "expense" },
  { number: "6990", name: "Depreciation", type: "expense", subtype: "expense" },
];

export type SeedRule = { year: number; jurisdiction: "federal" | "TX"; key: string; label: string; value: unknown; unit: string; source: string; verified: boolean; note?: string };

/**
 * The handful of numbers that change on a schedule. Each carries its source
 * and whether it has been confirmed for the year; the annual review flips
 * `verified`. Payroll math (when it runs here) reads these and nothing else.
 */
export const DEFAULT_RULES: SeedRule[] = [
  { year: 2026, jurisdiction: "federal", key: "ss_rate", label: "Social Security tax rate (employee and employer, each)", value: 0.062, unit: "rate", source: "https://www.irs.gov/publications/p15", verified: true },
  { year: 2026, jurisdiction: "federal", key: "ss_wage_base", label: "Social Security wage base", value: 184500, unit: "usd", source: "https://www.ssa.gov/oact/cola/cbb.html", verified: false, note: "SSA announcement for 2026 — confirm before first 2026 payroll." },
  { year: 2026, jurisdiction: "federal", key: "medicare_rate", label: "Medicare tax rate (employee and employer, each)", value: 0.0145, unit: "rate", source: "https://www.irs.gov/publications/p15", verified: true },
  { year: 2026, jurisdiction: "federal", key: "additional_medicare_rate", label: "Additional Medicare tax (employee only, over the threshold)", value: 0.009, unit: "rate", source: "https://www.irs.gov/publications/p15", verified: true },
  { year: 2026, jurisdiction: "federal", key: "additional_medicare_threshold", label: "Additional Medicare threshold (all filers, withholding)", value: 200000, unit: "usd", source: "https://www.irs.gov/publications/p15", verified: true },
  { year: 2026, jurisdiction: "federal", key: "futa_rate", label: "FUTA effective rate (6.0% less the 5.4% state credit)", value: 0.006, unit: "rate", source: "https://www.irs.gov/forms-pubs/about-form-940", verified: true },
  { year: 2026, jurisdiction: "federal", key: "futa_wage_base", label: "FUTA wage base", value: 7000, unit: "usd", source: "https://www.irs.gov/forms-pubs/about-form-940", verified: true },
  { year: 2026, jurisdiction: "federal", key: "nec_1099_threshold", label: "1099-NEC reporting threshold", value: 2000, unit: "usd", source: "https://www.irs.gov/forms-pubs/about-form-1099-nec", verified: false, note: "Raised from $600 for payments made after 2025 — confirm." },
  { year: 2026, jurisdiction: "federal", key: "mileage_rate", label: "Standard business mileage rate", value: 0.70, unit: "usd_per_mile", source: "https://www.irs.gov/tax-professionals/standard-mileage-rates", verified: false, note: "2025 rate carried forward — set the 2026 rate when the IRS publishes it." },
  { year: 2026, jurisdiction: "federal", key: "form_941_due", label: "Form 941 due dates", value: ["04-30", "07-31", "10-31", "01-31"], unit: "dates", source: "https://www.irs.gov/forms-pubs/about-form-941", verified: true },
  { year: 2026, jurisdiction: "federal", key: "form_940_due", label: "Form 940 due date", value: "01-31", unit: "date", source: "https://www.irs.gov/forms-pubs/about-form-940", verified: true },
  { year: 2026, jurisdiction: "federal", key: "w2_due", label: "W-2 / W-3 to SSA and employees", value: "01-31", unit: "date", source: "https://www.ssa.gov/employer/", verified: true },
  { year: 2026, jurisdiction: "federal", key: "nec_1099_due", label: "1099-NEC to IRS and recipients", value: "01-31", unit: "date", source: "https://www.irs.gov/forms-pubs/about-form-1099-nec", verified: true },
  { year: 2026, jurisdiction: "federal", key: "deposit_schedule", label: "Employment tax deposit schedule (small employer)", value: "monthly-15th", unit: "schedule", source: "https://www.irs.gov/publications/p15", verified: true, note: "Monthly depositor: by the 15th of the following month. Lookback rule decides each year." },
  { year: 2026, jurisdiction: "TX", key: "state_income_tax", label: "State income tax", value: 0, unit: "rate", source: "https://comptroller.texas.gov/", verified: true, note: "Texas has none." },
  { year: 2026, jurisdiction: "TX", key: "sui_wage_base", label: "TWC unemployment taxable wage base", value: 9000, unit: "usd", source: "https://www.twc.texas.gov/programs/unemployment-tax", verified: true },
  { year: 2026, jurisdiction: "TX", key: "sui_rate", label: "TWC unemployment rate (this employer)", value: null, unit: "rate", source: "TWC annual rate notice (mailed each December)", verified: false, note: "Enter the firm's own rate from the notice." },
  { year: 2026, jurisdiction: "TX", key: "sui_report_due", label: "TWC quarterly wage report (Form C-3) due", value: ["04-30", "07-31", "10-31", "01-31"], unit: "dates", source: "https://www.twc.texas.gov/programs/unemployment-tax", verified: true },
  { year: 2026, jurisdiction: "TX", key: "new_hire_report_days", label: "New-hire report deadline", value: 20, unit: "days", source: "https://www.twc.texas.gov/", verified: true },
  { year: 2026, jurisdiction: "TX", key: "franchise_due", label: "Franchise tax report due", value: "05-15", unit: "date", source: "https://comptroller.texas.gov/taxes/franchise/", verified: true },
  { year: 2026, jurisdiction: "TX", key: "franchise_no_tax_due_threshold", label: "Franchise no-tax-due threshold (total revenue)", value: 2470000, unit: "usd", source: "https://comptroller.texas.gov/taxes/franchise/", verified: false, note: "Indexed every two years — confirm for the 2026 report." },
  { year: 2026, jurisdiction: "TX", key: "franchise_rate", label: "Franchise tax rate (services)", value: 0.0075, unit: "rate", source: "https://comptroller.texas.gov/taxes/franchise/", verified: true },
  { year: 2026, jurisdiction: "TX", key: "trust_record_retention_years", label: "Trust account records retention (Texas Rule 1.14)", value: 5, unit: "years", source: "https://www.texasbar.com/", verified: true },
  { year: 2026, jurisdiction: "TX", key: "sales_tax_on_legal_services", label: "Sales tax on legal services", value: false, unit: "bool", source: "https://comptroller.texas.gov/", verified: true, note: "Not taxable." },
];
