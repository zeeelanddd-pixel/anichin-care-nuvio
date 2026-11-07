/**
 * Donghua Catalog for Nuvio
 * Cloudflare Worker using the public Kitsu JSON:API.
 *
 * Catalog and metadata only. It does not provide video streams.
 */

const KITSU_API = "https://kitsu.io/api/edge";
const BANGUMI_API = "https://api.bgm.tv/v0";
const PAGE_SIZE = 20;
const DEFAULT_SEARCH_TERMS = [
  "donghua",
  "Soul Land",
  "Battle Through the Heavens",
  "Perfect World",
  "Swallowed Star",
  "Renegade Immortal",
  "A Will Eternal",
  "The Kings Avatar",
  "Fog Hill of Five Elements",
  "The Westward"
];
// Exclude known false positives returned by Kitsu text search.
const EXCLUDED_IDS = new Set([
  "49575", // Pokemon Animated Pokedex: Eevee
  "49576", // Pokemon Animated Pokedex: Resting on the Island
  "7171",  // Taekwon Dongja Maruchi Arachi (Korean animation)
  "43160", // The Haunted House: The Secret of the Cave (Korean animation)
  "48862", // Honkai: Star Rail promotional animation
  "51099", // Honkai Impact 3rd promotional animation
  "51103"  // Honkai: Star Rail promotional animation
]);
const SERIES_SUBTYPES = ["TV", "ONA", "OVA", "special"];
const CATALOGS = [
  { type: "series", id: "donghua-series", name: "Donghua Series" },
  { type: "movie", id: "donghua-movies", name: "Donghua Movies" }
];

const MANIFEST = {
  id: "community.donghua.catalog",
  version: "0.7.0",
  name: "Donghua Catalog",
  description: "Katalog multi-sumber Kitsu dan Bangumi untuk memperluas cakupan donghua, series, dan movie. Tidak menyediakan streaming.",
  resources: ["catalog", "meta"],
  types: ["series", "movie"],
  idPrefixes: ["kitsu:", "bangumi:"],
  catalogs: CATALOGS.map((catalog) => ({
    type: catalog.type,
    id: catalog.id,
    name: catalog.name,
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
      "cache-control": "public, max-age=300"
    }
  });
}

async function kitsuRequest(path) {
  const response = await fetch(KITSU_API + path, {
    headers: {
      "accept": "application/vnd.api+json",
      "user-agent": "Nuvio-Donghua-Catalog/0.4"
    }
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Kitsu returned an unreadable response (HTTP " + response.status + ")");
  }

  if (!response.ok) {
    const message = payload.errors?.map((item) => item.detail || item.title).join("; ")
      || "Kitsu returned HTTP " + response.status;
    throw new Error(message);
  }
  return payload;
}

function titleOf(attributes) {
  const titles = attributes.titles || {};
  return titles.en || titles.en_jp || titles.ja_jp
    || attributes.canonicalTitle || "Untitled";
}

function posterOf(attributes) {
  return attributes.posterImage?.original
    || attributes.posterImage?.large
    || attributes.posterImage?.medium
    || null;
}

function toMetaPreview(item, type) {
  const a = item.attributes || {};
  return {
    id: "kitsu:" + item.id,
    type,
    name: titleOf(a),
    poster: posterOf(a),
    posterShape: "poster",
    description: [
      a.startDate ? a.startDate.slice(0, 4) : "",
      a.subtype || "",
      a.episodeCount ? a.episodeCount + " episodes" : "",
      a.status || ""
    ].filter(Boolean).join(" • ") || "Donghua metadata from Kitsu."
  };
}

async function searchKitsu(term, subtype, offset) {
  const params = new URLSearchParams();
  params.set("filter[text]", term);
  params.set("filter[subtype]", subtype);
  params.set("page[limit]", String(PAGE_SIZE));
  params.set("page[offset]", String(offset));
  params.set("sort", "-userCount");
  return kitsuRequest("/anime?" + params.toString());
}

async function bangumiRequest(path, body) {
  const response = await fetch(BANGUMI_API + path, {
    method: body ? "POST" : "GET",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "user-agent": "DonghuaCatalog/0.7.0 (github.com/zeeelanddd-pixel/anichin-care-nuvio)"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error("Bangumi returned unreadable JSON (HTTP " + response.status + ")"); }
  if (!response.ok) throw new Error("Bangumi returned HTTP " + response.status);
  return payload;
}

async function searchBangumi(term) {
  return bangumiRequest("/search/subjects?limit=20&offset=0", {
    keyword: term,
    sort: "heat",
    filter: { type: [2], nsfw: false }
  });
}

function bangumiItemType(item) {
  const value = String(item.platform || "") + " " + String(item.name_cn || item.name || "");
  return /movie|film|剧场版|电影|劇場/i.test(value) ? "movie" : "series";
}

function bangumiPoster(item) {
  const images = item.images || {};
  return images.large || images.medium || images.common || images.small || null;
}

function toBangumiPreview(item) {
  const year = item.date ? String(item.date).slice(0, 4) : "";
  const episodes = item.eps || item.total_episodes || "";
  return {
    id: "bangumi:" + item.id,
    type: bangumiItemType(item),
    name: item.name_cn || item.name || "Untitled",
    poster: bangumiPoster(item),
    posterShape: "poster",
    description: [year, item.platform || "", episodes ? episodes + " episodes" : "", item.score ? "rating " + item.score : ""].filter(Boolean).join(" • ") || "Metadata from Bangumi."
  };
}

function normalizedTitle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\s+/g, " ").trim();
}

