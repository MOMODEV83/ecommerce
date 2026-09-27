// Turns the pages fetched by crawl.mjs (.cache/pages/) into legacy-html/
// pages whose assets are served locally: every /wp-content/ and
// /wp-includes/ file they use is downloaded into public/ at the same path.
import fs from "node:fs";
import path from "node:path";

const SITE = "https://skygardenaccess.com";
const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache", "pages");
const PUBLIC = path.join(ROOT, "public");
const CONCURRENCY = 4;

// https://skygardenaccess.com/wp-content/..., also JSON-escaped (https:\/\/...).
const ASSET_RE = /https?:(\\?\/)\1skygardenaccess\.com((?:\\?\/)wp-(?:content|includes)(?:\\?\/)[^"'\s()<>&,]*?)(\?[^"'\s()<>&]*)?(?=["'\s()<>&,]|$)/g;

const toRoute = (file) => (file === "_root.html" ? "" : file.slice(0, -5).replaceAll("__", "/"));

const assets = new Set();
let pages = 0;
for (const file of fs.readdirSync(CACHE)) {
  let html = fs.readFileSync(path.join(CACHE, file), "utf8");

  // Keep one size per image: responsive variants would multiply the
  // number of files to host for little benefit.
  html = html
    .replace(/\s(?:data-)?srcset="[^"]*"/g, "")
    .replace(/\s(?:data-)?srcset=\\"[^"]*\\"/g, "") // HTML embedded in JSON (gallery data)
    .replace(/\sdata-thumb-srcset="[^"]*"/g, "")
    .replace(/&quot;srcset&quot;:&quot;.*?&quot;/g, "&quot;srcset&quot;:&quot;&quot;");

  html = html.replace(ASSET_RE, (m, slash, p) => p);
  for (const [p] of html.replaceAll("\\/", "/").matchAll(/\/wp-(?:content|includes)\/[^"'\s()<>&,*\\#]+/g))
    if (/\.\w+$/.test(p)) assets.add(p); // files only, not bare folder URLs

  const route = toRoute(file);
  const out = path.join(ROOT, "legacy-html", route, "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  pages++;
}
fs.writeFileSync(path.join(ROOT, ".cache", "assets.txt"), [...assets].join("\n"));
console.log(`${pages} pages written to legacy-html/, ${assets.size} assets referenced`);

async function download(p) {
  const dest = path.join(PUBLIC, decodeURIComponent(p));
  if (fs.existsSync(dest)) return fs.readFileSync(dest);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SITE + p, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) {
        console.log(`missing ${res.status} ${p}`);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return buf;
    } catch (e) {
      console.log(`retry ${attempt} ${p} (${e.message})`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  return null;
}

// Stylesheets pull in fonts and images through url(): fetch those too.
function cssDeps(css, p) {
  const deps = [];
  for (const [, , u] of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    if (/^(data:|#)/.test(u)) continue;
    const url = new URL(u, SITE + p);
    if (url.host === "skygardenaccess.com" && /^\/wp-(content|includes)\//.test(url.pathname)) deps.push(url.pathname);
  }
  return deps;
}

const queue = [...assets];
const done = new Set(queue);
let count = 0;
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    const buf = await download(p);
    if (++count % 100 === 0) console.log(`${count} assets`);
    if (buf && p.endsWith(".css")) {
      let css = buf.toString("utf8");
      for (const d of cssDeps(css, p)) if (!done.has(d)) { done.add(d); queue.push(d); }
      // Absolute URLs to the old site inside CSS become root-relative.
      if (css.includes(SITE)) fs.writeFileSync(path.join(PUBLIC, p), css.replaceAll(SITE + "/", "/"));
    }
  }
}
if (process.argv[2] === "--list") process.exit(0);
while (queue.length) await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${count} assets in public/`);
