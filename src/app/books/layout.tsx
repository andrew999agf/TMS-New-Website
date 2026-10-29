import type { Metadata } from "next";
import { BOOKS_NAME } from "@/lib/books/host";

export const metadata: Metadata = { title: { default: BOOKS_NAME, template: `%s · ${BOOKS_NAME}` }, robots: { index: false, follow: false } };

/** StartBookkeeping: its own product surface, separate from the firm site's chrome. */
export default function BooksRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">{children}</div>;
}
