/*
 * Scenarios taken from real usage reports (Renegade Immortal, Beyond Time's Gaze).
 * The WordPress search is imitated faithfully: every term must be a substring of the post title.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3, mirrorPage, dmMeta, epItem, epList } = require("./helpers");

const AX = "https://animexin.dev";
const DK = "https://donghuaking.in";
const TMDB = (kind, id) => "https://api.themoviedb.org/3/" + kind + "/" + id + "?language=en-US&append_to_response=alternative_titles&api_key=" + V3;

// WordPress REST search: terms are ANDed and matched as substrings, so "Time's" never matches "Time’s" (curly).
const wpAnd = (base, posts) => (u) => {
  const prefix = base + "/wp-json/wp/v2/search?search=";
  if (!u.startsWith(prefix)) return null;
  const terms = decodeURIComponent(u.slice(prefix.length).split("&")[0]).toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  return { body: JSON.stringify(posts.filter((p) => terms.every((t) => p.title.toLowerCase().includes(t)))) };
};

/* ---- Beyond Time's Gaze on Animexin: curly apostrophe + continuous numbering ---- */
// On the real site episode 6 lives at ".../beyond-times-gaze-episode-5-indonesia-english-sub-2/".
const btgSlug = (n) => n === 6 ? "beyond-times-gaze-episode-5-indonesia-english-sub-2" : "beyond-times-gaze-episode-" + n + "-indonesia-english-sub";
const btgPost = (n) => ({ title: "Beyond Time’s Gaze Episode " + n + " Indonesia, English Sub", url: AX + "/" + btgSlug(n) + "/" });
const btgSidebar = epList(Array.from({ length: 47 }, (_, i) => epItem(AX, "Beyond Time’s Gaze", 47 - i, btgSlug(47 - i))));
function btgRoutes(tmdbBody) {
  return [
    at(TMDB("tv", 281233), tmdbBody),
    wpAnd(AX, [btgPost(47), btgPost(46), btgPost(45), btgPost(44)]),
    // Episode 47 is the search hit, so it also carries the sidebar list; every other episode is a bare mirror page.
    (u) => {
      const m = /beyond-times-gaze-episode-(\d+)-indonesia-english-sub(-2)?\/$/.exec(u);
      if (!m) return null;
      const n = m[2] ? Number(m[1]) + 1 : Number(m[1]); // the "-2" page is really the next episode
      return { body: (n === 47 ? btgSidebar : "") + mirrorPage([["Hardsub Indonesia Server AX", "https://cdn.example.net/btg-" + n + ".m3u8"]]) };
    }
  ];
}
const btgMeta = { name: "Beyond Time's Gaze", original_name: "光阴之外", seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 26 }, { season_number: 2, episode_count: 52 }] };

test("animexin: 'Beyond Time's Gaze' is found although the site writes 'Time’s' with a curly apostrophe", async () => {
  const { provider, calls } = load("animexin.js", btgRoutes(btgMeta), V3);
  const streams = await provider.getStreams("281233", "tv", 1, 5);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/btg-5.m3u8"]);
  assert.ok(calls.some((c) => c.url.includes("search=Beyond%20Time%20Gaze&")), "search must not contain the ASCII apostrophe");
  // Four search hits belong to one series: only one of them is downloaded as a candidate.
  assert.equal(calls.filter((c) => /beyond-times-gaze-episode-4[4-7]-/.test(c.url)).length, 1);
});

test("animexin: an episode whose URL slug names another number is found by its label (episode 6 lives at ...episode-5-...-2)", async () => {
  const { provider } = load("animexin.js", btgRoutes(btgMeta), V3);
  assert.deepEqual((await provider.getStreams("281233", "tv", 1, 6)).map((s) => s.url), ["https://cdn.example.net/btg-6.m3u8"]);
  assert.deepEqual((await provider.getStreams("281233", "tv", 1, 5)).map((s) => s.url), ["https://cdn.example.net/btg-5.m3u8"]);
});

