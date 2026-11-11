/*
 * End-to-end behaviour tests with a mocked network. Nothing here touches the real internet.
 * Set VERBOSE=1 to see the providers' own log lines.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const PROVIDERS = path.join(__dirname, "..", "providers");
const realLog = console.log;
console.log = function () {
  if (/^\[(AnichinCare|BilibiliPublic|OdyseePublic)/.test(String(arguments[0] || ""))) {
    if (process.env.VERBOSE) realLog.apply(console, arguments);
    return;
  }
  realLog.apply(console, arguments);
};

function makeResponse(spec, url) {
  const status = spec.status || 200;
  return {
    status: status,
    ok: status >= 200 && status < 300,
    url: spec.url || url,
    text: function () { return Promise.resolve(spec.body == null ? "" : String(spec.body)); }
  };
}
// routes: functions (url, opts) => { body, status? } | falsy
function load(file, routes, key) {
  const calls = [];
  global.fetch = function (url, opts) {
    url = String(url);
    calls.push({ url: url, opts: opts || {} });
    for (let i = 0; i < routes.length; i++) {
      const hit = routes[i](url, opts || {});
      if (hit) return Promise.resolve(makeResponse(hit, url));
    }
    return Promise.reject(new Error("no mock route for " + url));
  };
  if (key === undefined) delete global.TMDB_API_KEY; else global.TMDB_API_KEY = key;
  const full = path.join(PROVIDERS, file);
  delete require.cache[require.resolve(full)];
  return { provider: require(full), calls: calls };
}
const at = (prefix, body) => (u) => u.startsWith(prefix) && { body: typeof body === "string" ? body : JSON.stringify(body) };
const b64 = (s) => Buffer.from(s).toString("base64");

/* ===================== Anichin ===================== */
const BASE = "https://anichin.moe";
const V3 = "0123456789abcdef0123456789abcdef";

const iframeOption = (label, src) => '<option value="' + b64('<iframe src="' + src + '" allowfullscreen></iframe>') + '">' + label + "</option>";
const mirrorPage = (options) =>
  '<html><body><select class="mirror" name="mirror"><option value="">Pilih Server Video</option>' +
  options.map((o) => iframeOption(o[0], o[1])).join("") + "</select></body></html>";
const seriesPage = (slug, nums) =>
  '<div class="eplister"><ul>' + nums.map((n) =>
    '<li><a href="' + BASE + "/" + slug + "-episode-" + n + '-subtitle-indonesia/"><div class="epl-num">' + n +
    '</div><div class="epl-title">Fake Show Episode ' + n + "</div></a></li>").join("") + "</ul></div>";

const okMeta = {
  videos: [
    { name: "mobile", url: "https://vd1.okcdn.ru/?id=1&type=0&sig=a" },
    { name: "sd", url: "https://vd1.okcdn.ru/?id=1&type=2&sig=a" },
    { name: "hd", url: "https://vd1.okcdn.ru/?id=1&type=3&sig=a" }
  ],
  hlsManifestUrl: "https://vd1.okcdn.ru/video.m3u8?id=1&sig=a"
};
// Reproduces the real OK.ru shape: JSON inside JSON inside an HTML attribute, with \u0026 for "&".
const htmlAttr = (o) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const okHtml = (flashvars) =>
  '<div data-options="{&quot;decoy&quot;:1}"></div><div data-module="OKVideo" data-options="' + htmlAttr({ flashvars: flashvars }) + '"></div>';
const okPage = okHtml({ metadata: JSON.stringify(okMeta).replace(/&/g, "\\u0026") });

const rumbleApi = { ua: { mp4: {
  "360": { url: "https://sp.rmbl.ws/s8/2/a/b/c/360.mp4", meta: { h: 360, w: 640 } },
  "720": { url: "https://sp.rmbl.ws/s8/2/a/b/c/720.mp4", meta: { h: 720, w: 1280 } }
} } };
const dmMeta = { qualities: {
  auto: [{ type: "application/x-mpegURL", url: "https://www.dailymotion.com/cdn/manifest/video/x8abcd.m3u8?auth=1" }],
  "720": [{ type: "video/mp4", url: "https://cdn.dmcdn.net/x/720.mp4?x=1" }]
} };

