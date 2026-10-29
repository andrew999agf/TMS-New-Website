import { ComingNext } from "@/components/books/ComingNext";
export default function Page() {
  return <ComingNext title="Banking" blurb="Operating account only — the IOLTA account lives under Trust and never mixes with it." items={[
    "Bank transactions imported from a CSV or a read-only bank feed (the site can look, never move money).",
    "Categorize each transaction to the chart of accounts, by matter where it applies.",
    "Monthly reconciliation against the statement balance.",
    "Client cost advances and their recovery on invoices.",
    "Credit card feed and reconciliation.",
  ]} />;
}
