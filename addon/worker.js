/**
 * Donghua Catalog for Nuvio
 * Cloudflare Worker using the public AniList GraphQL API.
 *
 * Catalog and metadata only. It does not provide video streams.
 */

const ANILIST_API = "https://graphql.anilist.co";
const PAGE_SIZE = 30;
const SERIES_FORMATS = ["TV", "TV_SHORT", "ONA", "OVA"];
const CATALOGS = [
  { type: "series", id: "donghua-series", name: "Donghua & Series" },
  { type: "movie", id: "donghua-movies", name: "Donghua Movies" }
];

const MANIFEST = {
  id: "community.donghua.catalog",
  version: "0.2.0",
  name: "Donghua Catalog",
  description: "Katalog dan metadata donghua dari AniList. Tidak menyediakan streaming.",
  resources: ["catalog", "meta"],
  types: ["series", "movie"],
  idPrefixes: ["anilist:"],
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

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large }
  description(asHtml: false)
  episodes
  format
  status
  seasonYear
  genres
  siteUrl
`;

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

async function anilistRequest(query, variables = {}) {
  const response = await fetch(ANILIST_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "user-agent": "Nuvio-Donghua-Catalog/0.2"
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((item) => item.message).join("; ")
      || "AniList returned HTTP " + response.status;
    throw new Error(message);
  }
  return payload.data;
}

function displayTitle(media) {
  return media.title?.english || media.title?.romaji || media.title?.native || "Untitled";
}

function toMetaPreview(media, type) {
  return {
    id: "anilist:" + media.id,
    type,
    name: displayTitle(media),
    poster: media.coverImage?.extraLarge || media.coverImage?.large,
    posterShape: "poster",
    description: [
      media.seasonYear || "",
      media.format || "",
      media.episodes ? media.episodes + " episodes" : "",
      media.status || ""
    ].filter(Boolean).join(" • ") || "Donghua metadata from AniList."
  };
}

async function getCatalog(type, params) {
  const search = (params.get("search") || "").trim() || null;
  const skip = Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0);
  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const formats = type === "movie" ? ["MOVIE"] : SERIES_FORMATS;

  const query = `
    query ($page: Int, $perPage: Int, $search: String, $formats: [MediaFormat]) {
      Page(page: $page, perPage: $perPage) {
        media(
          type: ANIME
          countryOfOrigin: "CN"
          format_in: $formats
          search: $search
          isAdult: false
          sort: POPULARITY_DESC
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistRequest(query, {
    page,
    perPage: PAGE_SIZE,
    search,
    formats
  });

  return {
    metas: (data.Page?.media || []).map((media) => toMetaPreview(media, type))
  };
}

async function getMeta(type, rawId) {
  const id = Number.parseInt(rawId.replace(/^anilist:/, ""), 10);
  if (!Number.isInteger(id) || id <= 0) return { meta: null };

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
      }
    }
  `;
  const data = await anilistRequest(query, { id });
  const media = data.Media;
  if (!media) return { meta: null };

  const details = [
    media.description || "",
    media.seasonYear ? "Year: " + media.seasonYear : "",
    media.format ? "Format: " + media.format : "",
    media.episodes ? "Episodes: " + media.episodes : "",
    media.status ? "Status: " + media.status : "",
    media.genres?.length ? "Genres: " + media.genres.join(", ") : ""
  ].filter(Boolean).join("\n\n");

  return {
    meta: {
      id: "anilist:" + media.id,
      type,
      name: displayTitle(media),
      poster: media.coverImage?.extraLarge || media.coverImage?.large,
      posterShape: "poster",
      description: details,
      links: media.siteUrl ? [{
        name: "AniList",
        category: "Source",
        url: media.siteUrl
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
