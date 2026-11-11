import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sbIntegrations } from "@/db/schema";
import { ensureBooks } from "./ensure";
import { seal, unseal } from "./secrets";

/**
 * Gusto, linked from Settings → Connections.
 *
 * READ-ONLY by design: this module only ever issues GET requests to Gusto.
 * It can see payroll; it cannot run one, change one, or move money. Gusto —
 * not this site — holds the bank authority.
 *
 * Set-up (once, in the host's environment settings — never in the repo):
 *   GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET   the app's keys from dev.gusto.com
 *   GUSTO_ENV                              "demo" (practice) or "production"
 * The app's Redirect URI in Gusto's developer portal must be the one this
 * module reports (shown on the Settings card).
 */
const PROVIDER = "gusto";
/**
 * Which version of Gusto's API to ask for. By default: none. Gusto then
 * applies the app's own "Default API version" (set on the app in Gusto's
 * developer portal), which Gusto always accepts. Naming a version here is
 * what broke the first real connection: Gusto retires old versions and
 * answers 406 to a request that names one. GUSTO_API_VERSION can still pin a
 * version; if Gusto has retired it, the request is repeated without it.
 */
const PINNED_VERSION = (process.env.GUSTO_API_VERSION || "").trim();
let pinnedVersionRefused = false;

export type GustoEnv = "demo" | "production";
export function gustoEnv(): GustoEnv { return process.env.GUSTO_ENV === "production" ? "production" : "demo"; }
export function gustoConfigured(): boolean { return !!(process.env.GUSTO_CLIENT_ID && process.env.GUSTO_CLIENT_SECRET); }
function apiBase(): string {
  if (process.env.GUSTO_API_BASE) return process.env.GUSTO_API_BASE.replace(/\/$/, ""); // tests
  return gustoEnv() === "production" ? "https://api.gusto.com" : "https://api.gusto-demo.com";
}
export function gustoRedirectUri(publicBase: string): string {
  return process.env.GUSTO_REDIRECT_URI || `${publicBase}/integrations/gusto/callback`;
}

export function gustoAuthorizeUrl(state: string, redirectUri: string): string {
  const u = new URL(`${apiBase()}/oauth/authorize`);
  u.searchParams.set("client_id", process.env.GUSTO_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${apiBase()}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: process.env.GUSTO_CLIENT_ID, client_secret: process.env.GUSTO_CLIENT_SECRET, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `Gusto refused the sign-in (HTTP ${res.status}).`);
  return json;
}

/** Gusto's own words for a refusal, when it gives any (never includes a token). */
async function refusalReason(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { errors?: { message?: string }[]; error_description?: string; error?: string; message?: string };
    const m = j.errors?.map((e) => e.message).filter(Boolean).join(" ") || j.error_description || j.message || j.error || "";
    return String(m).replace(/\s+/g, " ").trim().slice(0, 180);
  } catch { return ""; }
}

