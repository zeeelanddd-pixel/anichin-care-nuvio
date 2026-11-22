/*
 * File sizes. Progressive files get one from the server's own answer (HEAD, nothing downloaded) or from data the site
 * already gives (Rumble meta.size, Bilibili durl.size / Content-Range). HLS has no single file and gets none.
 * Nuvio prints `size` after the quality itself ("480p • 165.2 MB"), so it must NOT also be put into `quality`
 * (that showed "480p • 165.2 MB • 165.2 MB" on a phone).
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3, mirrorPage, okPage, epItem, epList, wpAnd } = require("./helpers");

const DS = "https://donghuastream.org";
const tmdb = at("https://api.themoviedb.org/3/tv/7?language=en-US&append_to_response=alternative_titles&api_key=" + V3, { name: "Fake Show" });
const rumbleWithSizes = { ua: { mp4: {
  "720": { url: "https://sp.rmbl.ws/s8/2/sz/720.mp4", meta: { h: 720, w: 1280, size: 83557678 } },
  "360": { url: "https://sp.rmbl.ws/s8/2/sz/360.mp4", meta: { h: 360, w: 640 } }
} } };
const head = (re, length) => (u, o) => o.method === "HEAD" && re.test(u) && { status: 200, headers: { "content-length": String(length) } };

function siteRoutes(extra) {
  return [
    tmdb,
    wpAnd(DS, [{ title: "Fake Show", url: DS + "/anime/fake-show/" }]),
    at(DS + "/anime/fake-show/", epList([epItem(DS, "Fake Show", 1, "fake-show-episode-1")])),
    at(DS + "/fake-show-episode-1/", mirrorPage([["OK.ru", "https://ok.ru/videoembed/1"], ["Rumble", "https://rumble.com/embed/v5size/"], ["Direct", "https://cdn.example.net/live.m3u8"]])),
    at("https://ok.ru/videoembed/1", okPage("sz")),
    at("https://rumble.com/embedJS/u3/?request=video&ver=2&v=v5size", rumbleWithSizes)
  ].concat(extra);
}

test("sizes: HEAD for progressive files, Rumble's own meta.size, nothing for HLS or unanswered HEADs", async () => {
  const routes = siteRoutes([
    head(/type=3&sig=sz/, 257200000),          // OK.ru hd  -> 245.3 MB
    head(/type=2&sig=sz/, 100000000),          // OK.ru sd  -> 95.4 MB
    head(/sp\.rmbl\.ws\/.*\/360\.mp4/, 1500000000) // Rumble 360 (no meta size) -> 1.40 GB; type=0 (144p) has no answer
  ]);
  const { provider, calls } = load("donghuastream.js", routes, V3);
  const streams = await provider.getStreams("7", "tv", 1, 1);
  const by = (re) => streams.find((s) => re.test(s.url));

  assert.equal(by(/type=3&sig=sz/).quality, "720p");
  assert.equal(by(/type=3&sig=sz/).size, "245.3 MB");
  assert.match(by(/type=3&sig=sz/).title, /• 245\.3 MB$/);
  assert.equal(by(/type=2&sig=sz/).quality, "480p");
  assert.equal(by(/type=2&sig=sz/).size, "95.4 MB");
  assert.equal(by(/360\.mp4/).quality, "360p");
  assert.equal(by(/360\.mp4/).size, "1.40 GB");
  assert.equal(by(/720\.mp4/).size, "79.7 MB", "Rumble reports it in its own data");

  // no answer -> no size, and nothing is invented
  assert.equal(by(/type=0&sig=sz/).quality, "144p");
  assert.equal(by(/type=0&sig=sz/).size, undefined);
  // HLS has no single file
  assert.equal(by(/okcdn\.ru\/video\.m3u8/).quality, "Auto");
  assert.equal(by(/live\.m3u8/).size, undefined);
  assert.ok(streams.every((s) => !("sizeBytes" in s)), "internal bookkeeping must not leak");
  // Regression from a real phone screenshot: the size must not be repeated inside `quality`.
  assert.ok(streams.every((s) => !/[KMG]B/.test(s.quality)), "quality must stay a plain label: " + streams.map((s) => s.quality).join(" | "));

  // only HEAD, never for HLS, never where the size is already known, with the stream's own headers
  const heads = calls.filter((c) => c.opts.method === "HEAD");
  assert.ok(heads.length >= 3);
  assert.ok(heads.every((c) => !/\.m3u8/.test(c.url) && !/sp\.rmbl\.ws\/.*\/720\.mp4/.test(c.url)));
  assert.ok(heads.every((c) => c.opts.headers.Referer && c.opts.headers["User-Agent"]));
  assert.ok(!calls.some((c) => c.opts.headers && c.opts.headers.Range), "no ranged GET: a server that ignores Range would send the whole file");
});

test("sizes: a failing size lookup never costs a stream", async () => {
  const { provider } = load("donghuastream.js", siteRoutes([(u, o) => o.method === "HEAD" && { status: 403, body: "" }]), V3);
  const streams = await provider.getStreams("7", "tv", 1, 1);
  assert.equal(streams.length, 7); // 4 OK.ru + 2 Rumble + 1 direct HLS
  assert.ok(streams.some((s) => s.quality === "720p"));
  assert.ok(streams.every((s) => !s.size || s.size === "79.7 MB"), "only Rumble's own meta.size remains");
});

const BV = "BV1aa";
function biliRoutes(durl, cdnSpec) {
  return [
    at("https://api.themoviedb.org/3/tv/1234?language=en-US&api_key=" + V3, { name: "Fake Show" }),
    at("https://api.bilibili.com/x/web-interface/search/type", { code: 0, data: { result: [{ title: "Fake Show Episode 3", bvid: BV, aid: 1 }] } }),
    at("https://api.bilibili.com/x/web-interface/view?bvid=" + BV, { code: 0, data: { bvid: BV, cid: 111, title: "Fake Show Episode 3", duration: 1400 } }),
    at("https://api.bilibili.com/x/player/playurl?bvid=" + BV + "&cid=111", { code: 0, data: { quality: 64, durl: durl } }),
    (u) => /bilivideo\.com/.test(u) && cdnSpec
  ];
}

test("sizes: Bilibili uses the size playurl reports, or the total from the probe's Content-Range", async () => {
  let { provider } = load("bilibili.js", biliRoutes([{ url: "https://upos-sz-mirrorcos.bilivideo.com/a.mp4", size: 123456789 }], { status: 206, body: "" }), V3);
  let streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(streams[0].quality, "720p");
  assert.equal(streams[0].size, "117.7 MB");
  assert.match(streams[0].title, /Fake Show Episode 3 • 117\.7 MB$/);

  ({ provider } = load("bilibili.js", biliRoutes([{ url: "https://upos-sz-mirrorcos.bilivideo.com/a.mp4" }], { status: 206, headers: { "content-range": "bytes 0-1/52428800" }, body: "" }), V3));
  streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(streams[0].quality, "720p");
  assert.equal(streams[0].size, "50.0 MB");

  ({ provider } = load("bilibili.js", biliRoutes([{ url: "https://upos-sz-mirrorcos.bilivideo.com/a.mp4" }], { status: 206, body: "" }), V3));
  streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(streams[0].quality, "720p", "no size is shown when nobody reported one");
  assert.equal(streams[0].size, undefined);
});
