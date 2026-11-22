/*
 * Animexin, DonghuaStream and LuciferDonghua run on the same engine as Anichin. These tests use data shaped like the
 * real sites (slug patterns, bracketed titles, typos, language-labelled mirrors) with a mocked network.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3, mirrorPage, okPage, rumbleApi, dmMeta, epItem, epList, wpAnd } = require("./helpers");

const AX = "https://animexin.dev";
// Second theme site for the engine tests below (they used data shaped like a site that no longer exists).
const DK = "https://luciferdonghua.in";

const tmdbTv = (id, body) => at("https://api.themoviedb.org/3/tv/" + id + "?language=en-US&append_to_response=alternative_titles&api_key=" + V3, body);
const tmdbMovie = (id, body) => at("https://api.themoviedb.org/3/movie/" + id + "?language=en-US&append_to_response=alternative_titles&api_key=" + V3, body);
const wp = (base, term, items) => at(base + "/wp-json/wp/v2/search?search=" + encodeURIComponent(term), items);

/* ===================== Animexin ===================== */
test("animexin: right series, an episode whose slug lacks 'episode', and language labels kept", async () => {
  // A sidebar widget linking to ANOTHER series' episode 61 comes first in the document.
  const widget = '<div class="widget"><a href="' + AX + '/the-guardian-of-daxia-episode-61-indonesia-english-sub/"><div class="tt">The Guardian of Daxia Episode 61 Indonesia, English Sub</div></a></div>';
  const list = epList([
    epItem(AX, "Renegade Immortal", 165, "renegade-immortal-episode-165-indonesia-english"),
    epItem(AX, "Renegade Immortal", 62, "renegade-immortal-episode-62-indonesia-english-sub"),
    epItem(AX, "Renegade Immortal", 61, "renegade-61-indonesia-english"), // slug has no "episode"
    epItem(AX, "Renegade Immortal", 60, "renegade-immortal-episode-60-indonesia-english-sub")
  ]);
  const options = [
    ["Hardsub English Dailymotion AX", "https://geo.dailymotion.com/player/xhojl.html?video=k4ou2CRTOaQbODM5Vk6"],
    ["Hardsub Indonesia Dailymotion AX", "https://geo.dailymotion.com/player/xhojl.html?video=x9indoDM"],
    ["Hardsub Indonesia Odysee AX", "https://odysee.com/$/embed/renegade-indo/abc123"],
    ["Hardsub Indonesia Ok.ru AX", "https://ok.ru/videoembed/333"],
    ["Hardsub English Ok.ru AX", "https://ok.ru/videoembed/334"],
    ["Dtube Indo AX", "https://d.tube/#!/v/axindo/abc"],
    ["Hardsub Indonesia Mega AX", "https://mega.nz/embed/abcdef"],
    ["Hardsub Indonesia Rumble AX", "https://rumble.com/embed/v5indo/"],
    ["All Sub Streamwish AX", "https://streamwish.example/e/abc123"],
    ["All Sub Player Dood AX", "https://dood.example/e/abc123"]
  ];
  const routes = [
    tmdbTv(777, { name: "Renegade Immortal", original_name: "仙逆" }),
    wp(AX, "Renegade Immortal", [
      { title: "Renegade Immortal", url: AX + "/renegade-immortal/" },
      { title: "Renegade Immortal Movie: Battle of Immortal Slayer", url: AX + "/renegade-immortal-movie-battle-of-immortal-slayer/" }
    ]),
    at(AX + "/renegade-immortal/", widget + list),
    at(AX + "/renegade-61-indonesia-english/", mirrorPage(options)),
    at("https://ok.ru/videoembed/333", okPage("indo")),
    at("https://ok.ru/videoembed/334", okPage("eng")),
    at("https://rumble.com/embedJS/u3/?request=video&ver=2&v=v5indo", rumbleApi("indo")),
    at("https://www.dailymotion.com/player/metadata/video/k4ou2CRTOaQbODM5Vk6", dmMeta("kEng")),
    at("https://www.dailymotion.com/player/metadata/video/x9indoDM", dmMeta("xIndo")),
    at("https://odysee.com/$/embed/renegade-indo/abc123", "<html>player shell, no media</html>")
  ];
  const { provider, calls } = load("animexin.js", routes, V3);
  const streams = await provider.getStreams("777", "tv", 1, 61);
  const titles = streams.map((s) => s.title);

  // 4 OK.ru x2 languages + 2 Rumble + 2 Dailymotion x2 languages
  assert.equal(streams.length, 14, titles.join("\n"));
  assert.ok(titles.includes("Hardsub Indonesia Ok.ru AX • 720p"));
  assert.ok(titles.includes("Hardsub English Ok.ru AX • 720p"));
  assert.ok(titles.includes("Hardsub Indonesia Rumble AX • 720p"));
  const auto = streams.find((s) => s.title === "Hardsub English Dailymotion AX");
  assert.ok(auto && auto.quality === "Auto" && auto.name === "Dailymotion", "Dailymotion HLS with the language label");

  // Indonesian-subtitle options come before English ones.
  const lastIndo = Math.max(...titles.map((t, i) => (/Indonesia/.test(t) ? i : -1)));
  const firstEnglish = titles.findIndex((t) => /English/.test(t));
  assert.ok(lastIndo < firstEnglish, "Indonesian first:\n" + titles.join("\n"));

  // Mixed-case private Dailymotion ids survive; unsupported hosts are never contacted.
  assert.ok(calls.some((c) => c.url === "https://www.dailymotion.com/player/metadata/video/k4ou2CRTOaQbODM5Vk6"));
  assert.ok(!calls.some((c) => /mega\.nz|streamwish|dood\./.test(c.url)), "Mega / Streamwish / Dood must be skipped");
  // The widget's episode 61 belongs to another series and must not be used.
  assert.ok(!calls.some((c) => /guardian-of-daxia/.test(c.url)));
  assert.ok(streams.every((s) => s.headers["User-Agent"] && s.headers.Referer));
});

