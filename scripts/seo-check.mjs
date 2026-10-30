#!/usr/bin/env node
/**
 * Crawl every URL in the sitemap of a running build and report the on-page
 * basics Google reads: status, one H1, title length, description length,
 * canonical, robots, and that every JSON-LD block parses. Exits 1 on a
 * failure, so it can gate CI.
 *
 *   node scripts/seo-check.mjs http://127.0.0.1:3000 [https://www.texaslawsmith.com]
 * The second argument is the canonical host the sitemap uses; URLs are
 * rewritten to the first so a local build can be checked.
 */
const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const canon = (process.argv[3] ?? "https://www.texaslawsmith.com").replace(/\/$/, "");
const sm = await (await fetch(`${base}/sitemap.xml`)).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const rows = []; const titles = new Map(); const descs = new Map(); let failures = 0;
const attr = (html, re) => (html.match(re) || [, ""])[1];
for (const u of urls) {
  const path = u.replace(canon, "") || "/";
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  const title = attr(html, /<title>([^<]*)<\/title>/).replace(/&amp;/g, "&");
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  const robots = attr(html, /<meta name="robots" content="([^"]*)"/);
  let ld = 0, ldBad = 0;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { ld++; try { JSON.parse(m[1]); } catch { ldBad++; } }
  const problems = [];
  if (res.status !== 200) problems.push(`status ${res.status}`);
  if (h1s !== 1) problems.push(`${h1s} H1s`);
  // Page part ≤ 56 chars; the " | firm" suffix (24) is what Google truncates first.
  if (!title) problems.push("no title"); else if (title.length > 80) problems.push(`title ${title.length} chars`);
  if (!desc) problems.push("no description"); else if (desc.length > 170 || desc.length < 50) problems.push(`description ${desc.length} chars`);
  if (!canonical) problems.push("no canonical"); else if (canonical !== u && canonical !== `${u}/`) problems.push(`canonical ${canonical}`);
  if (ldBad) problems.push(`${ldBad} bad JSON-LD`);
  if (title) titles.set(title, [...(titles.get(title) ?? []), path]);
  if (desc) descs.set(desc, [...(descs.get(desc) ?? []), path]);
  if (problems.length) failures++;
  rows.push({ path, status: res.status, h1s, title: title.length, desc: desc.length, ld, robots: robots || "-", problems: problems.join("; ") });
}
for (const [t, ps] of titles) if (ps.length > 1) { failures++; rows.push({ path: "(dup title)", status: "", h1s: "", title: t.slice(0, 40), desc: "", ld: "", robots: "", problems: ps.join(" ") }); }
for (const [d, ps] of descs) if (ps.length > 1) { failures++; rows.push({ path: "(dup description)", status: "", h1s: "", title: "", desc: d.slice(0, 40), ld: "", robots: "", problems: ps.join(" ") }); }
console.table(rows.filter((r) => r.problems));
console.log(`${urls.length} URLs checked, ${rows.filter((r) => r.problems).length} with problems.`);
process.exit(failures ? 1 : 0);
