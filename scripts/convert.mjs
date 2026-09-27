// Converts the static WordPress export in legacy-html/ into JSON page data
// consumed by the Next.js catch-all route (content/pages.json).
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "legacy-html");
const OUT = path.join(ROOT, "content", "pages.json");
const SITE = "https://skygardenaccess.com";

// Tracking / WordPress-only scripts that make no sense without the WP backend.
const DROP_SCRIPT = [
  /wp-emoji/,
  /speculationrules/,
  /sourcebuster/,
  /wc-order-attribution/,
  /wc-cart-fragments/,
  /facebook-signal/,
  /fb_pxl_code/,
  /cgkit_nonce/,
  /kirki/,
  /wp_kirki/,
  /comment-reply/,
  /zxcvbn/,
  /password-strength/,
  // Elementor's runtime lazy-loads chunks from the old WordPress server.
  /webpack\.runtime/,
  /frontend-modules\.min/,
  /\/frontend\.min\.[0-9a-f]+\.js/,
  /elementorFrontendConfig/,
];

function findPages(dir, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...findPages(path.join(dir, entry.name), r));
    else if (entry.name === "index.html") out.push(rel);
  }
  return out;
}

function rewriteUrl(url, route) {
  if (!url) return url;
  const u = url.trim();
  // Absolute links to the old site become local links.
  if (u.startsWith(SITE + "/") && !/\/(wp-|xmlrpc|feed|comments\/feed)/.test(u)) return rewriteUrl(u.slice(SITE.length), "");
  if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(u)) return url;
  const resolved = new URL(u, route ? `http://x/${route}/` : "http://x/");
  let p = resolved.pathname.replace(/\/index(\.[0-9a-f]+)?\.html$/, "/");
  if (p.endsWith("/index.html")) p = p.slice(0, -"index.html".length);
  p = p.replace(/\/assets\/(css\.[0-9a-f]+)\.bin$/, "/assets/$1.css");
  return p + resolved.search + resolved.hash;
}

function rewriteCss(css, route) {
  return css
    .replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => `url(${q}${rewriteUrl(u, route)}${q})`)
    // The export wrote HTML entities inside CSS strings (icon glyphs): use CSS escapes.
    .replace(/&#(\d+);/g, (m, d) => "\\" + Number(d).toString(16) + " ")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => "\\" + h + " ");
}

function rewriteInlineJs(js, route) {
  return js.replace(/(["'])((?:\.\.\/)*(?:images|js|css|fonts|assets)\/[^"']+)\1/g, (m, q, u) => q + rewriteUrl(u, route) + q);
}

const pages = {};
const routes = findPages(SRC);
const missing = new Set();

for (const route of routes) {
  const html = fs.readFileSync(path.join(SRC, route, "index.html"), "utf8");
  const $ = cheerio.load(html, { decodeEntities: false });

  const meta = {
    title: $("head > title").text().trim(),
    description: $('meta[name="description"]').attr("content") || "",
    lang: $("html").attr("lang") || "fr-FR",
    canonical: $('link[rel="canonical"]').attr("href") || "",
  };

  const stylesheets = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const media = $(el).attr("media");
    const dataMedia = $(el).attr("data-media");
    stylesheets.push({
      href: rewriteUrl($(el).attr("href"), route),
      media: media === "not all" && dataMedia ? dataMedia : media || "all",
    });
  });

  const styles = [];
  $("style").each((_, el) => {
    styles.push({ id: $(el).attr("id") || null, css: rewriteCss($(el).html(), route) });
  });

  const scripts = [];
  const jsonLd = [];
  $("script").each((_, el) => {
    const $el = $(el);
    const type = $el.attr("type") || "";
    const src = $el.attr("src");
    const id = $el.attr("id") || "";
    let code = $el.html() || "";
    if (type === "application/ld+json") {
      jsonLd.push(code.trim());
      return;
    }
    if (type === "module" || (type && !/javascript/.test(type))) return;
    // Keep the Meta pixel, but without the WooCommerce plugin wrapper
    // (FacebookSignal) whose script and AJAX endpoint no longer exist.
    const pixel = code.match(/FacebookSignal\.initPixel\("(\d+)"/);
    if (pixel) code = `fbq('init', '${pixel[1]}');`;
    else if (DROP_SCRIPT.some((re) => re.test(id) || re.test(src || "") || re.test(code))) return;
    if (src) scripts.push({ id, src: rewriteUrl(src, route) });
    else scripts.push({ id, code: rewriteInlineJs(code, route) });
  });

  // jQuery must run before any inline script that uses it.
  const isJq = (x) => /\/jquery(-migrate)?\.min\./.test(x.src || "");
  scripts.sort((a, b) => isJq(b) - isJq(a));

  const body = $("body");
  // Underscore templates (product variations) stay in the page: they are data, not code.
  body.find('script:not([type="text/template"]), style').remove();

  // Without Elementor's runtime, entrance animations never start: play them
  // straight away instead of leaving the elements hidden.
  body.find(".elementor-invisible").each((_, el) => {
    const $el = $(el);
    let animation = "fadeIn";
    try {
      const s = JSON.parse($el.attr("data-settings") || "{}");
      animation = s._animation || s.animation || animation;
    } catch {}
    $el.removeClass("elementor-invisible").addClass(`animated ${animation}`);
  });

  body.find("*").each((_, el) => {
    const $el = $(el);
    for (const attr of ["href", "src", "data-src", "data-bg", "data-background", "poster", "action", "data-thumb", "data-large_image", "xlink:href"]) {
      const v = $el.attr(attr);
      if (v) $el.attr(attr, rewriteUrl(v, route));
    }
    for (const attr of ["srcset", "data-srcset"]) {
      const v = $el.attr(attr);
      if (v)
        $el.attr(
          attr,
          v.split(",").map((part) => {
            const [u, ...rest] = part.trim().split(/\s+/);
            return [rewriteUrl(u, route), ...rest].join(" ");
          }).join(", ")
        );
    }
    const style = $el.attr("style");
    if (style && style.includes("url(")) $el.attr("style", rewriteCss(style, route));
    const href = $el.is("a") && $el.attr("href");
    if (href && href.startsWith("/") && href.endsWith("/")) missing.add(href.slice(1, -1));
  });

  pages[route] = {
    meta,
    bodyClass: (body.attr("class") || "").replace("woocommerce-no-js", "woocommerce-js"),
    stylesheets,
    styles,
    jsonLd,
    scripts,
    html: body.html().trim(),
  };
  console.log(`converted /${route}${route ? "/" : ""} (${scripts.length} scripts, ${stylesheets.length} stylesheets)`);
}

const notExported = [...missing].filter((r) => !(r in pages)).sort();
if (notExported.length) console.log(`\nlinked but not in the export (${notExported.length}):\n  /${notExported.join("/\n  /")}/\n`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pages));
console.log(`wrote ${OUT}`);