test("animexin: season 2 maps to the site's continuous numbering (S2E3 after 26 episodes = episode 29)", async () => {
  const { provider } = load("animexin.js", btgRoutes(btgMeta), V3);
  assert.deepEqual((await provider.getStreams("281233", "tv", 2, 3)).map((s) => s.url), ["https://cdn.example.net/btg-29.m3u8"]);
  assert.deepEqual((await provider.getStreams("281233", "tv", 1, 3)).map((s) => s.url), ["https://cdn.example.net/btg-3.m3u8"]);
});

test("animexin: an episode the site has not published yet is NOT answered with a season 1 episode", async () => {
  const { provider } = load("animexin.js", btgRoutes(btgMeta), V3);
  // Positive control first, so an empty result cannot pass for the wrong reason: S2E21 = episode 47 exists.
  assert.deepEqual((await provider.getStreams("281233", "tv", 2, 21)).map((s) => s.url), ["https://cdn.example.net/btg-47.m3u8"]);
  // S2E22 = episode 48, but the site stops at 47. Returning S1E22 would be the wrong episode.
  assert.deepEqual(await provider.getStreams("281233", "tv", 2, 22), []);
});

test("animexin: a page numbered per season (never past the previous seasons' total) keeps the in-season number", async () => {
  const routes = [
    at(TMDB("tv", 61), { name: "Fake Show", seasons: [{ season_number: 1, episode_count: 12 }, { season_number: 2, episode_count: 12 }] }),
    wpAnd(AX, [{ title: "Fake Show", url: AX + "/fake-show/" }]),
    at(AX + "/fake-show/", epList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => epItem(AX, "Fake Show", n, "fake-show-episode-" + n)))),
    at(AX + "/fake-show-episode-3/", mirrorPage([["Server", "https://cdn.example.net/fs3.m3u8"]]))
  ];
  const { provider } = load("animexin.js", routes, V3);
  assert.deepEqual((await provider.getStreams("61", "tv", 2, 3)).map((s) => s.url), ["https://cdn.example.net/fs3.m3u8"]);
});

test("animexin: TMDB alias titles are searched when the main title finds nothing", async () => {
  const routes = [
    at(TMDB("tv", 7), {
      name: "Beyond Time's Gaze", original_name: "光阴之外",
      alternative_titles: { results: [{ iso_3166_1: "CN", title: "Guang Yin Zhi Wai" }, { iso_3166_1: "CN", title: "光阴之外" }] }
    }),
    wpAnd(AX, [{ title: "Guang Yin Zhi Wai", url: AX + "/guang-yin-zhi-wai/" }]),
    at(AX + "/guang-yin-zhi-wai/", epList([epItem(AX, "Guang Yin Zhi Wai", 1, "guang-yin-zhi-wai-episode-1-indonesia-english-sub")])),
    at(AX + "/guang-yin-zhi-wai-episode-1-indonesia-english-sub/", mirrorPage([["Server", "https://cdn.example.net/gy1.m3u8"]]))
  ];
  const { provider, calls } = load("animexin.js", routes, V3);
  assert.deepEqual((await provider.getStreams("7", "tv", 1, 1)).map((s) => s.url), ["https://cdn.example.net/gy1.m3u8"]);
  assert.ok(calls.every((c) => !/%E5%85%89/.test(c.url)), "non-Latin aliases must not be used as search terms");
});