test("animexin: 'Gu An [One Slash to the Heavens]' matches the TMDB title 'Gu An'", async () => {
  const routes = [
    tmdbTv(5, { name: "Gu An" }),
    wp(AX, "Gu An", [{ title: "Gu An [One Slash to the Heavens]", url: AX + "/gu-an/" }]),
    at(AX + "/gu-an/", epList([epItem(AX, "Gu An", 17, "gu-an-episode-17-indonesia-english-sub")])),
    at(AX + "/gu-an-episode-17-indonesia-english-sub/", mirrorPage([["Hardsub Indonesia Ok.ru AX", "https://ok.ru/videoembed/9"]])),
    at("https://ok.ru/videoembed/9", okPage("g"))
  ];
  const { provider } = load("animexin.js", routes, V3);
  const streams = await provider.getStreams("5", "tv", 1, 17);
  assert.equal(streams.length, 4);
});

test("animexin: season 10 page wins over season 9, 'Episode 56 [488] END' parses as 56", async () => {
  const season = (n, slugSuffix) => epList([
    epItem(AX, "Tales of Demons and Gods Season " + n, 56, "tales-of-demons-and-gods-season-" + n + "-episode-56" + slugSuffix + "-indonesia-english-sub", " [488] END Indonesia, English Sub"),
    epItem(AX, "Tales of Demons and Gods Season " + n, 55, "tales-of-demons-and-gods-season-" + n + "-episode-55-indonesia-english-sub", " [487]")
  ]);
  const routes = [
    tmdbTv(6, { name: "Tales of Demons and Gods" }),
    wp(AX, "Tales of Demons and Gods", [
      { title: "Tales of Demons and Gods Season 9", url: AX + "/tales-of-demons-and-gods-season-9/" },
      { title: "Tales of Demons and Gods Season 10", url: AX + "/tales-of-demons-and-gods-season-10/" }
    ]),
    at(AX + "/tales-of-demons-and-gods-season-9/", season(9, "-488")),
    at(AX + "/tales-of-demons-and-gods-season-10/", season(10, "-488-end")),
    at(AX + "/tales-of-demons-and-gods-season-9-episode-56-488-indonesia-english-sub/", mirrorPage([["Wrong season", "https://cdn.example.net/s9.m3u8"]])),
    at(AX + "/tales-of-demons-and-gods-season-10-episode-56-488-end-indonesia-english-sub/", mirrorPage([["Right season", "https://cdn.example.net/s10.m3u8"]]))
  ];
  const { provider } = load("animexin.js", routes, V3);
  const streams = await provider.getStreams("6", "tv", 10, 56);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/s10.m3u8"]);
});

