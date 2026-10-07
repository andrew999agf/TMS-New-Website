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

export type PodStatus = {
  exists: boolean;
  /** RUNNING | EXITED (stopped) | others RunPod may report. */
  desiredStatus: string;
  costPerHr: number;
  uptimeSeconds: number;
  gpu: string;
  /** How the pod is built — kept as the blueprint for rebuilding it. */
  spec?: PodSpec;
};

/** Everything needed to deploy an identical pod on the same storage. */
export type PodSpec = {
  name: string;
  imageName: string;
  dockerArgs: string;
  ports: string;
  volumeMountPath: string;
  containerDiskInGb: number;
  env: EnvPair[];
  gpu: string;
};

const SPEC_FIELDS = "name imageName dockerArgs ports volumeMountPath containerDiskInGb env";
type RawSpec = { name?: string; imageName?: string; dockerArgs?: string; ports?: string; volumeMountPath?: string; containerDiskInGb?: number; env?: unknown; machine?: { gpuDisplayName?: string } | null };
const toSpec = (p: RawSpec): PodSpec | undefined => p.imageName ? {
  name: p.name || "firm-ai-server", imageName: p.imageName, dockerArgs: p.dockerArgs ?? "", ports: p.ports ?? "",
  volumeMountPath: p.volumeMountPath || "/workspace", containerDiskInGb: p.containerDiskInGb ?? 20, env: parseEnv(p.env),
  gpu: p.machine?.gpuDisplayName ?? "",
} : undefined;

/** Live state of the pod. */
export async function getPodStatus(cfg: RunpodConfig): Promise<PodStatus> {
  const data = await gql<{ pod: ({ desiredStatus?: string; costPerHr?: number; runtime?: { uptimeInSeconds?: number } | null } & RawSpec) | null }>(
    cfg,
    `query pod($input: PodFilter) { pod(input: $input) { desiredStatus costPerHr runtime { uptimeInSeconds } machine { gpuDisplayName } ${SPEC_FIELDS} } }`,
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
    spec: toSpec(p),
  };
}

/* ------------------------- blueprint + recovery ------------------------- */

/** The last-seen pod configuration, so the server can be rebuilt after
 *  RunPod removes it (which it does once an account runs out of credit). */
const BLUEPRINT_KEY = "ai.podBlueprint";
type Blueprint = PodSpec & { savedAt: string; podId: string };

/** Keep the blueprint current — only writes when something changed. */
export async function rememberBlueprint(cfg: RunpodConfig, spec: PodSpec | undefined): Promise<void> {
  if (!spec) return;
  try {
    const cur = await getAiSetting<Blueprint | null>(BLUEPRINT_KEY, null);
    const { savedAt: _s, podId: _p, ...curSpec } = cur ?? ({} as Blueprint);
    void _s; void _p;
    if (cur && JSON.stringify(curSpec) === JSON.stringify(spec)) return;
    await putAiSetting(BLUEPRINT_KEY, { ...spec, savedAt: new Date().toISOString(), podId: cfg.podId } satisfies Blueprint);
  } catch { /* best-effort */ }
}

export async function getBlueprint(): Promise<Blueprint | null> {
  return getAiSetting<Blueprint | null>(BLUEPRINT_KEY, null);
}

export type LostPodCandidate = { id: string; name: string; desiredStatus: string; gpu: string; costPerHr: number };

/**
 * When the configured pod is gone: is the server still on the account under
 * another id (a relocation whose override was lost, or a pod someone made by
 * hand)? Lists every pod so the user can pick, best match first.
 */
export async function findLostPods(cfg: RunpodConfig): Promise<LostPodCandidate[]> {
  const data = await gql<{ myself: { pods?: { id: string; name?: string; desiredStatus?: string; costPerHr?: number; machine?: { gpuDisplayName?: string } | null }[] } | null }>(
    cfg,
    `query { myself { pods { id name desiredStatus costPerHr machine { gpuDisplayName } } } }`,
    {},
  );
  const bp = await getBlueprint().catch(() => null);
  const want = (bp?.name ?? "").toLowerCase();
  const list = (data.myself?.pods ?? []).map((p) => ({ id: p.id, name: p.name ?? "", desiredStatus: p.desiredStatus ?? "UNKNOWN", gpu: p.machine?.gpuDisplayName ?? "", costPerHr: p.costPerHr ?? 0 }));
  const score = (c: LostPodCandidate) => (want && c.name.toLowerCase() === want ? 2 : /ai|vllm|firm/i.test(c.name) ? 1 : 0);
  return list.sort((a, b) => score(b) - score(a));
}

/** Point the controls at an existing pod on the account. Free. */
export async function adoptPod(newId: string): Promise<void> {
  const envPodId = process.env.RUNPOD_POD_ID?.trim() ?? "";
  await putAiSetting(POD_OVERRIDE_KEY, { podId: newId, replacedEnvPodId: envPodId } satisfies PodOverride);
}