function anichinRoutes(extra) {
  return [
    at("https://api.themoviedb.org/3/tv/1234?language=en-US&api_key=" + V3, { name: "Fake Show", original_name: "假节目" }),
    at(BASE + "/wp-json/wp/v2/search?search=Fake%20Show", [
      { title: "Fake Show", url: BASE + "/seri/fake-show/" },
      { title: "Fake Show Season 2", url: BASE + "/seri/fake-show-season-2/" }
    ]),
    at(BASE + "/seri/fake-show/", seriesPage("fake-show", [1, 2, 3])),
    at(BASE + "/seri/fake-show-season-2/", seriesPage("fake-show-season-2", [1, 2, 3])),
    at(BASE + "/fake-show-episode-2-subtitle-indonesia/", mirrorPage([
      ["OK.ru", "https://ok.ru/videoembed/111"],
      ["Rumble", "https://rumble.com/embed/v5abc/"],
      ["Dailymotion", "https://www.dailymotion.com/embed/video/x8abcd"],
      ["Server Utama", "https://cdn.example.net/v/ep2.m3u8"],
      ["Youtube", "https://www.youtube.com/embed/zzz"]
    ])),
    at(BASE + "/fake-show-episode-3-subtitle-indonesia/", mirrorPage([["Server S1", "https://cdn.example.net/s1e3.m3u8"]])),
    at(BASE + "/fake-show-season-2-episode-3-subtitle-indonesia/", mirrorPage([["Server S2", "https://cdn.example.net/s2e3.m3u8"]])),
    at("https://ok.ru/videoembed/111", okPage),
    at("https://rumble.com/embedJS/u3/?request=video&ver=2&v=v5abc", rumbleApi),
    at("https://www.dailymotion.com/player/metadata/video/x8abcd", dmMeta)
  ].concat(extra || []);
}

test("anichin: resolves OK.ru, Rumble, Dailymotion and direct mirrors; skips unsupported hosts", async () => {
  const { provider, calls } = load("anichin-care.js", anichinRoutes(), V3);
  const streams = await provider.getStreams("1234", "tv", 1, 2);
  const byUrl = (u) => streams.find((s) => s.url === u);

  // OK.ru: extensionless MP4 URLs must survive, with qualities taken from the metadata names.
  const hd = byUrl("https://vd1.okcdn.ru/?id=1&type=3&sig=a");
  assert.ok(hd, "OK.ru hd stream missing (\\u0026 metadata must parse)");
  assert.equal(hd.quality, "720p");
  assert.equal(hd.name, "OK.ru");
  assert.equal(hd.headers.Referer, "https://ok.ru/videoembed/111");
  assert.equal(byUrl("https://vd1.okcdn.ru/?id=1&type=2&sig=a").quality, "480p");
  assert.ok(byUrl("https://vd1.okcdn.ru/video.m3u8?id=1&sig=a"), "OK.ru HLS missing");

  const rumble = byUrl("https://sp.rmbl.ws/s8/2/a/b/c/720.mp4");
  assert.equal(rumble.quality, "720p");
  assert.equal(rumble.name, "Rumble");
  assert.equal(rumble.headers.Referer, "https://rumble.com/embed/v5abc/");

  const auto = byUrl("https://www.dailymotion.com/cdn/manifest/video/x8abcd.m3u8?auth=1");
  assert.ok(auto, "Dailymotion HLS missing");
  assert.equal(auto.quality, "Auto");
  assert.equal(auto.name, "Dailymotion");
  assert.equal(byUrl("https://cdn.dmcdn.net/x/720.mp4?x=1").quality, "720p");

  const direct = byUrl("https://cdn.example.net/v/ep2.m3u8");
  assert.ok(direct, "direct m3u8 mirror missing");
  assert.equal(direct.headers.Referer, BASE + "/");

  // Titles: no duplicated resolution, but a descriptive server label is kept.
  assert.equal(hd.title, "OK.ru • 720p");
  assert.equal(rumble.title, "Rumble • 720p");
  assert.equal(auto.title, "Dailymotion");
  assert.equal(direct.title, "Server Utama • cdn.example.net");

  assert.equal(streams.length, 9);
  assert.ok(!streams.some((s) => /youtube/.test(s.url)), "unsupported hosts must be ignored");
  assert.ok(streams.every((s) => s.name && s.title && s.url && s.quality && s.headers["User-Agent"]));
  assert.ok(!calls.some((c) => /season-2/.test(c.url)), "season 1 must not touch the Season 2 page");
  assert.ok(streams.every((s) => !/Episode|mirror/i.test(s.title)), "titles should be tidy");
});

