/*
 * Dailymotion provider: search through the public Data API, strict matching (Dailymotion is full of unrelated uploads),
 * playback through the player-metadata endpoint, and file sizes. The network is mocked.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3, dmMeta } = require("./helpers");

const API = "https://api.dailymotion.com";
const MD = "https://www.dailymotion.com/player/metadata/video/";
const tmdb = (id, body, kind) => at("https://api.themoviedb.org/3/" + (kind || "tv") + "/" + id + "?language=en-US&append_to_response=alternative_titles&api_key=" + V3, body);
const search = (list) => (u) => u.startsWith(API + "/videos?") && { body: JSON.stringify({ page: 1, limit: 20, has_more: false, list: list }) };
const vid = (id, title, duration, owner) => ({ id: id, title: title, duration: duration, "owner.screenname": owner || "Someone" });
const meta = (id, tag) => at(MD + id, dmMeta(tag));
const on = { diagnostics: true };

test("dailymotion: only real episodes of the right show are played; Indonesian uploads first; documented search parameters; sizes from HEAD", async () => {
  const list = [
    vid("x9eng", "Renegade Immortal EP 166 [English Sub]", 1500, "Other Channel"),
    vid("x9indo", "Renegade Immortal Episode 166 Sub Indo", 1320, "Donghua Indo"),
    vid("x9trailer", "Renegade Immortal Episode 166 Trailer", 90),
    vid("x9preview", "Renegade Immortal Episode 166 Preview", 900),
    vid("x9wrongep", "Renegade Immortal Episode 165 Sub Indo", 1300),
    vid("x9wrongshow", "Another Show Episode 166 Sub Indo", 1300),
    vid("x9s2", "Renegade Immortal Season 2 Episode 166", 1300),
    vid("x9movie", "Renegade Immortal Movie Sub Indo", 5400)
  ];
  const routes = [
    tmdb(62940, { name: "Renegade Immortal", original_name: "仙逆" }), search(list), meta("x9indo", "indo"), meta("x9eng", "eng"),
    (u, o) => o.method === "HEAD" && /cdn\.dmcdn\.net\/indo\//.test(u) && { status: 200, headers: { "content-length": "257200000" } }
  ];
  const { provider, calls } = load("dailymotion.js", routes, V3);
  const streams = await provider.getStreams("62940", "tv", 1, 166);

  assert.deepEqual(streams.map((s) => s.title), [
    "Renegade Immortal Episode 166 Sub Indo • Donghua Indo • 720p • 245.3 MB",
    "Renegade Immortal Episode 166 Sub Indo • Donghua Indo",
    "Renegade Immortal EP 166 [English Sub] • Other Channel • 720p",
    "Renegade Immortal EP 166 [English Sub] • Other Channel"
  ]);
  // the size is in the line Nuvio's card shows (quality), and in `size`; HLS and unanswered HEADs get none
  assert.deepEqual(streams.map((s) => s.quality), ["720p • 245.3 MB", "Auto", "720p", "Auto"]);
  assert.equal(streams[0].size, "245.3 MB");
  assert.equal(streams[1].size, undefined);
  assert.equal(streams[0].url, "https://cdn.dmcdn.net/indo/720.mp4?x=1");
  assert.ok(streams.every((s) => s.name === "Dailymotion" && s.headers.Referer === "https://www.dailymotion.com/"));

  // junk was never even asked for a play URL
  const asked = calls.filter((c) => c.url.startsWith(MD)).map((c) => c.url.slice(MD.length));
  assert.deepEqual(asked.sort(), ["x9eng", "x9indo"]);
  // HEAD only, never for HLS
  const heads = calls.filter((c) => c.opts.method === "HEAD").map((c) => c.url);
  assert.deepEqual(heads.sort(), ["https://cdn.dmcdn.net/eng/720.mp4?x=1", "https://cdn.dmcdn.net/indo/720.mp4?x=1"]);

  // the documented Data API parameters
  const q = calls.find((c) => c.url.startsWith(API + "/videos?")).url;
  for (const part of ["search=Renegade%20Immortal%20episode%20166", "longer_than=8", "private=false", "password_protected=false",
    "sort=relevance", "fields=id%2Ctitle%2Cduration%2Cowner.screenname", "flags=no_live"]) assert.ok(q.includes(part), part + " in " + q);
});

test("dailymotion: season 2 uses the continuous number without a season marker, the in-season number with one", async () => {
  const list = [
    vid("x48", "Beyond Time’s Gaze Episode 48 Sub Indo", 1300),
    vid("x22", "Beyond Time’s Gaze Episode 22 Sub Indo", 1300),          // S1's episode 22: must not answer S2E22
    vid("xs2", "Beyond Time’s Gaze Season 2 Episode 22 Sub Indo", 1300),
    vid("xs1", "Beyond Time’s Gaze Season 1 Episode 22 Sub Indo", 1300)  // explicit wrong season
  ];
  const routes = [
    tmdb(281233, { name: "Beyond Time's Gaze", seasons: [{ season_number: 1, episode_count: 26 }, { season_number: 2, episode_count: 52 }] }),
    search(list), meta("x48", "a48"), meta("xs2", "as2")
  ];
  const { provider, calls } = load("dailymotion.js", routes, V3);
  const streams = await provider.getStreams("281233", "tv", 2, 22);
  assert.deepEqual([...new Set(streams.map((s) => s.title.split(" • ")[0]))].sort(),
    ["Beyond Time’s Gaze Episode 48 Sub Indo", "Beyond Time’s Gaze Season 2 Episode 22 Sub Indo"]);
  assert.ok(!calls.some((c) => /\/x22$|\/xs1$/.test(c.url)));
  // the apostrophe is removed from the query (a search engine sees "Time’s" and "Time's" as different words)
  assert.ok(calls.some((c) => c.url.includes("search=Beyond%20Time%20Gaze%20episode%2048")));
  assert.ok(calls.some((c) => c.url.includes("search=Beyond%20Time%20Gaze%20season%202%20episode%2022")));
});

test("dailymotion: a movie request returns the film, not a series episode", async () => {
  const list = [vid("xmov", "Fake Movie 2024 Sub Indo", 5000), vid("xep", "Fake Movie Episode 3 Sub Indo", 1300)];
  const routes = [tmdb(55, { title: "Fake Movie" }, "movie"), search(list), meta("xmov", "mov")];
  const { provider, calls } = load("dailymotion.js", routes, V3);
  const streams = await provider.getStreams("55", "movie", null, null);
  assert.equal(streams.length, 2);
  assert.ok(streams[0].title.startsWith("Fake Movie 2024 Sub Indo"));
  assert.ok(!calls.some((c) => /\/xep/.test(c.url)));
});

test("dailymotion: a private id that errors on the plain request is retried with the web player's request shape", async () => {
  const list = [vid("x9k", "Fake Show Episode 1 Sub Indo", 1300)];
  const routes = [tmdb(7, { name: "Fake Show" }), search(list),
    (u) => u.startsWith(MD + "x9k") && { body: JSON.stringify(u.includes("?") ? dmMeta("kfb") : { error: { message: "Content restricted" } }) }];
  const { provider, calls } = load("dailymotion.js", routes, V3);
  const streams = await provider.getStreams("7", "tv", 1, 1);
  assert.ok(streams.some((s) => s.url === "https://cdn.dmcdn.net/kfb/720.mp4?x=1"));
  assert.ok(calls.some((c) => c.url.includes("embedder=" + encodeURIComponent("https://www.dailymotion.com/video/x9k"))), "embedder is Dailymotion's own watch page");
});

test("dailymotion: every way of finding nothing is explained in the two lines the card shows", async () => {
  // no match: shows what Dailymotion did return
  let { provider } = load("dailymotion.js", [tmdb(7, { name: "Fake Show" }), search([vid("a", "Completely Different Series", 1300), vid("b", "Another Thing", 1300)])], V3, on);
  let card = (await provider.getStreams("7", "tv", 1, 1))[0];
  assert.equal(card.name, "⚠ Video tidak ditemukan");
  assert.equal(card.quality, "2 hasil, tidak ada yang cocok [Completely Different Series | Another Thing]");
  assert.equal(card.url, "https://www.dailymotion.com/");

  // the API refuses
  ({ provider } = load("dailymotion.js", [tmdb(7, { name: "Fake Show" }), (u) => u.startsWith(API) && { body: JSON.stringify({ error: { message: "Rate limit" } }) }], V3, on));
  card = (await provider.getStreams("7", "tv", 1, 1))[0];
  assert.equal(card.name, "⚠ Dailymotion menolak pencarian");
  assert.equal(card.quality, "Rate limit");

  // no connection
  ({ provider } = load("dailymotion.js", [tmdb(7, { name: "Fake Show" })], V3, on));
  card = (await provider.getStreams("7", "tv", 1, 1))[0];
  assert.equal(card.name, "⚠ Tidak bisa terhubung");
  assert.match(card.quality, /^api\.dailymotion\.com/);

  // matched but the player gives nothing
  ({ provider } = load("dailymotion.js", [tmdb(7, { name: "Fake Show" }), search([vid("x9r", "Fake Show Episode 1 Sub Indo", 1300)]),
    (u) => u.startsWith(MD) && { body: JSON.stringify({ error: { message: "Restricted" } }) }], V3, on));
  card = (await provider.getStreams("7", "tv", 1, 1))[0];
  assert.equal(card.name, "⚠ Video tidak terbaca");
  assert.match(card.quality, /'Fake Show Episode 1 Sub Indo' — Dailymotion: Restricted/);

  // no TMDB key
  ({ provider } = load("dailymotion.js", [], undefined, on));
  assert.equal((await provider.getStreams("7", "tv", 1, 1))[0].name, "⚠ Judul TMDB tidak terbaca");
  // and with the card off the result is simply empty
  ({ provider } = load("dailymotion.js", [], undefined));
  assert.deepEqual(await provider.getStreams("7", "tv", 1, 1), []);
});
