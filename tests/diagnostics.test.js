/*
 * When nothing is found, a provider shows ONE "⚠" card saying why, so the cause can be read in Nuvio itself.
 * Nuvio's card shows only `name` (bold line) and `quality` (line below), so the cause must be readable from those two.
 * Also covers the tolerant HTML search and the last-resort scan of unrecognised dropdown players.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const { load, at, V3, mirrorPage, okPage, epItem, epList, wpAnd } = require("./helpers");

const DS = "https://donghuastream.org";
const tmdb = (body) => at("https://api.themoviedb.org/3/tv/7?language=en-US&append_to_response=alternative_titles&api_key=" + V3, body || { name: "Fake Show" });
const on = { diagnostics: true };
const only = (streams) => { assert.equal(streams.length, 1, JSON.stringify(streams)); return streams[0]; };

test("diagnostics: a blocked site is reported as blocked, and nothing is bypassed", async () => {
  const { provider, calls } = load("donghuastream.js", [tmdb(), (u) => u.startsWith(DS) && { status: 403, body: "denied" }], V3, on);
  const card = only(await provider.getStreams("7", "tv", 1, 1));
  // What the phone shows: the two visible lines name the cause. (A card that said only "⚠ DonghuaStream / Info" was the bug.)
  assert.equal(card.name, "⚠ Diblokir situs (HTTP 403)");
  assert.equal(card.quality, "donghuastream.org menolak permintaan Nuvio");
  assert.ok(card.name.length <= 60 && card.quality.length <= 150 && card.quality !== "Info");
  assert.match(card.title, /^Tidak ada stream: situs memblokir permintaan \(HTTP 403\) di donghuastream\.org/);
  assert.equal(card.url, DS + "/");
  // One plain request per search route; no retry loop, no header tricks.
  assert.ok(calls.every((c) => !/cf-|x-forwarded/i.test(JSON.stringify(c.opts.headers || {}))));
});

test("diagnostics: a bot-check page and a dead network are told apart", async () => {
  let { provider } = load("donghuastream.js", [tmdb(), (u) => u.startsWith(DS) && { body: "<title>Just a moment...</title>" }], V3, on);
  let card = only(await provider.getStreams("7", "tv", 1, 1));
  assert.match(card.title, /halaman verifikasi bot di donghuastream\.org/);
  assert.equal(card.name, "⚠ Halaman verifikasi bot");
  assert.match(card.quality, /donghuastream\.org meminta verifikasi/);
  ({ provider } = load("donghuastream.js", [tmdb()], V3, on));
  card = only(await provider.getStreams("7", "tv", 1, 1));
  assert.match(card.title, /tidak bisa terhubung ke donghuastream\.org/);
  assert.equal(card.name, "⚠ Tidak bisa terhubung");
  assert.match(card.quality, /^donghuastream\.org \(/);
});

test("diagnostics: TMDB problems and an unknown title", async () => {
  let { provider } = load("donghuastream.js", [], undefined, on); // no key and no TMDB web page
  assert.match(only(await provider.getStreams("7", "tv", 1, 1)).title, /tidak bisa terhubung ke (api\.)?themoviedb\.org|judul TMDB/);
  ({ provider } = load("donghuastream.js", [tmdb(), at(DS + "/wp-json/wp/v2/search", []), at(DS + "/?s=", "<html></html>")], V3, on));
  const card = only(await provider.getStreams("7", "tv", 1, 1));
  assert.match(card.title, /tidak ada judul yang cocok dengan 'Fake Show' di pencarian donghuastream\.org/);
  assert.equal(card.name, "⚠ Judul tidak ada di situs");
  assert.match(card.quality, /'Fake Show': wp 0, cari 0/);
});

test("diagnostics: when the site answers with other titles, they are shown (a naming mismatch is visible at a glance)", async () => {
  const posts = [{ title: "Completely Different Series", url: DS + "/a/" }, { title: "Another Thing Entirely", url: DS + "/b/" }];
  const { provider } = load("donghuastream.js", [tmdb(), at(DS + "/wp-json/wp/v2/search", posts), at(DS + "/?s=", "<html></html>")], V3, on);
  const card = only(await provider.getStreams("7", "tv", 1, 1));
  assert.equal(card.name, "⚠ Judul tidak ada di situs");
  assert.match(card.quality, /wp 2, cari 0 \[Completely Different Series \| Another Thing Entirely\]/);
});

test("diagnostics: the title exists but the episode does not (shows the listed range)", async () => {
  const eps = [];
  for (let n = 69; n <= 121; n++) eps.push(epItem(DS, "Fake Show", n, "fake-show-episode-" + n));
  const routes = [tmdb(), wpAnd(DS, [{ title: "Fake Show", url: DS + "/anime/fake-show/" }]), at(DS + "/anime/fake-show/", epList(eps))];
  const { provider } = load("donghuastream.js", routes, V3, on);
  const card = only(await provider.getStreams("7", "tv", 1, 130));
  assert.match(card.title, /'Fake Show' ditemukan, tetapi episode 130 tidak ada \(terdaftar 53 episode: 69–121\)/);
  assert.equal(card.name, "⚠ Episode 130 tidak ada");
  assert.equal(card.quality, "'Fake Show' hanya terdaftar 53 episode (69–121)");
});

function episodeRoutes(options, extra) {
  return [
    tmdb(),
    wpAnd(DS, [{ title: "Fake Show", url: DS + "/anime/fake-show/" }]),
    at(DS + "/anime/fake-show/", epList([epItem(DS, "Fake Show", 1, "fake-show-episode-1")])),
    at(DS + "/fake-show-episode-1/", mirrorPage(options))
  ].concat(extra || []);
}

test("diagnostics: only unsupported players are named, and they are never contacted", async () => {
  const routes = episodeRoutes([["Mega", "https://mega.nz/embed/abc"], ["Streamwish", "https://streamwish.to/e/abc"]]);
  const { provider, calls } = load("donghuastream.js", routes, V3, on);
  const card = only(await provider.getStreams("7", "tv", 1, 1));
  assert.match(card.title, /halaman episode tidak memuat server yang didukung \(dilewati: mega\.nz, streamwish\.to\)/);
  assert.equal(card.name, "⚠ Server tidak didukung");
  assert.equal(card.quality, "dilewati: mega.nz, streamwish.to");
  assert.ok(!calls.some((c) => /mega\.nz|streamwish/.test(c.url)));
});

test("diagnostics: a known host whose video was removed explains it", async () => {
  const routes = episodeRoutes([["Ok ru English", "https://ok.ru/videoembed/1"]], [at("https://ok.ru/videoembed/1", "<html>Video not found</html>")]);
  const { provider } = load("donghuastream.js", routes, V3, on);
  const card = only(await provider.getStreams("7", "tv", 1, 1));
  assert.match(card.title, /server ditemukan \(Ok ru English\) tetapi tidak ada tautan video yang terbaca/);
  assert.match(card.title, /OK\.ru: video dihapus atau halaman berubah/);
  assert.equal(card.name, "⚠ Video tidak terbaca");
  assert.equal(card.quality, "Ok ru English — OK.ru: video dihapus atau halaman berubah");
});

test("unrecognised dropdown player: scanned only when nothing else works, and only for plain-text media links", async () => {
  const player = '<html><script>var cfg = {file:"https://cdn.example.net/allsub.m3u8"};</script></html>';
  // 1) it is the only option: the last-resort scan finds the stream
  let routes = episodeRoutes([["All Sub Player", "https://player.allsub.example/e/1"], ["Mega", "https://mega.nz/embed/x"]],
    [at("https://player.allsub.example/e/1", player)]);
  let { provider, calls } = load("donghuastream.js", routes, V3, on);
  const stream = only(await provider.getStreams("7", "tv", 1, 1));
  assert.equal(stream.url, "https://cdn.example.net/allsub.m3u8");
  assert.equal(stream.title, "All Sub Player • player.allsub.example");
  assert.ok(!calls.some((c) => /mega\.nz/.test(c.url)));
  // 2) a known host already works: the unrecognised player is not even requested
  routes = episodeRoutes([["Ok ru English", "https://ok.ru/videoembed/1"], ["All Sub Player", "https://player.allsub.example/e/1"]],
    [at("https://ok.ru/videoembed/1", okPage("x")), at("https://player.allsub.example/e/1", player)]);
  ({ provider, calls } = load("donghuastream.js", routes, V3, on));
  assert.equal((await provider.getStreams("7", "tv", 1, 1)).length, 4);
  assert.ok(!calls.some((c) => /allsub\.example/.test(c.url)));
});

test("search: a card layout without <article> tags is still read (wp-json unavailable)", async () => {
  const card = '<div class="listupd"><div class="bs"><div class="bsx"><a href="' + DS + '/anime/fake-show/" title="Fake Show"><img src="x.jpg"></a></div></div>' +
    '<a href="' + DS + '/genres/action/" title="Action">Action</a><a href="https://other.example/x" title="Fake Show elsewhere">x</a></div>';
  const routes = [
    tmdb(),
    (u) => u.startsWith(DS + "/wp-json/") && { status: 404, body: "{}" },
    at(DS + "/?s=Fake%20Show", card),
    at(DS + "/anime/fake-show/", epList([epItem(DS, "Fake Show", 1, "fake-show-episode-1")])),
    at(DS + "/fake-show-episode-1/", mirrorPage([["Server", "https://cdn.example.net/a.m3u8"]]))
  ];
  const { provider, calls } = load("donghuastream.js", routes, V3);
  assert.deepEqual((await provider.getStreams("7", "tv", 1, 1)).map((s) => s.url), ["https://cdn.example.net/a.m3u8"]);
  assert.ok(!calls.some((c) => /other\.example/.test(c.url)), "links to other sites are not candidates");
});

test("diagnostics are off in tests unless asked for, and a working lookup never shows a card", async () => {
  const routes = episodeRoutes([["Server", "https://cdn.example.net/a.m3u8"]]);
  const { provider } = load("donghuastream.js", routes, V3, on);
  const streams = await provider.getStreams("7", "tv", 1, 1);
  assert.deepEqual(streams.map((s) => s.url), ["https://cdn.example.net/a.m3u8"]);
  assert.ok(streams.every((s) => !/^⚠/.test(s.name)));
});