async function getCatalog(type, params) {
  const search = (params.get("search") || "").trim();
  const skip = Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0);
  const subtype = type === "movie" ? "movie" : SERIES_SUBTYPES.join(",");
  const kitsuTerms = search ? [search] : DEFAULT_SEARCH_TERMS;
  const bangumiTerms = search ? [search] : ["国创", "国漫", "国产动画", "中国动画", "中国动画电影", "斗罗大陆", "斗破苍穹", "凡人修仙传"];
  const pair = await Promise.all([
    Promise.all(kitsuTerms.map((term) => searchKitsu(term, subtype, 0).catch(() => ({ data: [] })))),
    Promise.all(bangumiTerms.map((term) => searchBangumi(term).catch(() => ({ data: [] }))))
  ]);
  const kitsuMap = new Map();
  for (const result of pair[0]) {
    for (const item of (result.data || [])) if (!kitsuMap.has(String(item.id))) kitsuMap.set(String(item.id), item);
  }
  const bangumiMap = new Map();
  for (const result of pair[1]) {
    for (const item of (result.data || [])) {
      if (!item || !item.id || bangumiItemType(item) !== type) continue;
      if (!bangumiMap.has(String(item.id))) bangumiMap.set(String(item.id), item);
    }
  }
  const kitsuItems = Array.from(kitsuMap.values()).sort((a, b) => Number(b.attributes?.userCount || 0) - Number(a.attributes?.userCount || 0));
  const bangumiItems = Array.from(bangumiMap.values()).sort((a, b) => Number(b.collection?.collect || b.collection_total || 0) - Number(a.collection?.collect || a.collection_total || 0));
  const merged = [];
  const seen = new Set();
  const max = Math.max(kitsuItems.length, bangumiItems.length);
  for (let i = 0; i < max; i++) {
    const candidates = [kitsuItems[i], bangumiItems[i]];
    for (const item of candidates) {
      if (!item) continue;
      const isKitsu = !!item.attributes;
      const title = isKitsu ? titleOf(item.attributes) : (item.name_cn || item.name);
      const year = isKitsu ? String(item.attributes.startDate || "").slice(0, 4) : String(item.date || "").slice(0, 4);
      const key = normalizedTitle(title) + "|" + year + "|" + type;
      if (!title || seen.has(key)) continue;
      seen.add(key);
      merged.push(isKitsu ? toMetaPreview(item, type) : toBangumiPreview(item));
    }
  }
  return { metas: merged.slice(skip, skip + PAGE_SIZE) };
}
async function getMeta(type, rawId) {
  const id = rawId.replace(/^kitsu:/, "");
  if (!/^\d+$/.test(id)) return { meta: null };

  const payload = await kitsuRequest("/anime/" + encodeURIComponent(id));
  const item = payload.data;
  if (!item) return { meta: null };

  const a = item.attributes || {};
  const details = [
    a.synopsis || "",
    a.startDate ? "Start date: " + a.startDate : "",
    a.endDate ? "End date: " + a.endDate : "",
    a.subtype ? "Format: " + a.subtype : "",
    a.episodeCount ? "Episodes: " + a.episodeCount : "",
    a.status ? "Status: " + a.status : "",
    a.averageRating ? "Rating: " + a.averageRating : ""
  ].filter(Boolean).join("\n\n");

  return {
    meta: {
      id: "kitsu:" + item.id,
      type,
      name: titleOf(a),
      poster: posterOf(a),
      posterShape: "poster",
      description: details,
      links: a.slug ? [{
        name: "Kitsu",
        category: "Source",
        url: "https://kitsu.io/anime/" + a.slug
      }] : undefined
    }
  };
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
      try {
        return json(await getCatalog(catalog[1], url.searchParams));
      } catch (error) {
        return json({ metas: [], error: String(error.message || error) }, 502);
      }
    }

    const meta = url.pathname.match(/^\/meta\/(series|movie)\/(.+)\.json$/);
    if (meta) {
      try {
        return json(await getMeta(meta[1], decodeURIComponent(meta[2])));
      } catch (error) {
        return json({ meta: null, error: String(error.message || error) }, 502);
      }
    }

    return json({
      addon: MANIFEST.name,
      status: "ok",
      message: "Gunakan /manifest.json untuk memasang addon."
    });
  }
};
