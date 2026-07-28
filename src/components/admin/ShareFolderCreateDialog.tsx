"use client";

import { useState } from "react";
import { X, FolderPlus, Loader2 } from "lucide-react";

/** A small "type a name → Create" bubble for making a folder or sub-folder. */
export function ShareFolderCreateDialog({ parent, busy, onCancel, onCreate }: { parent: string; busy?: boolean; onCancel: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const create = () => { const n = name.trim(); if (n) onCreate(n); };
  const parentName = parent ? parent.split("/").pop() : "";

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm rounded-lg bg-[var(--c-surface)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-base"><FolderPlus size={16} className="text-[var(--c-accent)]" /> {parent ? "New sub-folder" : "New folder"}</h3>
          <button onClick={onCancel} className="text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]"><X size={18} /></button>
        </div>
        {parent && <p className="mb-2 text-xs text-[var(--c-ink-muted)]">Inside <strong>{parentName}</strong></p>}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
          placeholder="Folder name"
          autoFocus
          className="w-full rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--c-accent)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={create} disabled={busy || !name.trim()} className="btn btn-accent inline-flex items-center gap-1.5 text-sm py-2 px-4 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />} Create</button>
        </div>
      </div>
    </div>
  );
}
