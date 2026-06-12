import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex items-center bg-[var(--c-dark-bg)] text-[var(--c-dark-ink)]">
      <div className="container-page py-24 text-center">
        <p className="eyebrow text-[var(--c-dark-accent)]">404</p>
        <h1 className="display-3 mt-4 text-[var(--c-dark-ink)]">This page isn't here.</h1>
        <p className="lead mt-4 text-[var(--c-dark-ink-muted)] max-w-md mx-auto">
          The page you're looking for may have moved. Let's get you back on track.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/" className="btn btn-accent">
            Home
          </Link>
          <Link href="/practice-areas" className="btn btn-ghost-dark">
            Practice Areas
          </Link>
        </div>
      </div>
    </main>
  );
}