test("anichin: season 2 uses the Season 2 page instead of the unmarked series page", async () => {
  const { provider } = load("anichin-care.js", anichinRoutes(), V3);
  const streams = await provider.getStreams("1234", "tv", 2, 3);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/s2e3.m3u8"]);
});

test("anichin: season 1 episode 3 uses the plain series page", async () => {
  const { provider } = load("anichin-care.js", anichinRoutes(), V3);
  const streams = await provider.getStreams(1234, "tv", 1, 3);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/s1e3.m3u8"]);
});

test("anichin: season/episode of null or -1 (movies) are normalised", async () => {
  const { provider } = load("anichin-care.js", anichinRoutes(), V3);
  const streams = await provider.getStreams("1234", "tv", null, "2");
  assert.ok(streams.length > 0);
});

test("anichin: movie reads mirrors from the film page", async () => {
  const routes = [
    at("https://api.themoviedb.org/3/movie/55?language=en-US&api_key=" + V3, { title: "Fake Movie" }),
    at(BASE + "/wp-json/wp/v2/search?search=Fake%20Movie", [{ title: "Fake Movie Subtitle Indonesia", url: BASE + "/fake-movie/" }]),
    at(BASE + "/fake-movie/", mirrorPage([["MP4", "https://cdn.example.net/movie.mp4"]]))
  ];
  const { provider } = load("anichin-care.js", routes, V3);
  const streams = await provider.getStreams("55", "movie", -1, -1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, "https://cdn.example.net/movie.mp4");
});

test("anichin: falls back to the TMDB web page when no API key is available", async () => {
  const routes = anichinRoutes([at("https://www.themoviedb.org/tv/1234?language=en-US", '<meta property="og:title" content="Fake Show (2020)">')]);
  const { provider, calls } = load("anichin-care.js", routes, undefined);
  const streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(streams.length, 1);
  assert.ok(!calls.some((c) => c.url.includes("api.themoviedb.org")), "must not call the TMDB API without a key");
});

test("anichin: TMDB v4 token is sent as a Bearer header, not in the URL", async () => {
  const token = "eyJhbGciOiJIUzI1NiJ9." + "x".repeat(60);
  const routes = anichinRoutes([(u, o) =>
    u === "https://api.themoviedb.org/3/tv/1234?language=en-US" && o.headers.Authorization === "Bearer " + token &&
    { body: JSON.stringify({ name: "Fake Show" }) }
  ]);
  const { provider, calls } = load("anichin-care.js", routes, token);
  const streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(streams.length, 1);
  assert.ok(!calls.some((c) => c.url.includes("api_key=")), "token must not leak into the query string");
});

test("anichin: tries the original title when the English title finds nothing", async () => {
  const routes = [
    at("https://api.themoviedb.org/3/tv/9?language=en-US&api_key=" + V3, { name: "Totally Other Name", original_name: "Fake Show" }),
    at(BASE + "/wp-json/wp/v2/search?search=Totally%20Other%20Name", []),
    at(BASE + "/?s=Totally%20Other%20Name", "<html><body>nothing</body></html>"),
    at(BASE + "/wp-json/wp/v2/search?search=Fake%20Show", [{ title: "Fake Show", url: BASE + "/seri/fake-show/" }]),
    at(BASE + "/seri/fake-show/", seriesPage("fake-show", [3])),
    at(BASE + "/fake-show-episode-3-subtitle-indonesia/", mirrorPage([["S", "https://cdn.example.net/orig.m3u8"]]))
  ];
  const { provider } = load("anichin-care.js", routes, V3);
  const streams = await provider.getStreams("9", "tv", 1, 3);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/orig.m3u8"]);
});

