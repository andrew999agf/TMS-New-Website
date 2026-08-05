/**
 * Natural ("alphanumeric") ordering for share-folder names, sub-folders, and
 * documents. Client-safe — no server imports.
 *
 * Plain `localeCompare` compares digits as text, so "Exhibit 10" lands before
 * "Exhibit 2" and "Batch 2" after "Batch 11". A numeric-aware collator reads
 * runs of digits as numbers, which is what people mean by alphanumeric order.
 * Case is ignored so "apple" and "Apple" sort together instead of by ASCII.
 */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Compare two folder/file names in natural alphanumeric order. */
export function compareNatural(a: string, b: string): number {
  return collator.compare(a ?? "", b ?? "");
}

/**
 * Compare two full paths ("Discovery/Batch 2/photo 10.jpg") segment by segment,
 * so everything stays grouped under its folder instead of interleaving on raw
 * string order. Shallower paths sort first when one is a prefix of the other.
 */
export function comparePaths(a: string, b: string): number {
  const A = (a ?? "").split("/").filter(Boolean);
  const B = (b ?? "").split("/").filter(Boolean);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const c = compareNatural(A[i], B[i]);
    if (c !== 0) return c;
  }
  return A.length - B.length;
}
