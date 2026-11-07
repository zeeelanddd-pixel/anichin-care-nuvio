/**
 * Donghua Catalog — Nuvio / Stremio addon
 * Cloudflare Worker · AniList GraphQL · catalog + meta only (no streams)
 *
 * Install after deploy:
 *   https://YOUR-WORKER.workers.dev/manifest.json
 */

const ANILIST = "https://graphql.anilist.co";
const PAGE_SIZE = 20;
const TIMEOUT_MS = 12000;
const VERSION = "2.0.0";

const MANIFEST = {
  id: "community.donghua.anilist.catalog",
  version: VERSION,
  name: "Donghua Catalog",
  description:
    "Katalog donghua (animasi China) dari AniList: serial, ONA, OVA, special, dan film. Metadata saja — tanpa streaming.",
  logo: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx120220-sdm29OEAijm7.jpg",
  resources: [
    "catalog",
    {
      name: "meta",
      types: ["series", "movie"],
      idPrefixes: ["anilist:"],
    },
  ],
  types: ["series", "movie"],
  idPrefixes: ["anilist:"],
  catalogs: [
    {
      type: "series",
      id: "donghua-trending",
      name: "Donghua Trending",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false },
      ],
    },
    {
      type: "series",
      id: "donghua-series",
      name: "Donghua Series",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false },
      ],
    },
    {
      type: "movie",
      id: "donghua-movies",
      name: "Donghua Movies",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false },
      ],
    },
  ],
  behaviorHints: {
    adult: false,
    p2pNotSupported: true,
    configurable: false,
  },
};

function corsHeaders(extra = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extra,
  };
}

function json(data, status = 200, cacheSeconds = 300) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      "cache-control": "public, max-age=" + cacheSeconds,
    }),
  });
}

async function anilist(query, variables) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANILIST, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "DonghuaCatalog/" + VERSION,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) throw new Error("AniList rate limit. Coba lagi sebentar.");
    if (!res.ok) throw new Error("AniList HTTP " + res.status);
    const body = await res.json();
    if (!body.data) {
      const msg = (body.errors && body.errors[0] && body.errors[0].message) || "AniList kosong";
      throw new Error(msg);
    }
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

function latinTitle(title) {
  if (!title) return "Untitled";
  const en = (title.english || "").trim();
  const ro = (title.romaji || "").trim();
  return en || ro || (title.native || "").trim() || "Untitled";
}

function plainText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function statusLabel(status) {
  switch (status) {
    case "FINISHED":
      return "Finished";
    case "RELEASING":
      return "Airing";
    case "NOT_YET_RELEASED":
      return "Upcoming";
    case "CANCELLED":
      return "Cancelled";
    case "HIATUS":
      return "Hiatus";
    default:
      return status || "";
  }
}

function isMovieFormat(format) {
  return format === "MOVIE";
}

function stremioType(format) {
  return isMovieFormat(format) ? "movie" : "series";
}

function releaseInfo(node) {
  const year = node.seasonYear || (node.startDate && node.startDate.year) || null;
  if (!year) return undefined;
  if (isMovieFormat(node.format)) return String(year);
  if (node.status === "RELEASING" || node.status === "NOT_YET_RELEASED") return year + "-";
  const end = node.endDate && node.endDate.year;
  if (end && end !== year) return year + "-" + end;
  return String(year);
}

function toPreview(node) {
  const type = stremioType(node.format);
  const year = node.seasonYear || (node.startDate && node.startDate.year) || null;
  const score = node.averageScore != null ? (node.averageScore / 10).toFixed(1) : null;
  return {
    id: "anilist:" + node.id,
    type,
    name: latinTitle(node.title),
    poster: (node.coverImage && (node.coverImage.extraLarge || node.coverImage.large)) || null,
    posterShape: "poster",
    background: node.bannerImage || null,
    description: plainText(node.description).slice(0, 280) || undefined,
    releaseInfo: year ? String(year) : undefined,
    imdbRating: score || undefined,
    genres: node.genres || undefined,
  };
}

function buildVideos(node) {
  if (isMovieFormat(node.format)) return undefined;
  const count = Math.min(Number(node.episodes) || 0, 500);
  if (count <= 0) {
    return [
      {
        id: "anilist:" + node.id + ":1:1",
        title: "Episode 1",
        season: 1,
        episode: 1,
      },
    ];
  }
  const videos = [];
  for (let i = 1; i <= count; i++) {
    videos.push({
      id: "anilist:" + node.id + ":1:" + i,
      title: "Episode " + i,
      season: 1,
      episode: i,
    });
  }
  return videos;
}