test("anichin: OK.ru metadataUrl indirection and relative links", async () => {
  const metaUrl = "https://ok.ru/dk?cmd=videoPlayerMetadata&mid=111";
  const routes = [
    at("https://api.themoviedb.org/3/tv/7?language=en-US&api_key=" + V3, { name: "Fake Show" }),
    at(BASE + "/wp-json/wp/v2/search?search=Fake%20Show", [{ title: "Fake Show", url: BASE + "/seri/fake-show/" }]),
    // root-relative episode link
    at(BASE + "/seri/fake-show/", '<a class="eplister" href="/fake-show-episode-4/">Episode 4</a>'),
    at(BASE + "/fake-show-episode-4/", mirrorPage([["OK.ru", "https://ok.ru/videoembed/222"]])),
    at("https://ok.ru/videoembed/222", okHtml({ metadataUrl: encodeURIComponent(metaUrl) })),
    at(metaUrl, okMeta)
  ];
  const { provider } = load("anichin-care.js", routes, V3);
  const streams = await provider.getStreams("7", "tv", 1, 4);
  assert.equal(streams.length, 4);
  assert.equal(streams[0].quality, "720p");
});

test("anichin: network failure, 403 and challenge pages return [] without throwing", async () => {
  let { provider } = load("anichin-care.js", [], V3);
  assert.deepEqual(await provider.getStreams("1234", "tv", 1, 2), []);

  ({ provider } = load("anichin-care.js", [
    at("https://api.themoviedb.org/3/tv/1234", { name: "Fake Show" }),
    (u) => u.startsWith(BASE) && { status: 403, body: "denied" }
  ], V3));
  assert.deepEqual(await provider.getStreams("1234", "tv", 1, 2), []);

  ({ provider } = load("anichin-care.js", [
    at("https://api.themoviedb.org/3/tv/1234", { name: "Fake Show" }),
    (u) => u.startsWith(BASE) && { body: "<title>Just a moment...</title>" }
  ], V3));
  assert.deepEqual(await provider.getStreams("1234", "tv", 1, 2), []);

  ({ provider } = load("anichin-care.js", [], V3));
  assert.deepEqual(await provider.getStreams("not-a-number", "tv", 1, 2), []);
});

/* ===================== Bilibili ===================== */
test("bilibili: matches the requested episode only and returns playable URLs", async () => {
  const search = {
    code: 0,
    data: { result: [
      { title: 'Fake Show <em class="keyword">Episode 3</em>', bvid: "BV1aa", aid: 1 },
      { title: "Fake Show Episode 13", bvid: "BV2bb", aid: 2 },
      { title: "Fake Show Episode 4", bvid: "BV3cc", aid: 3 },
      { title: "Something Else Episode 3", bvid: "BV4dd", aid: 4 }
    ] }
  };
  const routes = [
    at("https://api.themoviedb.org/3/tv/1234?language=en-US&api_key=" + V3, { name: "Fake Show", original_name: "假节目" }),
    at("https://api.bilibili.com/x/web-interface/search/type", search),
    at("https://api.bilibili.com/x/web-interface/view?bvid=BV1aa", { code: 0, data: { bvid: "BV1aa", cid: 111, title: "Fake Show Episode 3", duration: 1400 } }),
    at("https://api.bilibili.com/x/player/playurl?bvid=BV1aa&cid=111", {
      code: 0, data: { quality: 64, durl: [{ url: "https://upos.example/a.mp4", backup_url: ["https://upos2.example/a.mp4"] }] }
    })
  ];
  const { provider, calls } = load("bilibili.js", routes, V3);
  const streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.deepEqual(streams.map((s) => s.url), ["https://upos.example/a.mp4", "https://upos2.example/a.mp4"]);
  assert.equal(streams[0].quality, "720p");
  assert.equal(streams[0].headers.Referer, "https://www.bilibili.com/video/BV1aa/");
  assert.ok(!calls.some((c) => /BV2bb|BV3cc|BV4dd/.test(c.url)), "other episodes / titles must not be resolved");
});

