/**
 * StartBookkeeping lives at its own hostname (startbookkeeping.<firm domain>)
 * and, until that DNS exists, at /books on the firm site. Edge-safe: used by
 * the middleware and by server components alike.
 */
export const BOOKS_HOST = (process.env.NEXT_PUBLIC_BOOKS_HOST ?? "startbookkeeping.texaslawsmith.com").toLowerCase();
export const BOOKS_NAME = "StartBookkeeping";

/** True when the request arrived on the product's own hostname. */
export function isBooksHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return h === BOOKS_HOST || h.startsWith("startbookkeeping.");
}

/** Path prefix the app's own links need: "" on its hostname, "/books" on the firm site. */
export function booksBase(host: string): string {
  return isBooksHost(host) ? "" : "/books";
}

/** Where "Back to admin" goes from the product. */
export function adminHomeUrl(host: string): string {
  const h = host.split(":")[0].toLowerCase();
  if (!isBooksHost(h)) return "/admin";
  const parent = h.replace(/^startbookkeeping\./, "");
  const local = parent.startsWith("localhost") || parent.startsWith("127.");
  return `${local ? "http" : "https"}://${parent}${local ? `:${host.split(":")[1] ?? "3000"}` : ""}/admin`;
}

/** Where "Open StartBookkeeping" goes from the admin. */
export function booksHomeUrl(host: string): string {
  const h = host.split(":")[0].toLowerCase();
  // On the real firm domain the product has its own hostname; anywhere else
  // (localhost, previews) it answers at /books on the same host.
  if (h === "texaslawsmith.com" || h === "www.texaslawsmith.com") return `https://${BOOKS_HOST}/`;
  return "/books";
}
