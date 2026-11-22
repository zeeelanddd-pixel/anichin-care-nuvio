/*
 * Cases from a real phone screenshot (Shrouding the Heavens episode 80): LuciferDonghua listed four servers
 * ("WITH ADS #1", "ADS FREE", "V1", "V2") whose embed pages "did not contain a video link", and DonghuaStream reported
 * a movie page instead of the series. Here those pages are wrappers, relative links and unreadable scripts.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3, mirrorPage, dmMeta, epItem, epList, wpAnd } = require("./helpers");

const LD = "https://luciferdonghua.in";
const DS = "https://donghuastream.org";
const tmdb = at("https://api.themoviedb.org/3/tv/7?language=en-US&append_to_response=alternative_titles&api_key=" + V3, { name: "Fake Show" });
const on = { diagnostics: true };

function luciferRoutes(options, embeds) {
  return [
    tmdb,
    wpAnd(LD, [{ title: "Fake Show (2023)", url: LD + "/anime/fake-show/" }]),
    at(LD + "/anime/fake-show/", epList([epItem(LD, "Fake Show", 80, "fake-show-episode-80-lucifer-donghua", " English Sub")])),
    at(LD + "/fake-show-episode-80-lucifer-donghua/", mirrorPage(options))
  ].concat(embeds);
}

test("embed pages: a wrapper around a known player is followed one level, relative and protocol-relative media links are read", async () => {
  const options = [
    ["WITH ADS #1", LD + "/embed/ads1"],
    ["ADS FREE", LD + "/embed/free"],
    ["V1", LD + "/embed/v1"],
    ["V2", LD + "/embed/v2"]
  ];
  const routes = luciferRoutes(options, [
    // <source src="/media/..."> : a relative path
    at(LD + "/embed/ads1", '<html><video controls><source src="/media/ep80.mp4" type="video/mp4"></video></html>'),
    // a page that only wraps a Dailymotion player
    at(LD + "/embed/free", '<html><body><iframe src="https://geo.dailymotion.com/player/x1.html?video=kNested1" allowfullscreen></iframe></body></html>'),
    // JSON config with a protocol-relative link and \u002F escapes
    at(LD + "/embed/v1", '<script>var cfg = {"file":"\\u002F\\u002Fcdn.example.net\\u002Fep80\\u002Fmaster.m3u8"};</script>'),
    // a wrapper around a host that is not readable: not followed
    at(LD + "/embed/v2", '<html><iframe src="https://player.unknown.example/x"></iframe></html>'),
    at("https://www.dailymotion.com/player/metadata/video/kNested1", dmMeta("nested"))
  ]);
  const { provider, calls } = load("luciferdonghua.js", routes, V3);
  const streams = await provider.getStreams("7", "tv", 1, 80);
  const urls = streams.map((s) => s.url);

  assert.ok(urls.includes("https://luciferdonghua.in/media/ep80.mp4"), "relative /media/ link: " + urls.join(" "));
  assert.ok(urls.includes("https://cdn.example.net/ep80/master.m3u8"), "protocol-relative link with \\u002F escapes");
  assert.ok(urls.includes("https://cdn.dmcdn.net/nested/720.mp4?x=1"), "player inside the wrapper page");
  assert.equal(streams.length, 4); // 1 + 1 + 2 (720p MP4 and HLS from the nested Dailymotion player)

  const nested = streams.find((s) => s.url.includes("cdn.dmcdn.net/nested"));
  assert.equal(nested.name, "Dailymotion", "a nested player keeps its own source name, not the wrapper site");
  assert.ok(nested.title.startsWith("ADS FREE"), "and the site's own label: " + nested.title);
  assert.ok(!calls.some((c) => /player\.unknown\.example/.test(c.url)), "an unreadable host inside a wrapper is not contacted");
});

test("embed pages: an unreadable embed is described on the card (size, iframe host, packed script)", async () => {
  const embed = '<html><iframe src="https://player.unknown.example/x"></iframe><script>eval(function(p,a,c,k,e,d){return p}("x",1,1,"".split("|"),0,{}))</script></html>';
  const { provider } = load("luciferdonghua.js", luciferRoutes([["V2", LD + "/embed/v2"]], [at(LD + "/embed/v2", embed)]), V3, on);
  const card = (await provider.getStreams("7", "tv", 1, 80))[0];
  assert.equal(card.name, "⚠ Video tidak terbaca");
  assert.match(card.quality, /^V2 — luciferdonghua\.in: halaman embed tidak memuat tautan video \(1 KB; iframe player\.unknown\.example, skrip tersandi\)/);
});

test("embed pages: a wrapper whose player gives nothing says so", async () => {
  const routes = luciferRoutes([["ADS FREE", LD + "/embed/free"]], [
    at(LD + "/embed/free", '<iframe src="https://geo.dailymotion.com/player/x1.html?video=kGone"></iframe>'),
    at("https://www.dailymotion.com/player/metadata/video/kGone", { error: { message: "Video removed" } })
  ]);
  const { provider } = load("luciferdonghua.js", routes, V3, on);
  const card = (await provider.getStreams("7", "tv", 1, 80))[0];
  assert.equal(card.name, "⚠ Video tidak terbaca");
  assert.match(card.quality, /ADS FREE — .*Dailymotion: Video removed/);
});

test("candidates: every candidate is reported in rank order, series first (not the movie page that answered first)", async () => {
  const eps = [];
  for (let n = 90; n <= 124; n++) eps.push(epItem(DS, "Fake Show", n, "fake-show-episode-" + n));
  const routes = [
    tmdb,
    wpAnd(DS, [
      { title: "Fake Show Movie", url: DS + "/anime/fake-show-movie/" },
      { title: "Fake Show", url: DS + "/anime/fake-show/" }
    ]),
    at(DS + "/anime/fake-show/", epList(eps)),
    at(DS + "/anime/fake-show-movie/", epList([epItem(DS, "Fake Show Movie", 3, "fake-show-movie-episode-3")]))
  ];
  const { provider } = load("donghuastream.js", routes, V3, on);
  const card = (await provider.getStreams("7", "tv", 1, 80))[0];
  assert.equal(card.name, "⚠ Episode 80 tidak ada");
  assert.equal(card.quality, "'Fake Show' hanya terdaftar 35 episode (90–124); 'Fake Show Movie' 1 episode (3–3)");
});

test("search: the site's own search is used when the REST search lacks the exact series page, and only then", async () => {
  const seriesCard = '<div class="listupd"><article class="bs"><a href="' + DS + '/anime/fake-show/" title="Fake Show"><h2>Fake Show</h2></a></article></div>';
  const common = (restPosts) => [
    tmdb,
    wpAnd(DS, restPosts),
    at(DS + "/?s=Fake%20Show", seriesCard),
    at(DS + "/anime/fake-show/", epList([epItem(DS, "Fake Show", 80, "fake-show-episode-80")])),
    at(DS + "/anime/fake-show-movie/", epList([epItem(DS, "Fake Show Movie", 3, "fake-show-movie-episode-3")])),
    at(DS + "/fake-show-episode-80/", mirrorPage([["Server", "https://cdn.example.net/fs80.m3u8"]]))
  ];
  // REST knows only the movie page -> the series is found through the site's search
  let { provider, calls } = load("donghuastream.js", common([{ title: "Fake Show Movie", url: DS + "/anime/fake-show-movie/" }]), V3);
  assert.deepEqual((await provider.getStreams("7", "tv", 1, 80)).map((s) => s.url), ["https://cdn.example.net/fs80.m3u8"]);
  assert.ok(calls.some((c) => c.url.includes("/?s=Fake%20Show")));

  // REST already has the exact series page -> no second search
  ({ provider, calls } = load("donghuastream.js", common([{ title: "Fake Show", url: DS + "/anime/fake-show/" }]), V3));
  assert.deepEqual((await provider.getStreams("7", "tv", 1, 80)).map((s) => s.url), ["https://cdn.example.net/fs80.m3u8"]);
  assert.ok(!calls.some((c) => c.url.includes("/?s=")), "no need to ask the site's search as well");
});
