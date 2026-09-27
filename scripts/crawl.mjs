// Fetches from the live WordPress site every page linked from legacy-html/
// that is missing from the export, following links recursively.
// Raw pages are cached in .cache/pages/ (re-runs only fetch what is missing).
import fs from "node:fs";
import path from "node:path";

const SITE = "https://skygardenaccess.com";
const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache", "pages");
// Dynamic WooCommerce / WordPress endpoints that cannot be served statically.
const SKIP = /^\/(wp-|xmlrpc|feed|comments|panier|commande|wishlist|favoris)|\/feed\/|[?#]/;
const CONCURRENCY = 6;

const have = new Set();
(function walk(d, r = "") {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name), r ? `${r}/${e.name}` : e.name);
    else if (e.name === "index.html") have.add(r ? `/${r}/` : "/");
  }
})(path.join(ROOT, "legacy-html"));

export const cacheFile = (p) => path.join(CACHE, (p === "/" ? "_root" : p.slice(1, -1).replaceAll("/", "__")) + ".html");

function links(html, p) {
  const out = [];
  for (const [, h] of html.matchAll(/href="([^"]+)"/g)) {
    let u;
    try { u = new URL(h.replace(/index(\.[0-9a-f]+)?\.html$/, ""), `${SITE}${p}`); } catch { continue; }
    if (u.host === "skygardenaccess.com" && !u.search && u.pathname.endsWith("/")) out.push(u.pathname);
  }
  return out;
}

fs.mkdirSync(CACHE, { recursive: true });
const seen = new Set(have);
const queue = [...have];
const failed = [];
let fetched = 0;

async function load(p) {
  if (have.has(p)) return fs.readFileSync(path.join(ROOT, "legacy-html", p, "index.html"), "utf8");
  const file = cacheFile(p);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SITE + p, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
      if (res.status !== 200) {
        failed.push(`${res.status} ${p} ${res.headers.get("location") || ""}`);
        console.log(`skip ${res.status} ${p}`);
        return null;
      }
      const html = await res.text();
      fs.writeFileSync(file, html);
      console.log(`[${++fetched}] ${p}`);
      return html;
    } catch (e) {
      console.log(`retry ${attempt} ${p} (${e.message})`);
    }
  }
  failed.push(`ERR ${p}`);
  return null;
}

async function worker() {
  while (queue.length) {
    const p = queue.shift();
    const html = await load(p);
    if (!html) continue;
    for (const l of links(html, p)) if (!SKIP.test(l) && !seen.has(l)) { seen.add(l); queue.push(l); }
  }
}
// Workers can go idle while others are still discovering links: loop until stable.
while (queue.length) await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`done: ${fs.readdirSync(CACHE).length} pages cached, ${failed.length} skipped`);
for (const f of failed) console.log("  " + f);