test("animexin: a long TMDB title falls back to its first words, and the series page beats episode posts", async () => {
  const posts = [
    { title: "Soul Land 2 Episode 7 Indonesia, English Sub", url: AX + "/soul-land-2-episode-7-indonesia-english-sub/" },
    { title: "Soul Land 2", url: AX + "/soul-land-2/" },
    { title: "Soul Land 2 Episode 3 Indonesia, English Sub", url: AX + "/soul-land-2-episode-3-indonesia-english-sub/" }
  ];
  const routes = [
    at(TMDB("tv", 9), { name: "Soul Land 2: The Peerless Tang Clan" }),
    wpAnd(AX, posts),
    at(AX + "/soul-land-2/", epList([epItem(AX, "Soul Land 2", 3, "soul-land-2-episode-3-indonesia-english-sub")])),
    at(AX + "/soul-land-2-episode-3-indonesia-english-sub/", mirrorPage([["Server", "https://cdn.example.net/sl3.m3u8"]]))
  ];
  const { provider, calls } = load("animexin.js", routes, V3);
  assert.deepEqual((await provider.getStreams("9", "tv", 1, 3)).map((s) => s.url), ["https://cdn.example.net/sl3.m3u8"]);
  assert.ok(!calls.some((c) => /episode-7-/.test(c.url)), "the episode post must not be downloaded when the series page exists");
});

/* ---- DonghuaKing: default Dailymotion player outside the dropdown, own player pages ---- */
function dkRoutes(extra) {
  const ep = "renegade-immortal-episode-100-sub-indo-english-sub";
  const page = '<iframe src="https://geo.dailymotion.com/player/xkyen.html?video=k1I1DS42J4OekjEwTdK"></iframe>' + mirrorPage([
    ["DonghuaKing Multi Sub Player", DK + "/player/multi/abc"],
    ["DonghuaKing Indonesia [1080p]", "https://player.unknown-host.example/e/xyz"]
  ]);
  return [
    at(TMDB("tv", 62940), { name: "Renegade Immortal" }),
    wpAnd(DK, [{ title: "Renegade Immortal", url: DK + "/anime/renegade-immortal/" }]),
    at(DK + "/anime/renegade-immortal/", epList([epItem(DK, "Renegade Immortal", 100, ep, " Sub Indo & English Sub")])),
    at(DK + "/" + ep + "/", page),
    at(DK + "/player/multi/abc", '<html><script>var cfg = {file:"https://cdn.example.net/dk-multi.m3u8"};</script></html>')
  ].concat(extra);
}

test("donghuaking: reads the default Dailymotion player and the site's own player page", async () => {
  const routes = dkRoutes([at("https://www.dailymotion.com/player/metadata/video/k1I1DS42J4OekjEwTdK", dmMeta("kdk"))]);
  const { provider, calls } = load("donghuaking.js", routes, V3);
  const streams = await provider.getStreams("62940", "tv", 1, 100);
  const byUrl = (u) => streams.find((s) => s.url === u);
  assert.equal(byUrl("https://cdn.example.net/dk-multi.m3u8").title, "DonghuaKing Multi Sub Player • donghuaking.in");
  assert.ok(byUrl("https://www.dailymotion.com/cdn/manifest/video/kdk.m3u8?auth=1"), "default Dailymotion player");
  assert.equal(byUrl("https://cdn.dmcdn.net/kdk/720.mp4?x=1").title, "Dailymotion • 720p");
  assert.equal(streams.length, 3);
  assert.ok(!calls.some((c) => /unknown-host/.test(c.url)), "unknown hosts must not be contacted");
});

test("dailymotion: a private id that errors on the plain request is retried with the web player's request shape", async () => {
  const id = "k1I1DS42J4OekjEwTdK";
  const routes = dkRoutes([(u) => u.startsWith("https://www.dailymotion.com/player/metadata/video/" + id) &&
    { body: JSON.stringify(u.includes("?") ? dmMeta("kfb") : { error: { title: "Content restricted" } }) }]);
  const { provider, calls } = load("donghuaking.js", routes, V3);
  const streams = await provider.getStreams("62940", "tv", 1, 100);
  assert.ok(streams.some((s) => s.url === "https://cdn.dmcdn.net/kfb/720.mp4?x=1"));
  // The embedder is Dailymotion's own watch page, never a third-party site.
  assert.ok(calls.some((c) => c.url.includes("embedder=" + encodeURIComponent("https://www.dailymotion.com/video/" + id))));
  assert.ok(!calls.some((c) => /embedder=[^&]*donghuaking/i.test(c.url)));
});