test("animexin: a movie page that only lists its watch page is followed one step", async () => {
  const movie = "battle-through-the-heavens-battle-of-the-two-emperors";
  const routes = [
    tmdbMovie(55, { title: "Battle Through the Heavens: Battle of the Two Emperors" }),
    wp(AX, "Battle Through the Heavens: Battle of the Two Emperors", [{ title: "Battle Through the Heavens: Battle of the Two Emperors", url: AX + "/" + movie + "/" }]),
    at(AX + "/" + movie + "/", '<div class="eplister"><ul><li><a href="' + AX + "/" + movie + '-subtitle/"><div class="epl-title">Movie</div></a></li></ul></div>'),
    at(AX + "/" + movie + "-subtitle/", mirrorPage([["Hardsub Indonesia", "https://cdn.example.net/movie.mp4"]]))
  ];
  const { provider } = load("animexin.js", routes, V3);
  const streams = await provider.getStreams("55", "movie", null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, "https://cdn.example.net/movie.mp4");
  assert.equal(streams[0].title, "Hardsub Indonesia • cdn.example.net");
});

/* ===================== Engine behaviours (shown on the LuciferDonghua provider) ===================== */
test("theme engine: typo 'Deamon', bracketed alias and season tier", async () => {
  const slug = "chang-yuan-tu-the-deamon-hunter-season-2";
  const routes = [
    tmdbTv(88, { name: "The Demon Hunter" }),
    wp(DK, "The Demon Hunter", [
      { title: "The Demon Hunter [Chang Yuan Tu] Season 3", url: DK + "/anime/the-demon-hunter-chang-yuan-tu-season-3/" },
      { title: "[Chang Yuan Tu] The Deamon Hunter Season 2", url: DK + "/anime/" + slug + "/" }
    ]),
    at(DK + "/anime/" + slug + "/", epList([
      epItem(DK, "[Azure Legacy] The Deamon Hunter", 66, "azure-legacy-the-deamon-hunter-episode-66-subtitle", " Subtitle")
    ])),
    at(DK + "/anime/the-demon-hunter-chang-yuan-tu-season-3/", epList([
      epItem(DK, "The Demon Hunter Season 3", 66, "the-demon-hunter-season-3-episode-66-subtitle")
    ])),
    at(DK + "/azure-legacy-the-deamon-hunter-episode-66-subtitle/", mirrorPage([["Sub Indo OK.ru", "https://ok.ru/videoembed/66"]])),
    at("https://ok.ru/videoembed/66", okPage("dk"))
  ];
  const { provider, calls } = load("luciferdonghua.js", routes, V3);
  const streams = await provider.getStreams("88", "tv", 2, 66);
  assert.equal(streams.length, 4);
  assert.equal(streams[0].title, "Sub Indo OK.ru • 720p");
  assert.ok(!calls.some((c) => /season-3-episode-66/.test(c.url)), "season 3 must not be used for season 2");
});

test("theme engine: search returns only the episode post; its sidebar list is used", async () => {
  const show = "Against The Gods Season 2";
  const slug = (n, tail) => "against-the-gods-season-2-episode-" + n + tail + "-indonesia-english-sub";
  const sidebar = epList([
    epItem(DK, show, 3, slug(3, "-33")),
    epItem(DK, show, 2, slug(2, "-32")),
    epItem(DK, show, 1, slug(1, "-31"))
  ]);
  const routes = [
    tmdbTv(41, { name: "Against the Gods" }),
    wp(DK, "Against the Gods", [{ title: "Against The Gods Season 2 Episode 3 [33] Indonesia, English Sub", url: DK + "/" + slug(3, "-33") + "/" }]),
    at(DK + "/" + slug(3, "-33") + "/", sidebar + mirrorPage([["Episode three", "https://cdn.example.net/e3.m3u8"]])),
    at(DK + "/" + slug(2, "-32") + "/", mirrorPage([["Episode two", "https://cdn.example.net/e2.m3u8"]]))
  ];
  let { provider, calls } = load("luciferdonghua.js", routes, V3);
  assert.deepEqual((await provider.getStreams("41", "tv", 2, 2)).map((s) => s.url), ["https://cdn.example.net/e2.m3u8"]);

  // Asking for the episode that the search result itself is reuses that page (no second download).
  ({ provider, calls } = load("luciferdonghua.js", routes, V3));
  assert.deepEqual((await provider.getStreams("41", "tv", 2, 3)).map((s) => s.url), ["https://cdn.example.net/e3.m3u8"]);
  assert.equal(calls.filter((c) => c.url === DK + "/" + slug(3, "-33") + "/").length, 1);
});

