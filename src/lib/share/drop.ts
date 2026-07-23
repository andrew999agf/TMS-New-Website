/** Client-side helpers for turning a drop / file input (including whole folders,
 *  with subfolders) into a flat list of files that keep their relative path.
 *  DOM-only; import from client components. */

export type PickedFile = { file: File; path: string };

export const isJunk = (name: string) => name === ".DS_Store" || name === "Thumbs.db" || name.startsWith("._");

/** Read every File out of a dropped item list, walking into folders via the
 *  webkitGetAsEntry API. Entries are captured synchronously before any await. */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const roots: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  if (roots.length === 0) {
    return Array.from(dt.files).filter((f) => !isJunk(f.name)).map((f) => ({ file: f, path: f.name }));
  }
  const out: PickedFile[] = [];
  const readDir = (reader: FileSystemDirectoryReader) =>
    new Promise<FileSystemEntry[]>((resolve, reject) => {
      const acc: FileSystemEntry[] = [];
      const step = () => reader.readEntries((batch) => { if (!batch.length) return resolve(acc); acc.push(...batch); step(); }, reject);
      step();
    });
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      if (!isJunk(file.name)) out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      const children = await readDir((entry as FileSystemDirectoryEntry).createReader());
      for (const child of children) await walk(child, `${prefix}${entry.name}/`);
    }
  }
  for (const r of roots) await walk(r, "");
  return out;
}

/** Map a file input's FileList to PickedFiles, honoring a directory pick. */
export function fromInput(list: FileList | null): PickedFile[] {
  return Array.from(list ?? []).map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name })).filter((p) => !isJunk(p.file.name));
}
