/*
 * Bilibili: streams that were found but would not play. URLs are upgraded to HTTPS, unusable CDN mirrors are dropped,
 * short clips are skipped, and every URL is probed with the player's headers before it is offered.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3 } = require("./helpers");

const BV = "BV1aa";
const tmdb = at("https://api.themoviedb.org/3/tv/1234?language=en-US&api_key=" + V3, { name: "Fake Show", original_name: "假节目" });
const search = (code, extra) => at("https://api.bilibili.com/x/web-interface/search/type",
  code ? { code: code, message: "request was banned" } : { code: 0, data: { result: [{ title: "Fake Show Episode 3", bvid: BV, aid: 1 }] } });
const view = (duration) => at("https://api.bilibili.com/x/web-interface/view?bvid=" + BV, { code: 0, data: { bvid: BV, cid: 111, title: "Fake Show Episode 3", duration: duration } });
const play = (durl) => at("https://api.bilibili.com/x/player/playurl?bvid=" + BV + "&cid=111", { code: 0, data: { quality: 64, durl: durl } });
const cdn = (status) => (u) => /bilivideo\.(?:com|cn)|akamaized\.net|\d+\.\d+\.\d+\.\d+/.test(u) && { status: status, body: "" };
const on = { diagnostics: true };

test("bilibili: http links are upgraded, mcdn and bare-IP mirrors dropped, html5 platform requested, URLs probed with the player's headers", async () => {
  const durl = [{
    url: "http://upos-sz-mirrorcos.bilivideo.com/a/b.mp4?e=1&os=cosbv",
    backup_url: ["http://xy1.mcdn.bilivideo.cn:4483/c.mp4", "http://60.1.2.3:8080/d.mp4", "https://upos-hz-mirrorakam.akamaized.net/e.mp4?x=1"]
  }];
  const { provider, calls } = load("bilibili.js", [tmdb, search(0), view(1400), play(durl), cdn(206)], V3);
  const streams = await provider.getStreams("1234", "tv", 1, 3);
  assert.deepEqual(streams.map((s) => s.url), ["https://upos-sz-mirrorcos.bilivideo.com/a/b.mp4?e=1&os=cosbv", "https://upos-hz-mirrorakam.akamaized.net/e.mp4?x=1"]);
  assert.ok(streams.every((s) => /^https:/.test(s.url)), "no cleartext HTTP may reach the player");
  assert.equal(streams[0].quality, "720p");
  assert.equal(streams[0].headers.Referer, "https://www.bilibili.com/video/" + BV + "/");

  const playCall = calls.find((c) => c.url.includes("/x/player/playurl"));
  assert.match(playCall.url, /platform=html5/);
  assert.ok(!calls.some((c) => /mcdn|60\.1\.2\.3/.test(c.url)), "unusable mirrors must not even be probed");
  const probes = calls.filter((c) => /bilivideo\.com\/a\/b\.mp4/.test(c.url));
  assert.equal(probes.length, 1);
  assert.equal(probes[0].opts.headers.Range, "bytes=0-1");
  assert.equal(probes[0].opts.headers.Referer, "https://www.bilibili.com/video/" + BV + "/");
});

test("bilibili: a URL the CDN refuses is not offered, and the card says why", async () => {
  const durl = [{ url: "https://upos-sz-mirrorcos.bilivideo.com/a.mp4" }];
  let { provider } = load("bilibili.js", [tmdb, search(0), view(1400), play(durl), cdn(403)], V3, on);
  let out = await provider.getStreams("1234", "tv", 1, 3);
  assert.equal(out.length, 1);
  assert.match(out[0].name, /^⚠/);
  assert.match(out[0].title, /Bilibili menolak pemutaran \(HTTP 403\) untuk 'Fake Show Episode 3'/);
  assert.equal(out[0].quality, "Info");
  // with the card switched off the result is simply empty
  ({ provider } = load("bilibili.js", [tmdb, search(0), view(1400), play(durl), cdn(403)], V3));
  assert.deepEqual(await provider.getStreams("1234", "tv", 1, 3), []);
});

test("bilibili: clips and trailers shorter than eight minutes are skipped", async () => {
  const durl = [{ url: "https://upos-sz-mirrorcos.bilivideo.com/a.mp4" }];
  const { provider, calls } = load("bilibili.js", [tmdb, search(0), view(150), play(durl), cdn(206)], V3, on);
  const out = await provider.getStreams("1234", "tv", 1, 3);
  assert.match(out[0].title, /hanya klip pendek \(kurang dari 8 menit\) yang cocok dengan 'Fake Show'/);
  assert.ok(!calls.some((c) => c.url.includes("/x/player/playurl")), "a clip is not even asked for a play URL");
});

test("bilibili: only unusable CDN links, a blocked search and a missing key are each explained", async () => {
  let { provider } = load("bilibili.js", [tmdb, search(0), view(1400), play([{ url: "http://xy1.mcdn.bilivideo.cn:4483/c.mp4" }])], V3, on);
  assert.match((await provider.getStreams("1234", "tv", 1, 3))[0].title, /tidak memberi URL video yang bisa diputar.*hanya CDN yang tidak didukung/);

  ({ provider } = load("bilibili.js", [tmdb, search(-412)], V3, on));
  assert.match((await provider.getStreams("1234", "tv", 1, 3))[0].title, /api\.bilibili\.com menolak permintaan \(code -412: request was banned\)/);

  ({ provider } = load("bilibili.js", [], undefined, on));
  assert.match((await provider.getStreams("1234", "tv", 1, 3))[0].title, /judul TMDB tidak bisa dibaca \(periksa TMDB_API_KEY/);
});
