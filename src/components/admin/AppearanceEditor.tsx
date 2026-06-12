"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { Check } from "lucide-react";
import {
  COLOR_PALETTES,
  FONT_PALETTES,
  COLOR_VAR,
  getColorPalette,
  getFontPalette,
  type ColorTokens,
} from "@/lib/theme/palettes";
import { contrastRatio, gradeContrast, type ActiveTheme } from "@/lib/theme/css";
import { saveTheme } from "@/app/admin/(panel)/appearance/actions";

const TOKEN_LABELS: { key: keyof ColorTokens; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "ink", label: "Ink (text)" },
  { key: "inkMuted", label: "Muted ink" },
  { key: "border", label: "Border" },
  { key: "accent", label: "Accent" },
  { key: "onAccent", label: "On accent" },
  { key: "term", label: "Glossary term" },
  { key: "link", label: "Link" },
  { key: "darkBg", label: "Dark background" },
  { key: "darkInk", label: "Dark ink" },
  { key: "darkAccent", label: "Dark accent" },
];

export function AppearanceEditor({ initial }: { initial: ActiveTheme }) {
  const [theme, setTheme] = useState<ActiveTheme>(initial);
  const [customColor, setCustomColor] = useState(Boolean(initial.colorOverrides));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const tokens: ColorTokens = useMemo(() => {
    const base = getColorPalette(theme.colorPaletteId).tokens;
    return { ...base, ...(theme.colorOverrides ?? {}) };
  }, [theme]);

  const font = getFontPalette(theme.fontPaletteId);

  function setColorPalette(id: string) {
    setTheme((t) => ({ ...t, colorPaletteId: id, colorOverrides: customColor ? t.colorOverrides : undefined }));
    setSaved(false);
  }
  function setFontPalette(id: string) {
    setTheme((t) => ({ ...t, fontPaletteId: id }));
    setSaved(false);
  }
  function setToken(key: keyof ColorTokens, value: string) {
    setTheme((t) => ({ ...t, colorOverrides: { ...(t.colorOverrides ?? {}), [key]: value } }));
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      const payload: ActiveTheme = {
        ...theme,
        colorOverrides: customColor ? theme.colorOverrides : undefined,
      };
      const res = await saveTheme(payload);
      if (res.ok) setSaved(true);
    });
  }

  // Preview scope: apply the selected tokens as CSS variables so children that
  // read var(--c-*) reflect the in-progress selection live.
  const previewStyle = useMemo(() => {
    const style: Record<string, string> = {};
    (Object.keys(COLOR_VAR) as (keyof ColorTokens)[]).forEach((k) => {
      style[COLOR_VAR[k]] = tokens[k];
    });
    style["--font-display"] = font.display;
    style["--font-body"] = font.body;
    return style as CSSProperties;
  }, [tokens, font]);

  const accentContrast = contrastRatio(tokens.accent, tokens.onAccent);
  const bodyContrast = contrastRatio(tokens.bg, tokens.ink);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_420px]">
      {/* Controls */}
      <div className="space-y-10">
        {/* Color palettes */}
        <section>
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-1">Color palette</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            Click a palette to apply it. All combinations are tested for AA contrast.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_PALETTES.map((p) => {
              const active = !customColor && theme.colorPaletteId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setCustomColor(false);
                    setColorPalette(p.id);
                  }}
                  className={`text-left rounded-lg border-2 p-3 transition-colors ${
                    active ? "border-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink-muted)]"
                  }`}
                >
                  <div className="flex gap-1.5 mb-2">
                    {[p.tokens.bg, p.tokens.ink, p.tokens.accent, p.tokens.darkBg, p.tokens.term].map((c, i) => (
                      <span key={i} className="h-7 w-7 rounded" style={{ background: c, border: "1px solid rgba(0,0,0,.1)" }} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.name}</span>
                    {active && <Check size={15} className="text-[var(--c-accent)]" />}
                  </div>
                </button>
              );
            })}
            <button
              onClick={() => setCustomColor(true)}
              className={`text-left rounded-lg border-2 p-3 transition-colors ${
                customColor ? "border-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink-muted)]"
              }`}
            >
              <div className="h-7 mb-2 rounded bg-gradient-to-r from-red-400 via-green-400 to-blue-400" />
              <span className="text-sm font-medium">Custom…</span>
            </button>
          </div>
        </section>

        {/* Custom token editor */}
        {customColor && (
          <section className="rounded-lg border border-[var(--c-border)] p-5">
            <h3 className="font-[family-name:var(--font-ui)] font-semibold mb-1">Custom tokens</h3>
            <div className="mb-4 flex flex-wrap gap-4 text-xs">
              <ContrastBadge label="Body text" ratio={bodyContrast} />
              <ContrastBadge label="Accent button" ratio={accentContrast} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOKEN_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={tokens[key]}
                    onChange={(e) => setToken(key, e.target.value)}
                    className="h-9 w-9 rounded border border-[var(--c-border)] cursor-pointer bg-transparent"
                  />
                  <div className="min-w-0">
                    <div className="text-sm">{label}</div>
                    <input
                      value={tokens[key]}
                      onChange={(e) => setToken(key, e.target.value)}
                      className="text-xs text-[var(--c-ink-muted)] bg-transparent border-b border-[var(--c-border)] w-24 outline-none focus:border-[var(--c-accent)]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Font palettes */}
        <section>
          <h2 className="font-[family-name:var(--font-ui)] font-semibold mb-1">Typography</h2>
          <p className="text-sm text-[var(--c-ink-muted)] mb-4">
            Five curated pairings, metric-matched so switching never breaks layout.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FONT_PALETTES.map((f) => {
              const active = theme.fontPaletteId === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFontPalette(f.id)}
                  className={`text-left rounded-lg border-2 p-4 transition-colors ${
                    active ? "border-[var(--c-accent)]" : "border-[var(--c-border)] hover:border-[var(--c-ink-muted)]"
                  }`}
                  style={{ ["--fd" as string]: f.display, ["--fb" as string]: f.body } as CSSProperties}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{f.name}</span>
                    {active && <Check size={15} className="text-[var(--c-accent)]" />}
                  </div>
                  <div className="text-2xl leading-none" style={{ fontFamily: "var(--fd)" }}>
                    {f.displayLabel}
                  </div>
                  <div className="text-sm mt-1.5 text-[var(--c-ink-muted)]" style={{ fontFamily: "var(--fb)" }}>
                    {f.bodyLabel} — The record talks.
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button onClick={handleSave} disabled={pending} className="btn btn-accent disabled:opacity-60">
            {pending ? "Publishing…" : "Publish theme"}
          </button>
          {saved && (
            <span className="text-sm text-[var(--c-success)] flex items-center gap-1.5">
              <Check size={16} /> Published site-wide
            </span>
          )}
        </div>
      </div>

      {/* Live preview */}
      <div className="xl:sticky xl:top-6 self-start">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--c-ink-muted)] mb-2">
          Live preview
        </div>
        <div className="rounded-lg overflow-hidden border border-[var(--c-border)] shadow-lg" style={previewStyle}>
          {/* dark hero */}
          <div style={{ background: "var(--c-dark-bg)" }} className="p-6">
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--c-dark-accent)", fontFamily: "var(--font-body)" }}>
              T. Maxwell Smith, PLLC
            </div>
            <div className="text-2xl mt-2 leading-tight" style={{ color: "var(--c-dark-ink)", fontFamily: "var(--font-display)" }}>
              Trial lawyers for the whole of Texas law.
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--c-dark-ink-muted)", fontFamily: "var(--font-body)" }}>
              Prepared for trial from day one.
            </p>
            <div className="mt-3 inline-flex text-xs px-3 py-2 rounded" style={{ background: "var(--c-accent)", color: "var(--c-on-accent)", fontFamily: "var(--font-body)" }}>
              Request a Consultation
            </div>
          </div>
          {/* light content */}
          <div style={{ background: "var(--c-bg)" }} className="p-6">
            <div className="text-lg" style={{ color: "var(--c-ink)", fontFamily: "var(--font-display)" }}>
              The record talks.
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--c-ink-muted)", fontFamily: "var(--font-body)" }}>
              Over a thousand matters. Jury trials, bench trials, appeals. We have seen how this goes. A{" "}
              <span style={{ color: "var(--c-term)", borderBottom: "1px dotted var(--c-term)" }}>summary judgment</span>{" "}
              can end a case before trial.
            </p>
            <div className="mt-3 p-3 rounded" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
              <div className="text-xl" style={{ color: "var(--c-accent)", fontFamily: "var(--font-display)" }}>$11.2M</div>
              <div className="text-[11px]" style={{ color: "var(--c-ink-muted)", fontFamily: "var(--font-body)" }}>Claims dismissed with prejudice</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContrastBadge({ label, ratio }: { label: string; ratio: number }) {
  const grade = gradeContrast(ratio);
  const ok = grade !== "Fail";
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: ok ? "var(--c-success)" : "var(--c-error)" }}
      />
      {label}: {ratio.toFixed(2)} ({grade})
    </span>
  );
}
