import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * A cheap hash of everything another user can change in a discovery set's
 * three tabs: client documents received (red), documents staged to be
 * produced (yellow), and productions (green), plus the opposing-party docs.
 * It reads identifying fields only — never page text — so polling it every
 * few seconds is effectively free. Any change means "re-render the page".
 */
export async function discoveryFingerprint(setId: number, matter: string | null): Promise<string> {
  if (!db) return "";
  const res = await db.execute(sql`
    SELECT md5(concat_ws('|',
      (SELECT coalesce(string_agg(concat_ws(':', id, coalesce(production_id, 0), bates_start, bates_end,
              coalesce(page_count, 0), jsonb_array_length(source_pages), jsonb_array_length(page_bates), name), ',' ORDER BY id), '')
         FROM production_docs WHERE set_id = ${setId}),
      (SELECT coalesce(string_agg(concat_ws(':', id, coalesce(produced_at::text, ''), file_name, bates_end), ',' ORDER BY id), '')
         FROM productions WHERE set_id = ${setId}),
      (SELECT coalesce(string_agg(concat_ws(':', id, coalesce(page_count, 0), name), ',' ORDER BY id), '')
         FROM discovery_docs WHERE set_id = ${setId}),
      (SELECT coalesce(string_agg(concat_ws(':', f.id, f.filename), ',' ORDER BY f.id), '')
         FROM share_files f JOIN share_folders d ON d.id = f.folder_id
         WHERE ${matter ?? ""} <> '' AND d.matter = ${matter ?? ""} AND d.type = 'client' AND d.archived = false)
    )) AS v`);
  const rows = (res as unknown as { rows?: { v: string }[] }).rows ?? (res as unknown as { v: string }[]);
  return rows[0]?.v ?? "";
}
