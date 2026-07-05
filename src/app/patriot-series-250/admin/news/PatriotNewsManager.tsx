"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Plus, Trash2, Upload, Loader2, X, ExternalLink } from "lucide-react";
import { uploadToBlob } from "@/lib/upload-client";
import { savePatriotSetting } from "../actions";
import { PATRIOT_NEWS_KEY, type PatriotArticle } from "@/lib/patriot/settings";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `story-${Math.random().toString(36).slice(2, 7)}`;

const FIELD =
  "w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none";

/** Banner photo upload: pick a file → stored in media storage → URL saved with the article. */
function BannerField({ value, onChange }: { value?: string; onChange: (url: string | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      onChange(await uploadToBlob(file, "patriot/news"));
    } catch (err) {
      setError((err as Error).message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">Banner photo</p>
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-white/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Article banner" className="h-36 w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-black/90"
            >
              Replace
            </button>
            <button
              onClick={() => onChange(undefined)}
              className="rounded-md bg-black/70 p-1.5 text-white/80 hover:bg-black/90 hover:text-red-300"
              title="Remove banner"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 text-sm text-white/50 transition-colors hover:border-white/40 hover:text-white/80 disabled:opacity-60"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? "Uploading…" : "Upload a banner photo (optional — add it later anytime)"}
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function PatriotNewsManager({ initial }: { initial: PatriotArticle[] }) {
  const [articles, setArticles] = useState<PatriotArticle[]>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (id: string, patch: Partial<PatriotArticle>) =>
    setArticles((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = () =>
    setArticles((as) => [
      {
        id: `story-${Math.random().toString(36).slice(2, 7)}`,
        title: "",
        date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        tournamentYear: new Date().getFullYear(),
        body: "",
      },
      ...as,
    ]);
  const remove = (id: string) => setArticles((as) => as.filter((a) => a.id !== id));

  function save() {
    start(async () => {
      // Titles are required; slugs derive from the title on first save.
      const clean = articles
        .filter((a) => a.title.trim())
        .map((a) => (a.id.startsWith("story-") ? { ...a, id: slugify(a.title) } : a));
      const res = await savePatriotSetting(PATRIOT_NEWS_KEY, clean);
      if (res.ok) {
        setArticles(clean);
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={add}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 transition-colors hover:border-white/40 hover:text-white"
        >
          <Plus size={15} /> New article
        </button>
        <button
          onClick={save}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-red-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {saved ? <Check size={15} /> : null}
          {pending ? "Saving…" : saved ? "Saved" : "Save all"}
        </button>
      </div>

      {articles.length === 0 && <p className="text-sm text-white/50">No articles yet — add your first above.</p>}

      <div className="space-y-4">
        {articles.map((a) => (
          <div key={a.id} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <input
                value={a.title}
                onChange={(e) => update(a.id, { title: e.target.value })}
                placeholder="Headline"
                className={`${FIELD} flex-1 font-semibold`}
              />
              <button
                onClick={() => remove(a.id)}
                className="rounded-lg border border-white/15 p-2 text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300"
                title="Delete article"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <input
              value={a.dek ?? ""}
              onChange={(e) => update(a.id, { dek: e.target.value })}
              placeholder="One-line subhead (shown on the card and under the headline)"
              className={FIELD}
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={a.date}
                onChange={(e) => update(a.id, { date: e.target.value })}
                placeholder="Display date — e.g. July 4, 2026"
                className={`${FIELD} sm:flex-1`}
              />
              <input
                value={a.tournamentYear ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  update(a.id, { tournamentYear: Number.isFinite(n) ? n : undefined });
                }}
                placeholder="Tournament year (links it on Past Tournaments)"
                inputMode="numeric"
                className={`${FIELD} sm:w-72`}
              />
            </div>

            <textarea
              value={a.body}
              onChange={(e) => update(a.id, { body: e.target.value })}
              placeholder="Article text — leave a blank line between paragraphs."
              rows={6}
              className={`${FIELD} leading-relaxed`}
            />

            <BannerField value={a.banner} onChange={(banner) => update(a.id, { banner })} />

            {!a.id.startsWith("story-") && (
              <a
                href={`/news/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/80"
              >
                <ExternalLink size={12} /> /news/{a.id}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
