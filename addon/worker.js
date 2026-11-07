/**
 * Anichin Catalog for Nuvio
 * Cloudflare Worker implementing the Stremio addon protocol.
 *
 * Stage 1: catalog + metadata discovery from Anichin's public archive.
 * This Worker does not host or proxy video files.
 */

const BASE = "https://anichin.moe";
const PAGE_SIZE = 30;
const CATALOGS = [
  { type: "series", id: "anichin-series", name: "Donghua & Series" },
  { type: "movie", id: "anichin-movies", name: "Movies" }
];

const MANIFEST = {
  id: "community.anichin.catalog",
  version: "0.1.0",
  name: "Anichin Catalog",
  description: "Katalog dan metadata judul dari Anichin. Addon komunitas tidak resmi.",
  logo: "https://anichin.moe/wp-content/uploads/2024/01/cropped-favicon-192x192.png",
  resources: ["catalog", "meta"],
  types: ["series", "movie"],
  idPrefixes: ["anichin:"],
  catalogs: CATALOGS.map((c) => ({
    type: c.type,
    id: c.id,
    name: c.name,
    extra: [
      { name: "search", isRequired: false },
      { name: "skip", isRequired: false }
    ]
  }))
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60"
    }
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, pageUrl) {
  if (!value) return "";
  try { return new URL(decodeHtml(value), pageUrl).href; }
  catch (_) { return ""; }
}

function slugFromUrl(value) {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, "");
    return path.split("/").filter(Boolean).pop() || "";
  } catch (_) { return ""; }
}

function parseCards(html, pageUrl) {
  const cards = [];
  const seen = new Set();
  const re = /<article\b[^>]*class=["'][^"']*\bbs\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;
  let match;
  while ((match = re.exec(html))) {
    const block = match[0];
    const anchor = /<a\b([^>]*href=["']([^"']+)["'][^>]*)>/i.exec(block);
    if (!anchor) continue;
    const url = absoluteUrl(anchor[2], pageUrl);
    const slug = slugFromUrl(url);
    if (!url || !slug || seen.has(url)) continue;

    const titleAttr = /\btitle=["']([^"']+)["']/i.exec(anchor[1]);
    const heading = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(block);
    const tt = /class=["'][^"']*tt[^"']*["'][^>]*>([\s\S]*?)</i.exec(block);
    const title = stripHtml(titleAttr ? titleAttr[1] : heading ? heading[1] : tt ? tt[1] : "");
    if (!title) continue;

    const img = /<img\b[^>]*(?:data-src|data-lazy-src|src)=["']([^"']+)["'][^>]*>/i.exec(block);
    const poster = img ? absoluteUrl(img[1], pageUrl) : "";
    const isMovie = /\bmovie\b/i.test(stripHtml(block));
    seen.add(url);
    cards.push({ id: "anichin:" + slug, type: isMovie ? "movie" : "series", name: title, poster, url });
  }
  return cards;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AnichinCatalog/0.1)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });
  if (!response.ok) throw new Error("Anichin returned HTTP " + response.status);
  return await response.text();
}

function catalogUrl(page, search) {
  if (search) {
    const url = new URL("/", BASE);
    url.searchParams.set("s", search);
    if (page > 1) url.searchParams.set("page", String(page));
    return url.href;
  }
  const url = new URL("/anime/", BASE);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.href;
}

async function getCatalog(type, params) {
  const search = (params.get("search") || "").trim();
  const skip = Math.max(0, parseInt(params.get("skip") || "0", 10) || 0);
  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const html = await fetchHtml(catalogUrl(page, search));
  const cards = parseCards(html, catalogUrl(page, search))
    .filter((item) => item.type === type)
    .slice(0, PAGE_SIZE);

  return {
    metas: cards.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      poster: item.poster || undefined,
      posterShape: "poster",
      description: "Sumber katalog: Anichin. Buka detail untuk informasi lebih lanjut."
    }))
  };
}

async function getMeta(type, id) {
  const slug = id.replace(/^anichin:/, "").replace(/[^a-z0-9-]/gi, "");
  if (!slug) return { meta: null };
  const url = new URL("/" + slug + "/", BASE).href;
  const html = await fetchHtml(url);

  const titleMatch = /<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html)
    || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const name = stripHtml(titleMatch ? titleMatch[1] : slug.replace(/-/g, " "));
  const posterMatch = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)
    || /<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html);
  const poster = posterMatch ? absoluteUrl(posterMatch[1], url) : undefined;
  const descMatch = /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const description = descMatch ? stripHtml(descMatch[1]).slice(0, 1200) : "Metadata diambil dari halaman Anichin.";

  const videos = [];
  const seen = new Set();
  const epRe = /<a\b[^>]*href=["']([^"']*episode-0*(\d+(?:\.\d+)?)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let ep;
  while ((ep = epRe.exec(html))) {
    const epUrl = absoluteUrl(ep[1], url);
    if (!epUrl || seen.has(epUrl)) continue;
    seen.add(epUrl);
    const number = Number(ep[2]);
    videos.push({
      id: id + ":episode:" + String(number),
      title: stripHtml(ep[3]) || ("Episode " + number),
      season: 1,
      episode: number
    });
  }

  videos.sort((a, b) => a.episode - b.episode);
  const meta = {
    id,
    type,
    name,
    poster,
    posterShape: "poster",
    description,
    videos: type === "series" ? videos : undefined,
    links: [{ name: "Halaman sumber Anichin", category: "Source", url }]
  };
  return { meta };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    }

    if (url.pathname === "/manifest.json") return json(MANIFEST);
    const catalog = url.pathname.match(/^\/catalog\/(series|movie)\/([^/]+)\.json$/);
    if (catalog) {
      try { return json(await getCatalog(catalog[1], url.searchParams)); }
      catch (error) { return json({ metas: [], error: String(error.message || error) }, 502); }
    }

    const meta = url.pathname.match(/^\/meta\/(series|movie)\/(.+)\.json$/);
    if (meta) {
      try { return json(await getMeta(meta[1], decodeURIComponent(meta[2]))); }
      catch (error) { return json({ meta: null, error: String(error.message || error) }, 502); }
    }

    return json({ addon: MANIFEST.name, status: "ok", message: "Gunakan /manifest.json untuk memasang addon." });
  }
};
