/**
 * Donghua Catalog for Nuvio
 * Cloudflare Worker using the public Kitsu JSON:API.
 *
 * Catalog and metadata only. It does not provide video streams.
 */

const KITSU_API = "https://kitsu.io/api/edge";
const PAGE_SIZE = 20;
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
  version: "0.5.0",
  name: "Donghua Catalog",
  description: "Katalog donghua dari Kitsu dengan penyaringan judul yang diketahui tidak relevan. Tidak menyediakan streaming.",
  resources: ["catalog", "meta"],
  types: ["series", "movie"],
  idPrefixes: ["kitsu:"],
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

async function getCatalog(type, params) {
  const search = (params.get("search") || "").trim();
  const skip = Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0);
  const subtype = type === "movie" ? "movie" : SERIES_SUBTYPES.join(",");
  const terms = search ? [search] : ["donghua"];
  const collected = new Map();

  // Kitsu search is text-based. Use the specific "donghua" term for the
  // default catalog to reduce unrelated anime. User search replaces this term.
  for (const term of terms) {
    const result = await searchKitsu(term, subtype, skip);
    for (const item of (result.data || [])) {
      if (EXCLUDED_IDS.has(String(item.id))) continue;
      if (!collected.has(item.id)) collected.set(item.id, item);
    }
  }

  const items = [...collected.values()];
  return {
    metas: items.slice(0, PAGE_SIZE).map((item) => toMetaPreview(item, type))
  };
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