async function gustoGet<T>(path: string, accessToken: string): Promise<T> {
  const call = (version: string) => fetch(`${apiBase()}${path}`, {
    method: "GET", // the only verb this module uses
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(version ? { "X-Gusto-API-Version": version } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const pinned = pinnedVersionRefused ? "" : PINNED_VERSION;
  let res = await call(pinned);
  if (res.status === 406 && pinned) { pinnedVersionRefused = true; res = await call(""); } // retired version: let Gusto use the app's default
  if (!res.ok) {
    const why = await refusalReason(res);
    const err = new Error(`Gusto answered HTTP ${res.status} for ${path.split("?")[0]}${why ? `: ${why}` : "."}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** Which Gusto company the approval covers. /v1/token_info says so directly;
 *  /v1/me (companies the signed-in person administers) is the fallback. */
async function identify(accessToken: string): Promise<{ id: string; name: string }> {
  let id = "";
  let first: Error | null = null;
  try {
    const info = await gustoGet<{ resource?: { type?: string; uuid?: string }; resource_type?: string; resource_uuid?: string }>("/v1/token_info", accessToken);
    const type = info.resource?.type ?? info.resource_type ?? "";
    const uuid = info.resource?.uuid ?? info.resource_uuid ?? "";
    if (uuid && (!type || /company/i.test(type))) id = uuid;
  } catch (e) { first = e as Error; /* fall through to /v1/me */ }
  let name = "";
  if (!id) {
    try {
      const me = await gustoGet<{ roles?: { payroll_admin?: { companies?: { uuid?: string; id?: string; name?: string; trade_name?: string }[] } } }>("/v1/me", accessToken);
      const c = me.roles?.payroll_admin?.companies?.[0];
      id = c?.uuid || c?.id || "";
      name = c?.trade_name || c?.name || "";
    } catch (e) { throw first ?? e; } // the first refusal is the informative one
  }
  if (!id) throw new Error("Gusto signed you in but didn't say which company the approval covers.");
  if (!name) {
    try { const c = await gustoGet<{ name?: string; trade_name?: string }>(`/v1/companies/${id}`, accessToken); name = c.trade_name || c.name || ""; } catch { /* name is a nicety */ }
  }
  return { id, name };
}

export type GustoConnection = {
  connected: boolean; status: string; environment: string; companyName: string; connectedBy: string;
  connectedAt: string | null; lastCheckedAt: string | null; lastError: string;
};

export async function getGustoConnection(companyId: number): Promise<GustoConnection | null> {
  if (!db) return null;
  await ensureBooks();
  const [row] = await db.select().from(sbIntegrations).where(and(eq(sbIntegrations.companyId, companyId), eq(sbIntegrations.provider, PROVIDER)));
  if (!row) return null;
  return {
    connected: true, status: row.status, environment: row.environment, companyName: row.externalName, connectedBy: row.connectedBy,
    connectedAt: row.connectedAt?.toISOString() ?? null, lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null, lastError: row.lastError,
  };
}

/** Finish the sign-in: swap the one-time code for tokens and store them sealed. */
export async function completeGustoConnection(companyId: number, code: string, redirectUri: string, by: string): Promise<{ name: string }> {
  if (!db) throw new Error("Database not configured.");
  await ensureBooks();
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const who = await identify(t.access_token!);
  const values = {
    companyId, provider: PROVIDER, status: "connected", environment: gustoEnv(), externalId: who.id, externalName: who.name,
    accessTokenEnc: seal(t.access_token!), refreshTokenEnc: seal(t.refresh_token ?? ""),
    tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 7200) * 1000), scope: t.scope ?? "",
    connectedBy: by, connectedAt: new Date(), lastCheckedAt: new Date(), lastError: "", updatedAt: new Date(),
  };
  await db.insert(sbIntegrations).values(values).onConflictDoUpdate({ target: [sbIntegrations.companyId, sbIntegrations.provider], set: values });
  return { name: who.name };
}

/** A usable access token, refreshed when it is within a minute of expiring.
 *  Gusto's refresh tokens are single-use, so the new pair is saved at once. */
async function accessTokenFor(companyId: number): Promise<{ token: string; externalId: string }> {
  const [row] = await db!.select().from(sbIntegrations).where(and(eq(sbIntegrations.companyId, companyId), eq(sbIntegrations.provider, PROVIDER)));
  if (!row) throw new Error("Gusto isn't connected.");
  const fresh = row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() > 60_000;
  if (fresh) return { token: unseal(row.accessTokenEnc), externalId: row.externalId };
  const refresh = unseal(row.refreshTokenEnc);
  if (!refresh) throw new Error("The Gusto approval has expired — connect again.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  await db!.update(sbIntegrations).set({
    accessTokenEnc: seal(t.access_token!), refreshTokenEnc: seal(t.refresh_token ?? refresh),
    tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 7200) * 1000), updatedAt: new Date(),
  }).where(eq(sbIntegrations.id, row.id));
  return { token: t.access_token!, externalId: row.externalId };
}

export type GustoPayrollSummary = { checkDate: string; periodStart: string; periodEnd: string; gross: string; net: string; employerTaxes: string };

/** Prove the link works: read the latest processed payrolls. Records the
 *  outcome on the connection so Settings shows the truth. */
export async function checkGustoConnection(companyId: number): Promise<{ ok: true; companyName: string; payrolls: GustoPayrollSummary[] } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "Database not configured." };
  try {
    const { token, externalId } = await accessTokenFor(companyId);
    const end = new Date(), start = new Date(Date.now() - 180 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    type P = { check_date?: string; pay_period?: { start_date?: string; end_date?: string }; totals?: { gross_pay?: string; net_pay?: string; employer_taxes?: string } };
    const list = await gustoGet<P[]>(`/v1/companies/${externalId}/payrolls?processing_statuses=processed&include=totals&start_date=${iso(start)}&end_date=${iso(end)}`, token);
    const payrolls = (Array.isArray(list) ? list : [])
      .map((p) => ({ checkDate: p.check_date ?? "", periodStart: p.pay_period?.start_date ?? "", periodEnd: p.pay_period?.end_date ?? "", gross: p.totals?.gross_pay ?? "", net: p.totals?.net_pay ?? "", employerTaxes: p.totals?.employer_taxes ?? "" }))
      .sort((a, b) => b.checkDate.localeCompare(a.checkDate)).slice(0, 3);
    const [row] = await db.update(sbIntegrations).set({ status: "connected", lastCheckedAt: new Date(), lastError: "", updatedAt: new Date() })
      .where(and(eq(sbIntegrations.companyId, companyId), eq(sbIntegrations.provider, PROVIDER))).returning({ name: sbIntegrations.externalName });
    return { ok: true, companyName: row?.name ?? "", payrolls };
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await db.update(sbIntegrations).set({ status: "error", lastCheckedAt: new Date(), lastError: msg, updatedAt: new Date() })
      .where(and(eq(sbIntegrations.companyId, companyId), eq(sbIntegrations.provider, PROVIDER))).catch(() => {});
    return { ok: false, error: msg };
  }
}

export type GustoPayroll = { externalId: string; checkDate: string; periodStart: string; periodEnd: string; offCycle: boolean; totals: Record<string, string> };

/** Every processed payroll in roughly the last year, with Gusto's own totals untouched. Read-only. */
export async function listGustoPayrolls(companyId: number, days = 400): Promise<{ ok: true; environment: string; companyName: string; payrolls: GustoPayroll[] } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "Database not configured." };
  try {
    const conn = await getGustoConnection(companyId);
    if (!conn) return { ok: false, error: "Gusto isn't connected." };
    const { token, externalId } = await accessTokenFor(companyId);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    type P = { payroll_uuid?: string; uuid?: string; id?: string | number; check_date?: string; off_cycle?: boolean; pay_period?: { start_date?: string; end_date?: string }; totals?: Record<string, unknown> };
    const list = await gustoGet<P[]>(`/v1/companies/${externalId}/payrolls?processing_statuses=processed&include=totals&start_date=${iso(new Date(Date.now() - days * 86_400_000))}&end_date=${iso(new Date())}`, token);
    const payrolls = (Array.isArray(list) ? list : []).map((p) => ({
      externalId: String(p.payroll_uuid ?? p.uuid ?? p.id ?? ""), checkDate: p.check_date ?? "", periodStart: p.pay_period?.start_date ?? "", periodEnd: p.pay_period?.end_date ?? "", offCycle: !!p.off_cycle,
      totals: Object.fromEntries(Object.entries(p.totals ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => [k, String(v)])),
    })).filter((p) => p.externalId && p.checkDate).sort((a, b) => b.checkDate.localeCompare(a.checkDate));
    return { ok: true, environment: conn.environment, companyName: conn.companyName, payrolls };
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e).slice(0, 300) };
  }
}

/** Forget the tokens. (Access can also be revoked from Gusto's own App Directory.) */
export async function disconnectGusto(companyId: number): Promise<void> {
  if (!db) return;
  await db.delete(sbIntegrations).where(and(eq(sbIntegrations.companyId, companyId), eq(sbIntegrations.provider, PROVIDER)));
}
