/** Flatten intake answers into a single-row CSV suitable for import. */
export function answersToCsv(meta: Record<string, string>, answers: Record<string, unknown>): string {
  const flat: Record<string, string> = { ...meta };
  for (const [k, v] of Object.entries(answers)) {
    flat[k] = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
  }
  const headers = Object.keys(flat);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const headerRow = headers.map(escape).join(",");
  const valueRow = headers.map((h) => escape(flat[h])).join(",");
  return `${headerRow}\n${valueRow}\n`;
}
