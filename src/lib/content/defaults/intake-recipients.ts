/**
 * Default intake-notification recipients (the "intake team"). Seeded into the
 * database when the table is empty; fully editable afterward in the admin
 * Intake tab (add / remove / edit / scope to specific intake types).
 *
 * `branches: []` means the recipient receives every consultation submission.
 */

export type IntakeRecipientSeed = {
  name: string;
  email: string;
  branches: string[];
  sort: number;
};

export const INTAKE_RECIPIENTS: IntakeRecipientSeed[] = [
  { name: "Max Smith", email: "max@texaslawsmith.com", branches: [], sort: 1 },
  { name: "Frankie Moreno", email: "frankie@richardsandsmith.com", branches: [], sort: 2 },
  { name: "Probate", email: "probate@texaslawsmith.com", branches: [], sort: 3 },
  { name: "Civil Admin", email: "civil.admin@texaslawsmith.com", branches: [], sort: 4 },
];