test("theme engine: a typo in a one-word title still matches ('Apotheosys' vs 'Apotheosis')", async () => {
  const routes = [
    tmdbTv(3, { name: "Apotheosis" }),
    wp(DK, "Apotheosis", [{ title: "Apotheosys", url: DK + "/anime/apotheosys/" }]),
    at(DK + "/anime/apotheosys/", epList([epItem(DK, "Apotheosys", 1, "apotheosys-episode-1-subtitle")])),
    at(DK + "/apotheosys-episode-1-subtitle/", mirrorPage([["Server 1", "https://cdn.example.net/a1.m3u8"]]))
  ];
  const { provider } = load("luciferdonghua.js", routes, V3);
  assert.deepEqual((await provider.getStreams("3", "tv", 1, 1)).map((s) => s.url), ["https://cdn.example.net/a1.m3u8"]);
});

test("theme engine: zero-padded 'Episode 05' is episode 5", async () => {
  const routes = [
    tmdbTv(12, { name: "Lord of Mysteries" }),
    wp(DK, "Lord of Mysteries", [{ title: "Lord of Mysteries", url: DK + "/anime/lord-of-mysteries/" }]),
    at(DK + "/anime/lord-of-mysteries/", epList([
      epItem(DK, "Lord of Mysteries", "05", "lord-of-mysteries-episode-05-subtitle", " Subtitle"),
      epItem(DK, "Lord of Mysteries", "04", "lord-of-mysteries-episode-04-subtitle", " Subtitle")
    ])),
    at(DK + "/lord-of-mysteries-episode-05-subtitle/", mirrorPage([["Server 1", "https://cdn.example.net/lom5.m3u8"]]))
  ];
  const { provider } = load("luciferdonghua.js", routes, V3);
  const streams = await provider.getStreams("12", "tv", 1, 5);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/lom5.m3u8"]);
});

test("theme engine: no results and dead network give [] without throwing", async () => {
  let { provider } = load("luciferdonghua.js", [
    tmdbTv(1, { name: "Nothing Here" }),
    at(DK + "/wp-json/wp/v2/search", []),
    at(DK + "/?s=", "<html></html>")
  ], V3);
  assert.deepEqual(await provider.getStreams("1", "tv", 1, 1), []);
  ({ provider } = load("luciferdonghua.js", [], V3));
  assert.deepEqual(await provider.getStreams("1", "tv", 1, 1), []);
});

/* ===================== DonghuaStream ===================== */
const DS = "https://donghuastream.org";
const dsSlug = (n) => "beyond-times-gaze-episode-" + n + "-multiple-subtitles";
// A row as the real series page renders it: label, "Eps N (Good Sub)(4K)+(Download Link)", date.
const dsItem = (n) =>
  '<li><a href="' + DS + "/" + dsSlug(n) + '/" title="Beyond Time’s Gaze Episode ' + n + ' Multiple Subtitles"><div class="epl-num">' + n +
  '</div><div class="epl-title">Beyond Time’s Gaze Episode ' + n + ' Multiple Subtitles</div><div class="epl-sub">Eps ' + n +
  ' (Good Sub)(4K)+(Download Link)</div><div class="epl-date">November 14, 2026</div></a></li>';
