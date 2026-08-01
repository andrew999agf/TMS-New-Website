import { INTAKE_FIELDS, fieldLabel, formatAnswerValue } from "./config";

// Internal/technical keys that shouldn't appear in the readable sheet.
const HIDE = new Set(["consent", "company", "turnstileToken", "referrer", "resumeToken", "website", "description"]);

/**
 * A clean, readable "Field, Answer" spreadsheet of one submission for the intake
 * team — labeled questions in the order they're asked, with people, addresses,
 * gifts, and residuary shares formatted into plain text. Empty answers and
 * internal fields are omitted, so there's no clutter or duplicate noise.
 */
export function answersToCsv(meta: Record<string, string>, answers: Record<string, unknown>): string {
  const escape = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const row = (label: string, value: string) => [escape(label), escape(value)].join(",");
  const lines = ["Field,Answer"];

  for (const [k, v] of Object.entries(meta)) {
    if (v == null || String(v).trim() === "") continue;
    lines.push(row(fieldLabel(k), String(v)));
  }

  const shown = new Set<string>();
  for (const f of INTAKE_FIELDS) {
    if (HIDE.has(f.name)) continue;
    const val = formatAnswerValue(answers[f.name]);
    if (!val.trim()) continue;
    shown.add(f.name);
    lines.push(row(f.label, val));
  }
  // Any answered keys not in the known field list (edge cases).
  for (const [k, v] of Object.entries(answers)) {
    if (shown.has(k) || HIDE.has(k)) continue;
    const val = formatAnswerValue(v);
    if (!val.trim()) continue;
    lines.push(row(fieldLabel(k), val));
  }

  // BOM so Excel reads UTF-8 correctly.
  return "﻿" + lines.join("\n") + "\n";
}
