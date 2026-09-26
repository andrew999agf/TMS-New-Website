import "server-only";

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
  const base = process.env.AI_BASE_URL?.trim();
  const key = process.env.AI_API_KEY?.trim();
  if (!base || !key) return false;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
