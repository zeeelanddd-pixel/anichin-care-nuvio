import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

function mockFetch(url, options = {}) {
  const parsed = new URL(url);
  if (parsed.hostname === "kitsu.io") {
    return Promise.resolve(new Response(JSON.stringify({
      data: [{
        id: "9001",
        attributes: {
          titles: { en: "Mock Donghua", zh_cn: "Mock Donghua" },
          canonicalTitle: "Mock Donghua",
          startDate: "2024-01-01",
          subtype: parsed.searchParams.get("filter[subtype]") === "movie" ? "movie" : "TV",
          episodeCount: 12,
          status: "finished",
          posterImage: { original: "https://example.com/kitsu.jpg" }
        }
      }]
    }), { status: 200, headers: { "content-type": "application/vnd.api+json" } }));
  }
  if (parsed.hostname === "api.bgm.tv" && parsed.pathname === "/v0/search/subjects") {
    const keyword = JSON.parse(options.body || "{}").keyword || "";
    return Promise.resolve(new Response(JSON.stringify({
      data: [{
        id: keyword === "Movie Test" ? 2002 : 2001,
        name: "Mock Bangumi",
        name_cn: keyword === "Movie Test" ? "Test Movie" : "Test Series",
        date: "2023-01-01",
        platform: keyword === "Movie Test" ? "Movie" : "TV",
        eps: keyword === "Movie Test" ? 1 : 24,
        score: 8.1,
        images: { large: "https://example.com/bangumi.jpg" }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  if (parsed.hostname === "api.bgm.tv" && parsed.pathname === "/v0/subjects/2001") {
    return Promise.resolve(new Response(JSON.stringify({
      id: 2001, name: "Mock Bangumi", name_cn: "Mock Bangumi",
      date: "2023-01-01", platform: "TV", eps: 24,
      summary: "Mock summary", images: { large: "https://example.com/bangumi.jpg" }
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

test("manifest exposes Stremio-compatible catalog and metadata resources", async () => {
  const response = await worker.fetch(new Request("https://addon.test/manifest.json"));
  const manifest = await response.json();
  assert.equal(response.status, 200);
  assert.equal(manifest.version, "1.1.0");
  assert.deepEqual(manifest.resources, ["catalog", "meta"]);
  assert.deepEqual(manifest.idPrefixes, ["kitsu:", "bangumi:"]);
  assert.equal(manifest.catalogs.length, 2);
});

test("series catalog merges Kitsu and Bangumi metadata", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const response = await worker.fetch(new Request("https://addon.test/catalog/series/donghua-series.json"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(payload.metas.some(x => x.id === "kitsu:9001"));
    assert.ok(payload.metas.some(x => x.id === "bangumi:2001"));
    assert.ok(payload.metas.every(x => x.type === "series"));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("movie catalog keeps movie entries only", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const response = await worker.fetch(new Request("https://addon.test/catalog/movie/donghua-movies.json"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(payload.metas.every(x => x.type === "movie"));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("Bangumi movie search is classified into the movie catalog", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const response = await worker.fetch(new Request("https://addon.test/catalog/movie/donghua-movies.json?search=Movie%20Test"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(payload.metas.some(x => x.id === "bangumi:2002" && x.type === "movie"));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("Bangumi metadata route returns a detailed meta object", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const response = await worker.fetch(new Request("https://addon.test/meta/series/bangumi:2001.json"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.meta.id, "bangumi:2001");
    assert.match(payload.meta.description, /Mock summary/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
