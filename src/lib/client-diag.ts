/**
 * Browser-side diagnostics for the Discovery Reviewer: a small ring buffer
 * of events and errors plus live "what's on screen" providers, folded into
 * the copyable report (Diagnostics button on the set's tab bar). Nothing
 * here is sent anywhere on its own; the user copies the text and pastes it.
 */

type Provider = () => Record<string, unknown>;

const events: string[] = [];
const providers = new Map<string, Provider>();
let hooked = false;

const stamp = () => new Date().toISOString().slice(11, 19);

export function diagLog(kind: string, message: string) {
  events.push(`${stamp()} ${kind}: ${message}`);
  if (events.length > 80) events.splice(0, events.length - 80);
}

/** Register a live state provider under a name ("red", "yellow", "loader"…). */
export function diagRegister(name: string, fn: Provider): () => void {
  providers.set(name, fn);
  return () => { if (providers.get(name) === fn) providers.delete(name); };
}

/** Capture uncaught errors and rejections once per page. */
export function diagHook() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener("error", (e) => diagLog("error", `${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => diagLog("rejection", String((e.reason as Error)?.message ?? e.reason).slice(0, 300)));
}

export function diagSnapshot(): { browser: Record<string, unknown>; state: Record<string, Record<string, unknown>>; events: string[] } {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const perf = typeof performance !== "undefined" ? (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }) : null;
  const mem = perf?.memory;
  const browser: Record<string, unknown> = {
    userAgent: nav?.userAgent,
    online: nav?.onLine,
    cores: nav?.hardwareConcurrency,
    deviceMemoryGB: (nav as Navigator & { deviceMemory?: number } | null)?.deviceMemory,
    viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x` : undefined,
    jsHeapMB: mem ? `${Math.round(mem.usedJSHeapSize / 1048576)} of ${Math.round(mem.jsHeapSizeLimit / 1048576)}` : "n/a",
    pageUrl: typeof location !== "undefined" ? location.pathname : undefined,
    localTime: new Date().toString(),
  };
  const state: Record<string, Record<string, unknown>> = {};
  for (const [k, fn] of providers) { try { state[k] = fn(); } catch (err) { state[k] = { error: String(err) }; } }
  return { browser, state, events: [...events] };
}

/** The browser half of a report as plain text (the Discovery and Share
 *  Folder diagnostics both start from this). */
export function diagBrowserText(heading = "THIS BROWSER"): string {
  const snap = diagSnapshot();
  const lines: string[] = [heading];
  for (const [k, v] of Object.entries(snap.browser)) lines.push(`  ${k}: ${v ?? "n/a"}`);
  for (const [name, st] of Object.entries(snap.state)) {
    lines.push(`  ${name}:`);
    for (const [k, v] of Object.entries(st)) lines.push(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  lines.push(`  recent browser events (${snap.events.length}):`);
  for (const e of snap.events.slice(-40)) lines.push(`    ${e}`);
  if (!snap.events.length) lines.push("    (none)");
  return lines.join("\n");
}