const dsOptions = (n) => [
  ["Dailymotion Multiple Sub ADS", "https://geo.dailymotion.com/player/xdsdm.html?video=kDsPrivateId" + n],
  ["Rumble All Subtitles", "https://rumble.com/embed/v5ds" + n + "/"],
  ["All Sub Player", "https://player.allsub.example/e/" + n],
  ["Ok ru English", "https://ok.ru/videoembed/90" + n]
];
function dsRoutes() {
  return [
    tmdbTv(281233, { name: "Beyond Time's Gaze", seasons: [{ season_number: 1, episode_count: 26 }, { season_number: 2, episode_count: 52 }] }),
    wpAnd(DS, [
      { title: "Beyond Time’s Gaze Episode 48 Multiple Subtitles", url: DS + "/" + dsSlug(48) + "/" },
      { title: "Beyond Time’s Gaze Episode 47 Multiple Subtitles", url: DS + "/" + dsSlug(47) + "/" },
      { title: "Beyond Time’s Gaze", url: DS + "/anime/beyond-times-gaze/" }
    ]),
    at(DS + "/anime/beyond-times-gaze/", epList(Array.from({ length: 48 }, (_, i) => dsItem(48 - i)))),
    // The page's default player is an empty iframe that scripts fill in later.
    (u) => { const m = /\/beyond-times-gaze-episode-(\d+)-multiple-subtitles\/$/.exec(u); return m && { body: '<iframe src="about:blank"></iframe>' + mirrorPage(dsOptions(m[1])) }; },
    (u) => { const m = /player\/metadata\/video\/kDsPrivateId(\d+)$/.exec(u); return m && { body: JSON.stringify(dmMeta("kds" + m[1])) }; },
    (u) => { const m = /embedJS\/u3\/\?request=video&ver=2&v=v5ds(\d+)$/.exec(u); return m && { body: JSON.stringify(rumbleApi("ds" + m[1])) }; },
    (u) => { const m = /ok\.ru\/videoembed\/90(\d+)$/.exec(u); return m && { body: okPage("ds" + m[1]) }; }
  ];
}

test("donghuastream: Beyond Time’s Gaze resolves Dailymotion, Rumble and OK.ru; unknown players and about:blank are ignored", async () => {
  const { provider, calls } = load("donghuastream.js", dsRoutes(), V3);
  const streams = await provider.getStreams("281233", "tv", 1, 5);
  const titles = streams.map((s) => s.title);
  assert.equal(streams.length, 8, titles.join("\n")); // 2 Dailymotion + 2 Rumble + 4 OK.ru
  assert.ok(titles.includes("Dailymotion Multiple Sub ADS"));
  assert.ok(titles.includes("Dailymotion Multiple Sub ADS • 720p"));
  assert.ok(titles.includes("Rumble All Subtitles • 720p"));
  assert.ok(titles.includes("Ok ru English • 720p"));
  assert.ok(streams.some((s) => s.url === "https://www.dailymotion.com/cdn/manifest/video/kds5.m3u8?auth=1"));
  assert.ok(!calls.some((c) => /allsub\.example/.test(c.url)), "an unknown external player must not be contacted");
  assert.ok(!calls.some((c) => /about:blank/.test(c.url)), "about:blank is not a link");
  // The series page is preferred; the episode posts from the search are not downloaded as candidates.
  assert.ok(!calls.some((c) => /episode-4[78]-multiple/.test(c.url)));
});

test("donghuastream: season 2 episode 22 is the site's episode 48, and episode 49 (unpublished) is not faked", async () => {
  const { provider } = load("donghuastream.js", dsRoutes(), V3);
  const streams = await provider.getStreams("281233", "tv", 2, 22);
  assert.ok(streams.some((s) => s.url === "https://www.dailymotion.com/cdn/manifest/video/kds48.m3u8?auth=1"));
  assert.deepEqual(await provider.getStreams("281233", "tv", 2, 23), []);
});

/* ===================== LuciferDonghua ===================== */
const LD = "https://luciferdonghua.in";
// Rows as the real "All Episodes" grid renders them: "4K Ep N Episode N <date>", older ones with "-ep-N" URLs.
const ldRow = (slug, label) => '<li><a href="' + LD + "/" + slug + '/"><div class="epl-title">' + label + "</div></a></li>";
const ldList = '<div class="eplister"><ul>' + [
  ldRow("renegade-immortal-xian-ni-episode-167-lucifer-donghua", "4K Ep 167 Episode 167 Nov 15, 2026"),
  ldRow("renegade-immortal-xian-ni-episode-166-lucifer-donghua", "4K Ep 166 Episode 166 Nov 8, 2026"),
  ldRow("renegade-immortal-xian-ni-episode-84", "4K Ep 84 Episode 84"),
  ldRow("renegade-immortal-xian-ni-ep-77", "4K Ep 77 Battle of Gods [PT-3] Episode 77 Battle of Gods [PT-3]"),
  ldRow("renegade-immortal-xian-ni-ep-09", "4K Ep 09 Episode 09")
].join("") + "</ul></div>";

