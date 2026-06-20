/**
 * Patriot Series 250 — Cloudflare Stream Live setup.
 *
 * Creates (or reuses) a Stream Live Input and prints the env values the site
 * needs. Run locally so your API token never leaves your machine:
 *
 *   CLOUDFLARE_ACCOUNT_ID=xxxx \
 *   CLOUDFLARE_API_TOKEN=yyyy \
 *   npm run patriot:stream
 *
 * The token needs the "Stream:Edit" permission (Cloudflare dashboard →
 * My Profile → API Tokens → Create Token). Stream requires an active
 * subscription on the account.
 *
 * Output: paste PATRIOT_WHIP_URL / PATRIOT_WHEP_URL into your site env, and
 * hand the WHIP URL to the operator for their switcher.
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const INPUT_NAME = process.env.PATRIOT_STREAM_NAME ?? "Patriot Series 250";

function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!ACCOUNT_ID || !API_TOKEN) {
  die(
    "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Stream:Edit) before running.",
  );
}

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/live_inputs`;
const headers = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
};

type LiveInput = {
  uid: string;
  meta?: { name?: string };
  webRTC?: { url?: string };
  webRTCPlayback?: { url?: string };
};

async function cf<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers });
  const json = (await res.json()) as {
    success: boolean;
    result: T;
    errors?: { message: string }[];
  };
  if (!res.ok || !json.success) {
    const detail = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    die(`Cloudflare API error (${res.status}): ${detail}`);
  }
  return json.result;
}

async function main() {
  // Reuse an existing input with the same name so re-runs are idempotent.
  const existing = await cf<LiveInput[]>(API);
  let input = existing.find((i) => i.meta?.name === INPUT_NAME);

  if (input) {
    console.log(`Reusing existing live input "${INPUT_NAME}" (${input.uid}).`);
  } else {
    input = await cf<LiveInput>(API, {
      method: "POST",
      body: JSON.stringify({
        meta: { name: INPUT_NAME },
        recording: { mode: "automatic" }, // auto-records each broadcast for VOD
      }),
    });
    console.log(`Created live input "${INPUT_NAME}" (${input.uid}).`);
  }

  const whip = input.webRTC?.url;
  const whep = input.webRTCPlayback?.url;
  if (!whip || !whep) {
    die("Live input is missing WebRTC URLs — check that WebRTC is enabled for this account.");
  }

  console.log("\n── Add to your site env (.env.local / hosting dashboard) ──\n");
  console.log(`PATRIOT_WHEP_URL=${whep}`);
  console.log(`PATRIOT_WHIP_URL=${whip}`);
  console.log("\n── Give the operator (their switcher's WHIP target) ──\n");
  console.log(`${whip}\n`);
}

main();
