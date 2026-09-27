import "server-only";
import { getAiSetting, putAiSetting } from "@/lib/ai/concierge";
import { rewriteBaseUrlForPod } from "@/lib/ai/config";

/**
 * Remote control for the firm's rented AI GPU server (a RunPod pod running
 * vLLM). Powers the wake/sleep concierge and the cost meter: start, stop,
 * live status, and the account's prepaid credit balance.
 *
 * Configuration (hosting environment):
 *   RUNPOD_API_KEY  an API key from RunPod → Settings → API Keys
 *   RUNPOD_POD_ID   the pod to control, e.g. "hi3511ej2omur6"
 * Optional:
 *   RUNPOD_API_URL  override of the GraphQL endpoint (used by local tests)
 *
 * Without both required values everything reports { configured: false } and
 * the Assistant works exactly as before — just without the power controls.
 */

export type RunpodConfig = { apiKey: string; podId: string; url: string };

export function runpodConfig(): RunpodConfig | null {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  const podId = process.env.RUNPOD_POD_ID?.trim();
  if (!apiKey || !podId) return null;
  return { apiKey, podId, url: process.env.RUNPOD_API_URL?.trim() || "https://api.runpod.io/graphql" };
}

/** When a full host forces the pod to relocate, the replacement's id is
 *  stored here so the env var doesn't have to change. The override only
 *  applies while RUNPOD_POD_ID still names the pod it replaced — if someone
 *  updates the env var by hand, the hand-set value wins. */
const POD_OVERRIDE_KEY = "ai.podOverride";
type PodOverride = { podId: string; replacedEnvPodId: string };

/** runpodConfig with any stored relocation override applied. */
export async function resolvedRunpodConfig(): Promise<RunpodConfig | null> {
  const cfg = runpodConfig();
  if (!cfg) return null;
  try {
    const o = await getAiSetting<PodOverride | null>(POD_OVERRIDE_KEY, null);
    if (o?.podId && o.replacedEnvPodId === cfg.podId) return { ...cfg, podId: o.podId };
  } catch { /* fall back to the env pod */ }
  return cfg;
}

/** The chat endpoint's base URL with any relocation applied: when the pod
 *  moved, its proxy hostname moved with it, so the env AI_BASE_URL (which
 *  names the old pod) is rewritten to the replacement's hostname. */
export async function resolvedAiBaseUrl(): Promise<string | null> {
  const base = process.env.AI_BASE_URL?.trim()?.replace(/\/+$/, "") ?? null;
  if (!base) return null;
  const cfg = runpodConfig();
  if (!cfg) return base;
  try {
    const o = await getAiSetting<PodOverride | null>(POD_OVERRIDE_KEY, null);
    if (o?.podId && o.replacedEnvPodId === cfg.podId) return rewriteBaseUrlForPod(base, cfg.podId, o.podId);
  } catch { /* env value stands */ }
  return base;
}

async function gql<T>(cfg: RunpodConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RunPod API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`RunPod: ${json.errors[0].message.slice(0, 200)}`);
  if (!json.data) throw new Error("RunPod: empty response");
  return json.data;
}

export type PodStatus = {
  exists: boolean;
  /** RUNNING | EXITED (stopped) | others RunPod may report. */
  desiredStatus: string;
  costPerHr: number;
  uptimeSeconds: number;
  gpu: string;
};

/** Live state of the pod. */
export async function getPodStatus(cfg: RunpodConfig): Promise<PodStatus> {
  const data = await gql<{ pod: { desiredStatus?: string; costPerHr?: number; runtime?: { uptimeInSeconds?: number } | null; machine?: { gpuDisplayName?: string } | null } | null }>(
    cfg,
    `query pod($input: PodFilter) { pod(input: $input) { desiredStatus costPerHr runtime { uptimeInSeconds } machine { gpuDisplayName } } }`,
    { input: { podId: cfg.podId } },
  );
  const p = data.pod;
  if (!p) return { exists: false, desiredStatus: "UNKNOWN", costPerHr: 0, uptimeSeconds: 0, gpu: "" };
  return {
    exists: true,
    desiredStatus: p.desiredStatus ?? "UNKNOWN",
    costPerHr: p.costPerHr ?? 0,
    uptimeSeconds: p.runtime?.uptimeInSeconds ?? 0,
    gpu: p.machine?.gpuDisplayName ?? "",
  };
}

/** Prepaid credit remaining on the RunPod account (the "tank"). */
export async function getBalance(cfg: RunpodConfig): Promise<number | null> {
  try {
    const data = await gql<{ myself: { clientBalance?: number } | null }>(cfg, `query { myself { clientBalance } }`, {});
    return data.myself?.clientBalance ?? null;
  } catch {
    return null; // balance is a nicety — never fail status over it
  }
}

/** Wake the pod. Returns the (possibly already-)running status. */
export async function startPod(cfg: RunpodConfig): Promise<PodStatus> {
  await gql(cfg, `mutation resume($input: PodResumeInput!) { podResume(input: $input) { id desiredStatus } }`, {
    input: { podId: cfg.podId, gpuCount: 1 },
  });
  return getPodStatus(cfg);
}

/** Put the pod to sleep. Storage (and the model on it) stays. */
export async function stopPod(cfg: RunpodConfig): Promise<PodStatus> {
  await gql(cfg, `mutation stop($input: PodStopInput!) { podStop(input: $input) { id desiredStatus } }`, {
    input: { podId: cfg.podId },
  });
  return getPodStatus(cfg);
}

/** Is the AI endpoint itself answering (model loaded), not just the pod on? */
export async function aiEndpointReady(): Promise<boolean> {
  return (await aiServingModel()) !== null;
}

