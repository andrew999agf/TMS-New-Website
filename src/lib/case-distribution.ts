import type { CaseParty } from "@/db/schema";

/** One person a case letter goes to or copies. */
export type Recipient = {
  name: string;
  email: string;
  firm?: string;
  address?: string;
  /** counsel | pro-se | cc */
  kind: "counsel" | "pro-se" | "cc";
  /** attorney / legal-assistant / … for CC people */
  role?: string;
  ours: boolean;
  /** The party this person is attached to. */
  party: string;
};

export type Distribution = {
  /** Opposing counsel of record (and unrepresented opposing parties). */
  to: Recipient[];
  /** Everyone else: our counsel, and every CC person on every side. */
  cc: Recipient[];
  /** People listed on the case with no email address on file. */
  missing: Recipient[];
};

/**
 * Who a letter on this case goes to. The other side's counsel of record are
 * the addressees; everyone else listed under the parties' Counsel of Record
 * (our side included) is copied. One entry per email address.
 */
export function caseDistribution(parties: CaseParty[]): Distribution {
  const to: Recipient[] = [];
  const cc: Recipient[] = [];
  const missing: Recipient[] = [];
  const seen = new Set<string>();

  const add = (list: Recipient[], r: Recipient) => {
    const key = r.email.trim().toLowerCase();
    if (!key) {
      if (!missing.some((m) => m.name.toLowerCase() === r.name.toLowerCase())) missing.push(r);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    list.push(r);
  };

  // Addressees first so a lawyer who is also CC'd elsewhere stays on "To".
  for (const p of parties) {
    if (p.ours) continue;
    if (p.attorney?.name) {
      add(to, { name: p.attorney.name, email: p.attorney.email ?? "", firm: p.attorney.firm, address: p.attorney.address, kind: "counsel", ours: false, party: p.name });
    } else if (p.proSe) {
      add(to, { name: p.name, email: p.email ?? "", address: p.address, kind: "pro-se", ours: false, party: p.name });
    }
  }
  for (const p of parties) {
    if (p.ours && p.attorney?.name) {
      add(cc, { name: p.attorney.name, email: p.attorney.email ?? "", firm: p.attorney.firm, kind: "counsel", ours: true, party: p.name });
    }
    for (const c of p.cc ?? []) {
      add(cc, { name: c.name || c.email || "", email: c.email ?? "", firm: c.firm, kind: "cc", role: c.role, ours: !!p.ours, party: p.name });
    }
  }
  return { to, cc, missing };
}