function toMeta(node) {
  const type = stremioType(node.format);
  const score = node.averageScore != null ? (node.averageScore / 10).toFixed(1) : null;
  const studio =
    node.studios &&
    node.studios.nodes &&
    node.studios.nodes[0] &&
    node.studios.nodes[0].name;

  const bits = [
    plainText(node.description),
    node.format ? "Format: " + node.format : "",
    statusLabel(node.status) ? "Status: " + statusLabel(node.status) : "",
    node.episodes ? "Episodes: " + node.episodes : "",
    node.duration ? "Runtime: " + node.duration + " min" : "",
    studio ? "Studio: " + studio : "",
  ].filter(Boolean);

  return {
    id: "anilist:" + node.id,
    type,
    name: latinTitle(node.title),
    poster: (node.coverImage && (node.coverImage.extraLarge || node.coverImage.large)) || null,
    posterShape: "poster",
    background: node.bannerImage || null,
    description: bits.join("\n\n"),
    releaseInfo: releaseInfo(node),
    imdbRating: score || undefined,
    genres: node.genres || undefined,
    runtime: node.duration ? node.duration + " min" : undefined,
    country: "China",
    website: node.siteUrl || undefined,
    videos: buildVideos(node),
    links: [
      {
        name: "AniList",
        category: "Source",
        url: node.siteUrl || "https://anilist.co/anime/" + node.id,
      },
    ],
  };
}

const CARD_FIELDS = `
  id
  idMal
  siteUrl
  title { romaji english native }
  format
  episodes
  duration
  status
  seasonYear
  startDate { year }
  endDate { year }
  averageScore
  coverImage { large extraLarge }
  bannerImage
  description(asHtml: false)
  genres
  studios(isMain: true) { nodes { name } }
`;

function catalogSort(catalogId) {
  if (catalogId === "donghua-trending") return "TRENDING_DESC";
  return "POPULARITY_DESC";
}

function formatIn(type) {
  if (type === "movie") return ["MOVIE"];
  return ["TV", "ONA", "OVA", "SPECIAL"];
}

async function getCatalog(type, catalogId, searchParams) {
  const search = (searchParams.get("search") || "").trim().slice(0, 80);
  const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10) || 0);
  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const sort = catalogSort(catalogId);
  const formats = formatIn(type);

  const query = search
    ? `query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $formatIn: [MediaFormat]) {
        Page(page: $page, perPage: $perPage) {
          media(
            countryOfOrigin: "CN"
            type: ANIME
            search: $search
            sort: $sort
            format_in: $formatIn
            isAdult: false
          ) { ${CARD_FIELDS} }
        }
      }`
    : `query ($page: Int, $perPage: Int, $sort: [MediaSort], $formatIn: [MediaFormat]) {
        Page(page: $page, perPage: $perPage) {
          media(
            countryOfOrigin: "CN"
            type: ANIME
            sort: $sort
            format_in: $formatIn
            isAdult: false
          ) { ${CARD_FIELDS} }
        }
      }`;

  const variables = {
    page,
    perPage: PAGE_SIZE,
    sort: [sort],
    formatIn: formats,
  };
  if (search) variables.search = search;

  const data = await anilist(query, variables);
  const media = (data.Page && data.Page.media) || [];
  const metas = media
    .filter((node) => node && stremioType(node.format) === type)
    .map(toPreview);

  return { metas };
}

async function getMeta(type, rawId) {
  const idStr = String(rawId || "").replace(/^anilist:/i, "");
  if (!/^\d+$/.test(idStr)) return { meta: null };
  const id = Number(idStr);

  const data = await anilist(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${CARD_FIELDS}
        countryOfOrigin
      }
    }`,
    { id }
  );

  const node = data.Media;
  if (!node || node.countryOfOrigin !== "CN") return { meta: null };
  if (stremioType(node.format) !== type) {
    // still return meta so the client can show the title
  }
  return { meta: toMeta(node) };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/" || path === "") {
      return json({
        addon: MANIFEST.name,
        version: MANIFEST.version,
        status: "ok",
        message: "Pasang lewat /manifest.json di Nuvio (Settings → Addons).",
      });
    }

    if (path === "/manifest.json") {
      return json(MANIFEST, 200, 3600);
    }

    // /catalog/{type}/{id}.json or /catalog/{type}/{id}/skip=N.json or with extra path segments
    const catalogMatch = path.match(
      /^\/catalog\/(series|movie)\/([^/]+)(?:\/([^/]+))?\.json$/
    );
    if (catalogMatch) {
      const type = catalogMatch[1];
      const catalogId = catalogMatch[2];
      const extra = catalogMatch[3] || "";
      const params = new URLSearchParams(url.search);
      // Stremio sometimes encodes extras in the path: skip=20 or search=foo
      if (extra) {
        for (const part of extra.split("&")) {
          const eq = part.indexOf("=");
          if (eq > 0) {
            params.set(
              decodeURIComponent(part.slice(0, eq)),
              decodeURIComponent(part.slice(eq + 1))
            );
          }
        }
      }
      try {
        return json(await getCatalog(type, catalogId, params), 200, 300);
      } catch (err) {
        return json({ metas: [], error: String(err.message || err) }, 502, 30);
      }
    }

    const metaMatch = path.match(/^\/meta\/(series|movie)\/(.+)\.json$/);
    if (metaMatch) {
      try {
        const id = decodeURIComponent(metaMatch[2]);
        return json(await getMeta(metaMatch[1], id), 200, 600);
      } catch (err) {
        return json({ meta: null, error: String(err.message || err) }, 502, 30);
      }
    }

    return json({ error: "Not found", path }, 404, 60);
  },
};
                                 