/** The model id the endpoint is actually serving right now, or null if the
 *  endpoint isn't answering. This is how a swap knows it has finished: the
 *  serving model finally matches the desired one. */
export async function aiServingModel(): Promise<string | null> {
  const base = await resolvedAiBaseUrl();
  const key = process.env.AI_API_KEY?.trim();
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    return json?.data?.[0]?.id ?? ""; // answering but unparseable still counts as ready
  } catch {
    return null;
  }
}

/* ----------------------- self-healing relocation ------------------------ */

/** Does this error mean "the pod's host machine has no free GPU"? */
export function isNoGpuError(message: string): boolean {
  return /not enough free gpus|gpus? (is|are) no longer available|no longer available/i.test(message);
}

type EnvPair = { key: string; value: string };
const parseEnv = (env: unknown): EnvPair[] => {
  if (!Array.isArray(env)) return [];
  const out: EnvPair[] = [];
  for (const e of env) {
    if (typeof e === "string") {
      const i = e.indexOf("=");
      if (i > 0) out.push({ key: e.slice(0, i), value: e.slice(i + 1) });
    } else if (e && typeof e === "object" && typeof (e as EnvPair).key === "string") {
      out.push({ key: (e as EnvPair).key, value: String((e as EnvPair).value ?? "") });
    }
  }
  return out;
};

/**
 * The stuck pod's host rented out its GPU. Recreate the pod, identically
 * configured, on any machine in the same building that has a free card —
 * the network volume (models included) attaches wherever. On success the
 * new pod id is stored as the override and the stuck shell is terminated.
 * Returns the new pod id.
 */
export async function relocatePod(cfg: RunpodConfig): Promise<string> {
  // 1) The stuck pod's own spec is the blueprint.
  const spec = await gql<{ pod: { name?: string; imageName?: string; dockerArgs?: string; ports?: string; volumeMountPath?: string; containerDiskInGb?: number; env?: unknown; machine?: { gpuDisplayName?: string } | null } | null }>(
    cfg,
    `query pod($input: PodFilter) { pod(input: $input) { name imageName dockerArgs ports volumeMountPath containerDiskInGb env machine { gpuDisplayName } } }`,
    { input: { podId: cfg.podId } },
  );
  const p = spec.pod;
  if (!p?.imageName) throw new Error("Couldn't read the stuck pod's configuration.");

  // 2) The network volume decides the building; the models live on it.
  const vols = await gql<{ myself: { networkVolumes?: { id: string; name?: string; dataCenterId?: string }[] } | null }>(
    cfg,
    `query { myself { networkVolumes { id name dataCenterId } } }`,
    {},
  );
  const all = vols.myself?.networkVolumes ?? [];
  const wanted = process.env.RUNPOD_VOLUME_ID?.trim();
  const volume = wanted ? all.find((v) => v.id === wanted) : all.length === 1 ? all[0] : all.find((v) => (v.name ?? "").includes("firm"));
  if (!volume) throw new Error("Couldn't identify the network storage volume to attach.");

  // 3) Same GPU model, by id (match the display name against the catalog).
  let gpuTypeId = process.env.RUNPOD_GPU_TYPE_ID?.trim() || "";
  if (!gpuTypeId) {
    const types = await gql<{ gpuTypes: { id: string; displayName?: string }[] }>(cfg, `query { gpuTypes { id displayName } }`, {});
    const want = (p.machine?.gpuDisplayName ?? "").toLowerCase();
    const hit = want ? types.gpuTypes.find((t) => (t.displayName ?? "").toLowerCase() === want) ?? types.gpuTypes.find((t) => (t.displayName ?? "").toLowerCase().includes(want)) : undefined;
    if (!hit) throw new Error(`Couldn't match the GPU type ("${p.machine?.gpuDisplayName ?? "unknown"}") in RunPod's catalog.`);
    gpuTypeId = hit.id;
  }

  // 4) Deploy the replacement wherever a card is free in that data center.
  const made = await gql<{ podFindAndDeployOnDemand: { id?: string } | null }>(
    cfg,
    `mutation deploy($input: PodFindAndDeployOnDemandInput) { podFindAndDeployOnDemand(input: $input) { id desiredStatus } }`,
    {
      input: {
        cloudType: "SECURE",
        gpuCount: 1,
        gpuTypeId,
        name: p.name || "firm-ai-server",
        imageName: p.imageName,
        ...(p.dockerArgs ? { dockerArgs: p.dockerArgs } : {}),
        ...(p.ports ? { ports: p.ports } : {}),
        volumeMountPath: p.volumeMountPath || "/workspace",
        containerDiskInGb: p.containerDiskInGb ?? 20,
        volumeInGb: 0,
        env: parseEnv(p.env),
        networkVolumeId: volume.id,
        ...(volume.dataCenterId ? { dataCenterId: volume.dataCenterId } : {}),
      },
    },
  );
  const newId = made.podFindAndDeployOnDemand?.id;
  if (!newId) throw new Error("RunPod accepted the relocation but returned no pod id.");

  // 5) Point everything at the replacement, then clear away the stuck shell.
  const envPodId = process.env.RUNPOD_POD_ID?.trim() ?? "";
  await putAiSetting(POD_OVERRIDE_KEY, { podId: newId, replacedEnvPodId: envPodId } satisfies PodOverride);
  if (newId !== cfg.podId) {
    try {
      await gql(cfg, `mutation terminate($input: PodTerminateInput!) { podTerminate(input: $input) }`, { input: { podId: cfg.podId } });
    } catch { /* a lingering empty shell is cosmetic — never fail the rescue over it */ }
  }
  return newId;
}