test("bilibili: TMDB v4 token, API error codes and missing key", async () => {
  const token = "eyJhbGciOiJIUzI1NiJ9." + "y".repeat(60);
  const routes = [
    (u, o) => u === "https://api.themoviedb.org/3/tv/1?language=en-US" && o.headers.Authorization === "Bearer " + token && { body: JSON.stringify({ name: "Fake Show" }) },
    at("https://api.bilibili.com/x/web-interface/search/type", { code: -412, message: "blocked" })
  ];
  let { provider, calls } = load("bilibili.js", routes, token);
  assert.deepEqual(await provider.getStreams("1", "tv", 1, 1), []);
  assert.ok(calls.some((c) => c.url.includes("api.bilibili.com")), "should have searched Bilibili after getting the title");

  ({ provider, calls } = load("bilibili.js", [], undefined));
  assert.deepEqual(await provider.getStreams("1", "tv", 1, 1), []);
  assert.equal(calls.length, 0);
});

/* ===================== Odysee ===================== */
test("odysee: only verified reusable licenses and the right episode are returned", async () => {
  const lighthouse = [
    { name: "fake-ep3-cc", claimId: "aaa", title: "Fake Show Episode 3" },
    { name: "fake-ep3-nc", claimId: "bbb", title: "Fake Show Episode 3 (NC)" },
    { name: "fake-ep4", claimId: "ccc", title: "Fake Show Episode 4" },
    { name: "other", claimId: "ddd", title: "Totally Different Thing Episode 3" },
    { name: "fake-ep3-nd", claimId: "eee", title: "Fake Show Episode 3 NoDerivs" }
  ];
  const license = { aaa: "Creative Commons Attribution 4.0 International", bbb: "Creative Commons Attribution-NonCommercial 4.0 International", eee: "Creative Commons Attribution-NoDerivatives 4.0 International" };
  const routes = [
    at("https://api.themoviedb.org/3/tv/1234?language=en-US&api_key=" + V3, { name: "Fake Show", original_name: "Fake Show" }),
    at("https://lighthouse.odysee.tv/search", lighthouse),
    (u, o) => {
      if (!u.startsWith("https://api.na-backend.odysee.com/api/v1/proxy")) return null;
      const uri = JSON.parse(o.body).params.uri;
      const id = uri.split(":").pop();
      return { body: JSON.stringify({ result: {
        streaming_url: "https://player.odycdn.com/api/v3/streams/free/x/" + id + "/abc123.mp4",
        claim_name: "x", claim_id: id,
        metadata: { title: "Fake Show Episode 3", license: license[id] || "", video: { height: 1080 } }
      } }) };
    }
  ];
  const { provider, calls } = load("odysee.js", routes, V3);
  const streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, "https://player.odycdn.com/api/v3/streams/free/x/aaa/abc123.mp4");
  assert.equal(streams[0].quality, "1080p");
  assert.match(streams[0].title, /Attribution 4\.0/);
  const resolved = calls.filter((c) => c.url.includes("/proxy")).map((c) => JSON.parse(c.opts.body).params.uri.split(":").pop()).sort();
  assert.deepEqual(resolved, ["aaa", "bbb", "eee"], "wrong-episode and unrelated claims must not be resolved");
});

test("odysee: missing TMDB key returns [] without network calls", async () => {
  const { provider, calls } = load("odysee.js", [], undefined);
  assert.deepEqual(await provider.getStreams("1", "tv", 1, 1), []);
  assert.equal(calls.length, 0);
});