/**
 * Where a rebuild would get its configuration: the saved blueprint, else a
 * RunPod template (RUNPOD_TEMPLATE_ID, or the one whose name looks like the
 * firm's server), else nothing — and then the user has to set it up on
 * RunPod by hand once, after which the blueprint is saved automatically.
 */
export async function rebuildSource(cfg: RunpodConfig): Promise<{ kind: "blueprint" | "template"; label: string; spec: PodSpec } | null> {
  const bp = await getBlueprint().catch(() => null);
  if (bp?.imageName) {
    const { savedAt, podId, ...spec } = bp;
    void podId;
    return { kind: "blueprint", label: `saved configuration from ${new Date(savedAt).toLocaleDateString()}`, spec };
  }
  try {
    const data = await gql<{ myself: { podTemplates?: { id: string; name?: string; imageName?: string; dockerArgs?: string; ports?: string; env?: unknown; volumeMountPath?: string; containerDiskInGb?: number; isServerless?: boolean }[] } | null }>(
      cfg, `query { myself { podTemplates { id name imageName dockerArgs ports env volumeMountPath containerDiskInGb isServerless } } }`, {},
    );
    const all = (data.myself?.podTemplates ?? []).filter((t) => t.imageName && !t.isServerless);
    const wantId = process.env.RUNPOD_TEMPLATE_ID?.trim();
    const t = wantId ? all.find((x) => x.id === wantId) : all.find((x) => /ai|vllm|firm/i.test(x.name ?? "")) ?? (all.length === 1 ? all[0] : undefined);
    if (!t) return null;
    return {
      kind: "template", label: `RunPod template "${t.name ?? t.id}"`,
      spec: { name: t.name || "firm-ai-server", imageName: t.imageName!, dockerArgs: t.dockerArgs ?? "", ports: t.ports ?? "", volumeMountPath: t.volumeMountPath || "/workspace", containerDiskInGb: t.containerDiskInGb ?? 20, env: parseEnv(t.env), gpu: "" },
    };
  } catch {
    return null;
  }
}

/** Does this error mean the account can't pay for the pod right now? */
export function isNoFundsError(message: string): boolean {
  return /insufficient|balance|credit|funds|billing|payment/i.test(message);
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


/**
 * The stuck pod's host rented out its GPU. Recreate the pod, identically
 * configured, on any machine in the same building that has a free card —
 * the network volume (models included) attaches wherever. On success the
 * new pod id is stored as the override and the stuck shell is terminated.
 * Returns the new pod id.
 */
export async function relocatePod(cfg: RunpodConfig): Promise<string> {
  // 1) The stuck pod's own spec is the blueprint.
  const spec = await gql<{ pod: RawSpec | null }>(
    cfg,
    `query pod($input: PodFilter) { pod(input: $input) { ${SPEC_FIELDS} machine { gpuDisplayName } } }`,
    { input: { podId: cfg.podId } },
  );
  const p = spec.pod ? toSpec(spec.pod) : undefined;
  if (!p) throw new Error("Couldn't read the stuck pod's configuration.");
  const newId = await deployFromSpec(cfg, p);
  // Clear away the stuck shell.
  if (newId !== cfg.podId) {
    try {
      await gql(cfg, `mutation terminate($input: PodTerminateInput!) { podTerminate(input: $input) }`, { input: { podId: cfg.podId } });
    } catch { /* a lingering empty shell is cosmetic — never fail the rescue over it */ }
  }
  return newId;
}

/**
 * Rebuild the server after RunPod removed it: deploy the blueprint (or
 * template) onto the firm's network volume, where the models still live.
 * Costs money from the moment it starts — the caller confirms with the user.
 */
export async function rebuildPod(cfg: RunpodConfig): Promise<{ id: string; source: string }> {
  const src = await rebuildSource(cfg);
  if (!src) throw new Error("No saved configuration or RunPod template to rebuild from. Set the server up once on RunPod (same network volume), then point RUNPOD_POD_ID at it.");
  const id = await deployFromSpec(cfg, src.spec);
  return { id, source: src.label };
}

/** Deploy a pod from a spec onto the firm's network volume; store it as the
 *  active pod. Returns the new pod id. */
async function deployFromSpec(cfg: RunpodConfig, p: PodSpec): Promise<string> {
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
    const want = p.gpu.toLowerCase();
    const hit = want ? types.gpuTypes.find((t) => (t.displayName ?? "").toLowerCase() === want) ?? types.gpuTypes.find((t) => (t.displayName ?? "").toLowerCase().includes(want)) : undefined;
    if (!hit) throw new Error(`Couldn't match the GPU type ("${p.gpu || "unknown"}") in RunPod's catalog — set RUNPOD_GPU_TYPE_ID.`);
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
        env: p.env,
        networkVolumeId: volume.id,
        ...(volume.dataCenterId ? { dataCenterId: volume.dataCenterId } : {}),
      },
    },
  );
  const newId = made.podFindAndDeployOnDemand?.id;
  if (!newId) throw new Error("RunPod accepted the relocation but returned no pod id.");

  // 5) Point everything at the replacement.
  await adoptPod(newId);
  return newId;
}
