/** Client-side helpers for turning a drop / file input (including whole folders,
 *  with subfolders) into a flat list of files that keep their relative path.
 *  DOM-only; import from client components. */

export type PickedFile = { file: File; path: string };

export const isJunk = (name: string) => name === ".DS_Store" || name === "Thumbs.db" || name.startsWith("._");

/** How many file/folder items a drop carried. Read this SYNCHRONOUSLY (before any
 *  await) — the item list is emptied once the drop event finishes. Lets a caller
 *  tell "nothing was dropped" apart from "a folder was dropped but this device
 *  couldn't read its contents" (some tablets/older Safari can't walk folders). */
export function countDropItems(dt: DataTransfer): number {
  try {
    const items = Array.from(dt.items ?? []).filter((i) => i.kind === "file").length;
    return items || dt.files?.length || 0;
  } catch {
    return dt.files?.length || 0;
  }
}

/** Read every File out of a dropped item list, walking into folders via the
 *  webkitGetAsEntry API. Entries are captured synchronously before any await.
 *
 *  Resilient by design: a single unreadable file or directory never aborts the
 *  whole drop (the old code rejected on the first error, and because the caller
 *  didn't catch it, a folder drop would fail completely and silently). Here every
 *  step swallows its own errors and returns whatever it could read. */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const roots: FileSystemEntry[] = [];
  try {
    for (let i = 0; i < dt.items.length; i++) {
      const entry = dt.items[i].webkitGetAsEntry?.();
      if (entry) roots.push(entry);
    }
  } catch {
    /* items list unavailable — fall through to dt.files below */
  }
  if (roots.length === 0) {
    return Array.from(dt.files ?? []).filter((f) => !isJunk(f.name)).map((f) => ({ file: f, path: f.name }));
  }
  const out: PickedFile[] = [];
  // Read a directory to exhaustion. readEntries returns at most ~100 per call, so
  // we loop until it's empty. On error we resolve with what we have rather than
  // reject, so one bad directory can't sink the batch.
  const readDir = (reader: FileSystemDirectoryReader) =>
    new Promise<FileSystemEntry[]>((resolve) => {
      const acc: FileSystemEntry[] = [];
      const step = () => reader.readEntries(
        (batch) => { if (!batch.length) return resolve(acc); acc.push(...batch); step(); },
        () => resolve(acc),
      );
      step();
    });
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    try {
      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
        if (!isJunk(file.name)) out.push({ file, path: prefix + file.name });
      } else if (entry.isDirectory) {
        const children = await readDir((entry as FileSystemDirectoryEntry).createReader());
        for (const child of children) await walk(child, `${prefix}${entry.name}/`);
      }
    } catch {
      /* skip this entry; keep everything else */
    }
  }
  for (const r of roots) await walk(r, "");
  // Last-ditch fallback: if entry-walking produced nothing but the browser also
  // exposed plain files (some engines populate both), use those.
  if (out.length === 0 && dt.files?.length) {
    return Array.from(dt.files).filter((f) => !isJunk(f.name)).map((f) => ({ file: f, path: f.name }));
  }
  return out;
}

/** Map a file input's FileList to PickedFiles, honoring a directory pick. */
export function fromInput(list: FileList | null): PickedFile[] {
  return Array.from(list ?? []).map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name })).filter((p) => !isJunk(p.file.name));
}