function ldRoutes() {
  return [
    tmdbTv(62940, { name: "Renegade Immortal", original_name: "仙逆" }),
    wpAnd(LD, [
      { title: "Renegade Immortal [Xian Ni] Episode 166 English Sub", url: LD + "/renegade-immortal-xian-ni-episode-166-lucifer-donghua/" },
      { title: "Renegade Immortal [Xian Ni] (2023)", url: LD + "/anime/renegade-immortal-xian-ni/" }
    ]),
    at(LD + "/anime/renegade-immortal-xian-ni/", ldList),
    at(LD + "/renegade-immortal-xian-ni-episode-166-lucifer-donghua/", mirrorPage([
      ["[4K] Indo + Eng [Dailymotion Little Ads - Server]", "https://geo.dailymotion.com/player/xldm.html?video=kLuciferPrivate1"],
      ["[4K] Eng [RUMBEL- Server]", "https://rumble.com/embed/v5lucifer/"],
      ["[4K] Eng [VID HIDE Server with ads]", "https://vidhide.example/e/abc"],
      ["[4K] Eng [OK.RU- Server]", "https://ok.ru/videoembed/777"]
    ])),
    at("https://www.dailymotion.com/player/metadata/video/kLuciferPrivate1", dmMeta("kl")),
    at("https://rumble.com/embedJS/u3/?request=video&ver=2&v=v5lucifer", rumbleApi("lucifer")),
    at("https://ok.ru/videoembed/777", okPage("luc")),
    // every other episode page: one plain mirror named after its slug
    (u) => { const m = /\/(renegade-immortal-xian-ni-[a-z0-9-]+)\/$/.exec(u); return m && !/episode-166-/.test(u) && !/\/anime\//.test(u) && { body: mirrorPage([["Server", "https://cdn.example.net/" + m[1] + ".m3u8"]]) }; }
  ];
}

test("luciferdonghua: bracketed alias and year in the title, and the real server labels (Indonesian option first, VidHide never contacted)", async () => {
  const { provider, calls } = load("luciferdonghua.js", ldRoutes(), V3);
  const streams = await provider.getStreams("62940", "tv", 1, 166);
  const titles = streams.map((s) => s.title);
  assert.equal(streams.length, 8, titles.join("\n")); // 2 Dailymotion + 2 Rumble + 4 OK.ru
  // Both Dailymotion variants (720p MP4 and the Auto HLS) belong to the "Indo + Eng" option and must come before every English-only one.
  assert.deepEqual(titles.slice(0, 2).sort(), ["[4K] Indo + Eng [Dailymotion Little Ads - Server]", "[4K] Indo + Eng [Dailymotion Little Ads - Server] • 720p"]);
  assert.ok(titles.slice(2).every((t) => !/Indo \+ Eng/.test(t)), "the Indonesian option must come first");
  // The site spells it "RUMBEL", so the real source name is appended; "OK.RU" already contains the source and is not repeated.
  assert.ok(titles.includes("[4K] Eng [RUMBEL- Server] • Rumble • 720p"));
  assert.ok(titles.includes("[4K] Eng [OK.RU- Server] • 720p"));
  assert.ok(!calls.some((c) => /vidhide/.test(c.url)), "VidHide needs scripts this project does not run");
  assert.ok(streams.every((s) => s.headers.Referer && s.headers["User-Agent"]));
});

test("luciferdonghua: 'Ep 167', 'Ep 09' and the old '-ep-77' URL style are all found by their labels", async () => {
  const { provider } = load("luciferdonghua.js", ldRoutes(), V3);
  const url = async (e) => (await provider.getStreams("62940", "tv", 1, e)).map((s) => s.url);
  assert.deepEqual(await url(167), ["https://cdn.example.net/renegade-immortal-xian-ni-episode-167-lucifer-donghua.m3u8"]);
  assert.deepEqual(await url(77), ["https://cdn.example.net/renegade-immortal-xian-ni-ep-77.m3u8"]);
  assert.deepEqual(await url(9), ["https://cdn.example.net/renegade-immortal-xian-ni-ep-09.m3u8"]);
  assert.deepEqual(await url(84), ["https://cdn.example.net/renegade-immortal-xian-ni-episode-84.m3u8"]);
});
