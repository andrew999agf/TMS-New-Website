"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-[70vh] flex items-center bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)]">
      <div className="container-page py-24 text-center">
        <p className="eyebrow text-[var(--c-dark-accent)]">Error</p>
        <h1 className="display-3 mt-4 text-[var(--c-dark-ink)]">Something went wrong.</h1>
        <p className="lead mt-4 text-[var(--c-dark-ink-muted)] max-w-md mx-auto">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <button onClick={reset} className="btn btn-accent">
            Try again
          </button>
          <Link href="/" className="btn btn-ghost-dark">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
