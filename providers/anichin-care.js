/*
 * Anichin Care — provider Nuvio untuk anichin.moe
 *
 * Aturan runtime (QuickJS di Nuvio Mobile): gaya ES5 + Promise .then(), tanpa API Node, tanpa `new URL()`,
 * dan TANPA setTimeout/clearTimeout (tidak ada di runtime; batas waktu dijaga lewat budget total).
 * Alur:
 *   TMDB id -> judul -> cari halaman episode -> ambil daftar server (select.mirror, iframe base64)
 *   -> resolve embed (Okru / Dailymotion / Rumble / generik) menjadi URL m3u8/mp4 langsung.
 *
 * Mode debug (DEBUG_STREAMS): bila tidak ada stream, Nuvio menampilkan kartu "Anichin ⚠ debug" berisi
 * diagnosis singkat (key TMDB, status HTTP, server yang ditemukan). Set false setelah berfungsi.
 *
 * Catatan: Nuvio hanya bisa memutar URL media langsung (m3u8/mp4). URL halaman embed
 * (mis. https://ok.ru/videoembed/123) TIDAK bisa diputar, jadi harus di-resolve dulu.
 */
var cheerio = require('cheerio-without-node-native');

/* ───────────── Konfigurasi ───────────── */
var PROVIDER_ID = 'anichin-care';
var PROVIDER_NAME = 'Anichin';
var BASES = ['https://anichin.moe']; // tambahkan domain cadangan di sini bila situs pindah
var DEBUG_STREAMS = true;  // true: bila hasil kosong, tampilkan kartu "debug" berisi diagnosis (set false jika sudah beres)
var TMDB_KEY_MANUAL = '';  // opsional: isi API key TMDB milik Anda bila key bawaan Nuvio kosong/tidak valid
// Nuvio menyuntikkan TMDB_API_KEY ke plugin; TMDB_KEY_MANUAL (jika diisi) diutamakan.
var TMDB_KEY = TMDB_KEY_MANUAL || ((typeof TMDB_API_KEY !== 'undefined' && TMDB_API_KEY) ? String(TMDB_API_KEY) : '');
var PLUGIN_VERSION = '1.1.3'; // muncul di log: pastikan versi inilah yang dimuat Nuvio
var TOTAL_BUDGET = 40000;  // batas total satu panggilan getStreams (ms)
var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/* ───────────── Util umum ───────────── */
function log() {
  try {
    var a = ['[AnichinCare]'];
    for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
    console.log.apply(console, a);
  } catch (e) {}
}

// Jejak diagnosis: tampil di log dan (jika DEBUG_STREAMS) di kartu debug. JANGAN pernah memasukkan API key.
function note(ctx, msg) {
  msg = String(msg);
  if (msg.length > 110) msg = msg.slice(0, 107) + '...';
  if (ctx && ctx.trace && ctx.trace.length < 24) ctx.trace.push(msg);
  log(msg);
}

function noteOnce(ctx, key, msg) {
  if (ctx && ctx.once && !ctx.once[key]) { ctx.once[key] = 1; note(ctx, msg); }
}

function bump(ctx, key) {
  if (ctx && ctx.stats) ctx.stats[key] = (ctx.stats[key] || 0) + 1;
}

function shortUrl(u) {
  return String(u || '').replace(/^https?:\/\/(?:www\.)?/i, '').replace(/[?#].*$/, '');
}

function unique(arr) {
  var seen = {}, out = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
  }
  return out;
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&');
}

// Base64 manual (jaga-jaga atob tidak tersedia di Hermes)
function b64decode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  str = String(str).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+\/]/g, '');
  var out = '', bits = 0, acc = 0;
  for (var i = 0; i < str.length; i++) {
    acc = ((acc << 6) | chars.indexOf(str.charAt(i))) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hostOf(u) {
  var m = /^(?:https?:)?\/\/(?:www\.)?([^\/?#:]+)/i.exec(String(u || ''));
  return m ? m[1].toLowerCase() : '';
}

function originOf(u) {
  var m = /^((?:https?:)?\/\/[^\/?#]+)/i.exec(String(u || ''));
  return m ? m[1] : '';
}

function absUrl(u, base) {
  u = decodeEntities(String(u || '')).trim();
  if (!u) return '';
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') return originOf(base) + u;
  return '';
}

/* ───────────── Pencocokan judul ───────────── */
var ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:subtitle|sub)\s+indo(?:nesia)?\b/g, ' ')
    .replace(/\bdonghua\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// 0 = tidak ada penanda season di judul
function seasonOf(title) {
  var t = norm(title), m;
  if ((m = /\bseason (\d+)\b/.exec(t)) || (m = /\b(\d+)(?:st|nd|rd|th) season\b/.exec(t))) return parseInt(m[1], 10);
  if ((m = /\b(ii|iii|iv|v|vi|vii|viii)$/.exec(t))) return ROMAN[m[1]];
  if ((m = /\b([2-9])$/.exec(t))) return parseInt(m[1], 10);
  return 0;
}

function baseName(title) {
  return norm(title)
    .replace(/\bseason \d+\b/g, ' ')
    .replace(/\b\d+(?:st|nd|rd|th) season\b/g, ' ')
    .replace(/\b(?:ii|iii|iv|v|vi|vii|viii)$/, ' ')
    .replace(/\b[2-9]$/, ' ')
    .replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  var A = unique(baseName(a).split(' ')), B = unique(baseName(b).split(' '));
  if (!A.length || !B.length) return 0;
  var inB = {}, hit = 0, i;
  for (i = 0; i < B.length; i++) inB[B[i]] = 1;
  for (i = 0; i < A.length; i++) if (inB[A[i]]) hit++;
  return (2 * hit) / (A.length + B.length);
}

function qnum(q) {
  var m = /(\d+)/.exec(String(q || ''));
  return m ? parseInt(m[1], 10) : 0;
}

/* ───────────── Promise & HTTP ───────────── */
function hasItems(r) { return !!(r && r.length); }

// Jalankan task satu per satu sampai ada yang menghasilkan sesuatu
function runSeq(tasks, done) {
  done = done || hasItems;
  var i = 0;
  function next() {
    if (i >= tasks.length) return Promise.resolve(null);
    var t = tasks[i++];
    return new Promise(function (res) { res(t()); }).then(function (r) {
      return done(r) ? r : next();
    }, function () { return next(); });
  }
  return next();
}

function http(ctx, url, o) {
  o = o || {};
  var left = ctx.deadline - Date.now();
  if (left < 1500) return Promise.reject(new Error('budget waktu habis'));
  var headers = {
    'User-Agent': UA,
    'Accept': o.json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
  };
  if (o.referer) headers['Referer'] = o.referer;
  if (o.headers) { for (var k in o.headers) headers[k] = o.headers[k]; }
  var p = fetch(url, { method: 'GET', headers: headers, redirect: 'follow' }).then(function (res) {
    return res.text().then(function (text) {
      return { status: res.status, url: res.url || url, text: text || '' };
    });
  });
  return p; // tanpa setTimeout: andalkan timeout bawaan fetch native + budget total (ctx.deadline)
}

function blocked(r) {
  if (r.status === 403 || r.status === 429 || r.status === 503) return true;
  return r.text.length < 8000 && /just a moment|cf-browser-verification|challenge-platform|attention required/i.test(r.text);
}

// null jika diblokir Cloudflare / error HTTP
function getHtml(ctx, url, referer) {
  return http(ctx, url, { referer: referer }).then(function (r) {
    if (blocked(r)) {
      bump(ctx, 'CF' + r.status);
      noteOnce(ctx, 'cf', 'diblokir ' + r.status + ' (Cloudflare?) ' + shortUrl(url));
      return null;
    }
    bump(ctx, String(r.status));
    if (r.status >= 400) return null;
    return r;
  }).catch(function (e) {
    bump(ctx, 'ERR');
    noteOnce(ctx, 'err', 'fetch error: ' + (e && e.message) + ' @ ' + shortUrl(url));
    return null;
  });
}

function getJson(ctx, url, o) {
  o = o || {};
  o.json = true;
  return http(ctx, url, o).then(function (r) {
    bump(ctx, 'json' + r.status);
    if (r.status >= 400) { noteOnce(ctx, 'jsonhttp' + r.status, 'HTTP ' + r.status + ' ' + shortUrl(url)); return null; }
    try { return JSON.parse(r.text); } catch (e) { noteOnce(ctx, 'jsonparse', 'bukan JSON: ' + shortUrl(url)); return null; }
  }).catch(function (e) {
    noteOnce(ctx, 'jsonerr', 'fetch error: ' + (e && e.message) + ' @ ' + shortUrl(url));
    return null;
  });
}

/* ───────────── TMDB ───────────── */
function tmdbIsToken() { return TMDB_KEY.length > 40 && /^eyJ/.test(TMDB_KEY); } // token baca v4 (JWT)

function keyState() {
  return TMDB_KEY ? (tmdbIsToken() ? 'ada(v4)' : 'ada(' + TMDB_KEY.length + ' huruf)') : 'KOSONG';
}

function tmdb(ctx, path, params) {
  if (!TMDB_KEY) return Promise.resolve(null);
  var qs = [], k, token = tmdbIsToken();
  if (!token) qs.push('api_key=' + encodeURIComponent(TMDB_KEY));
  for (k in (params || {})) qs.push(k + '=' + encodeURIComponent(params[k]));
  return getJson(ctx, 'https://api.themoviedb.org/3' + path + (qs.length ? '?' + qs.join('&') : ''),
    token ? { headers: { 'Authorization': 'Bearer ' + TMDB_KEY } } : {});
}

// Cadangan tanpa API key: baca judul dari halaman web TMDB (og:title)
function tmdbWebTitle(ctx, kind, id) {
  return getHtml(ctx, 'https://www.themoviedb.org/' + kind + '/' + id + '?language=en-US', 'https://www.themoviedb.org/').then(function (r) {
    if (!r) return null;
    var m = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(r.text) ||
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(r.text) ||
            /<title[^>]*>([^<]+)<\/title>/i.exec(r.text);
    if (!m) return null;
    var t = decodeEntities(m[1]).replace(/\s*[\u2014\u2013-]\s*The Movie Database.*$/i, '')
      .replace(/\s*\((?:TV Series\s*)?\d{4}[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim();
    return t && isLatin(t) ? t : null;
  });
}

function parseContentId(id) {
  var s = String(id == null ? '' : id).trim(), m;
  if ((m = /^tmdb:(\d+)/i.exec(s))) return { kind: 'tmdb', id: m[1] };
  if ((m = /(tt\d+)/i.exec(s))) return { kind: 'imdb', id: m[1] };
  if ((m = /^mal:(\d+)/i.exec(s))) return { kind: 'mal', id: m[1] };
  if (/^\d+$/.test(s)) return { kind: 'tmdb', id: s };
  return { kind: 'unknown', id: s };
}

function isLatin(t) {
  return /[A-Za-z]/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(t);
}

function resolveMeta(ctx, parsed) {
  var kind = ctx.type, idP;
  if (parsed.kind === 'tmdb') {
    idP = Promise.resolve(parsed.id);
  } else if (parsed.kind === 'imdb') {
    idP = tmdb(ctx, '/find/' + parsed.id, { external_source: 'imdb_id' }).then(function (j) {
      var arr = j && (kind === 'movie' ? j.movie_results : j.tv_results);
      return arr && arr[0] ? String(arr[0].id) : null;
    });
  } else {
    idP = Promise.resolve(null);
  }
  return idP.then(function (id) {
    if (!id) { note(ctx, 'id konten tidak dikenali: ' + parsed.kind); return null; }
    return Promise.all([
      tmdb(ctx, '/' + kind + '/' + id, { language: 'en-US' }),
      tmdb(ctx, '/' + kind + '/' + id + '/alternative_titles', {})
    ]).then(function (res) {
      var d = res[0], alt = res[1];
      if (d) {
        var list = [d.name || d.title, d.original_name || d.original_title];
        var extra = (alt && (alt.results || alt.titles)) || [];
        var i, titles = [];
        for (i = 0; i < extra.length; i++) list.push(extra[i].title);
        for (i = 0; i < list.length; i++) {
          if (list[i] && isLatin(list[i])) titles.push(String(list[i]).trim());
        }
        note(ctx, 'TMDB api ok');
        return { titles: unique(titles).slice(0, 5), seasons: d.seasons || [] };
      }
      note(ctx, 'TMDB api gagal (key ' + keyState() + '); coba halaman web TMDB');
      return tmdbWebTitle(ctx, kind, id).then(function (t) {
        if (t) note(ctx, 'judul dari halaman web TMDB');
        return t ? { titles: [t], seasons: [] } : null;
      });
    });
  });
}

// Nomor absolut untuk entri situs yang menggabungkan beberapa season
function absoluteEpisode(seasons, season, episode) {
  var total = 0;
  for (var i = 0; i < (seasons || []).length; i++) {
    var s = seasons[i];
    if (s.season_number > 0 && s.season_number < season) total += s.episode_count || 0;
  }
  return total + episode;
}

/* ───────────── Parsing halaman situs (tema AnimeStream) ───────────── */
// Kartu hasil pencarian / daftar: .listupd article.bs
// Catatan: cheerio di Nuvio adalah polyfill ringan (selector dijalankan native, callback .each
// menerima (i, el)). Bila gagal atau kosong, dipakai parser regex sebagai cadangan.
function parseCards(html, pageUrl) {
  var out = [];
  try {
    var $ = cheerio.load(html), seen = {};
    $('article.bs, .listupd .bs').each(function (i, el) {
      var box = $(el);
      var a = box.find('a[href]').first();
      var url = absUrl(a.attr('href'), pageUrl);
      if (!url || seen[url]) return;
      var title = a.attr('title') || box.find('h2').first().text() || box.find('.tt').first().text() || '';
      title = decodeEntities(title).replace(/\s+/g, ' ').trim();
      if (!title) return;
      seen[url] = 1;
      out.push({ url: url, title: title });
    });
  } catch (e) {
    log('cheerio gagal (kartu), pakai regex:', e && e.message);
    out = [];
  }
  return out.length ? out : parseCardsRegex(html, pageUrl);
}

function parseCardsRegex(html, pageUrl) {
  var out = [], seen = {}, m;
  var re = /<article\b[^>]*\bclass\s*=\s*["'][^"']*\bbs\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;
  while ((m = re.exec(html))) {
    var a = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i.exec(m[1]);
    if (!a) continue;
    var url = absUrl(a[1], pageUrl);
    if (!url || seen[url]) continue;
    var t = /\btitle\s*=\s*["']([^"']+)["']/i.exec(a[0]) || /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(m[1]);
    var title = t ? decodeEntities(String(t[1]).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
    if (!title) continue;
    seen[url] = 1;
    out.push({ url: url, title: title });
  }
  return out;
}

function addEpisode(out, seen, href, label, pageUrl) {
  var url = absUrl(href, pageUrl);
  if (!url || seen[url]) return;
  var m = /(\d+(?:\.\d+)?)/.exec(String(label || '')) || /episode-0*(\d+)/i.exec(url);
  seen[url] = 1;
  out.push({ url: url, num: m ? parseFloat(m[1]) : null });
}

// Daftar episode di halaman series: .eplister li a
function parseEpisodes(html, pageUrl) {
  var out = [], seen = {};
  try {
    var $ = cheerio.load(html);
    $('.eplister li a').each(function (i, el) {
      var a = $(el);
      addEpisode(out, seen, a.attr('href'), a.find('.epl-num').first().text(), pageUrl);
    });
    if (!out.length) {
      $('a[href*="episode-"]').each(function (i, el) { addEpisode(out, seen, $(el).attr('href'), '', pageUrl); });
    }
  } catch (e) {
    log('cheerio gagal (episode), pakai regex:', e && e.message);
    out = []; seen = {};
  }
  return out.length ? out : parseEpisodesRegex(html, pageUrl);
}

function parseEpisodesRegex(html, pageUrl) {
  var out = [], seen = {}, m, n;
  var box = /<(?:div|ul)\b[^>]*\bclass\s*=\s*["'][^"']*\beplister\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(html);
  var scope = box ? box[1] : html;
  var re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = re.exec(scope))) {
    if (!box && !/episode-\d+/i.test(m[1])) continue; // tanpa blok eplister: hanya tautan mirip episode
    n = /epl-num[^>]*>([^<]*)</i.exec(m[2]);
    addEpisode(out, seen, m[1], n ? n[1] : '', pageUrl);
  }
  return out;
}

function pickEpisode(list, nums, type) {
  if (!list.length) return null;
  if (type === 'movie') return list[list.length - 1].url; // situs mengurutkan terbaru di atas
  for (var n = 0; n < nums.length; n++) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].num === nums[n]) return list[i].url;
    }
  }
  return null;
}

function episodeMatches(url, nums) {
  var m = /episode-0*(\d+)/i.exec(url || '');
  if (!m) return true; // pola URL berbeda: jangan diblokir
  var n = parseInt(m[1], 10);
  for (var i = 0; i < nums.length; i++) if (nums[i] === n) return true;
  return false;
}

function pageTitle(html) {
  var m = /<h1[^>]*entry-title[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}

function titleOk(ctx, html) {
  if (ctx.type === 'movie') return true;
  var t = pageTitle(html).replace(/\s*(?:episode|eps?)\s*\d+.*$/i, '').replace(/\s+[-\u2013|]\s+.*$/, '');
  if (!norm(t)) return true;
  var best = 0;
  for (var i = 0; i < ctx.titles.length; i++) best = Math.max(best, similarity(t, ctx.titles[i]));
  return best >= 0.5;
}

function rankCandidates(cands, titles, season) {
  var out = [];
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    if (/episode-\d+/i.test(c.url)) continue; // hanya halaman series
    var best = 0;
    for (var j = 0; j < titles.length; j++) best = Math.max(best, similarity(c.title, titles[j]));
    var cs = seasonOf(c.title), score = best;
    if (season > 1) {
      if (cs === season) score += 0.25;
      else if (cs && cs !== season) score -= 0.4;
    } else if (cs > 1) {
      score -= 0.4;
    }
    if (score >= 0.5) out.push({ url: c.url, title: c.title, score: score, season: cs });
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out;
}

/* ───────────── Ekstrak server dari halaman episode ───────────── */
// <select class="mirror"><option value="BASE64(<iframe src=...>)">Okru</option>...
function extractServers(html, pageUrl) {
  var servers = [], seen = {}, pageHost = hostOf(pageUrl);
  var skip = /(^|\.)(googletagmanager|google-analytics|googlesyndication|doubleclick|facebook|histats|disqus|youtube|youtu)\./i;

  function push(url, label) {
    url = absUrl(url, pageUrl);
    var host = hostOf(url);
    if (!url || !host || host === pageHost || seen[url] || skip.test(host)) return false;
    seen[url] = 1;
    servers.push({ url: url, label: String(label || host).replace(/\s+/g, ' ').trim() });
    return true;
  }

  function fromSnippet(snippet, label) {
    var s = String(snippet || '');
    var m = /<iframe[^>]+?src\s*=\s*["']([^"']+)["']/i.exec(s) ||
            /<(?:source|video)[^>]+?src\s*=\s*["']([^"']+)["']/i.exec(s);
    if (m) { push(m[1], label); return; }
    s = s.trim();
    if (/^(?:https?:)?\/\//i.test(s)) push(s, label);
  }

  function fromValue(v, label) {
    v = String(v || '').trim();
    if (!v) return;
    if (/^(?:https?:)?\/\//i.test(v)) { push(v, label); return; }
    if (v.charAt(0) === '<') { fromSnippet(v, label); return; }
    var dec = '';
    try { dec = b64decode(v); } catch (e) {}
    fromSnippet(dec, label);
  }

  // 1) dropdown server
  var selRe = /<select\b[^>]*(?:class|name)\s*=\s*["'][^"']*mirror[^"']*["'][^>]*>([\s\S]*?)<\/select>/gi, sm;
  while ((sm = selRe.exec(html))) {
    var optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi, om;
    while ((om = optRe.exec(sm[1]))) {
      var vm = /\bvalue\s*=\s*["']([^"']*)["']/i.exec(om[1]);
      fromValue(vm ? vm[1] : '', decodeEntities(om[2].replace(/<[^>]+>/g, ' ')));
    }
  }

  // 2) atribut data-* (tema lain)
  if (!servers.length) {
    var dRe = /\bdata-(?:embed|video|iframe)\s*=\s*["']([^"']+)["']/gi, dm;
    while ((dm = dRe.exec(html))) fromValue(dm[1], '');
  }

  // 3) iframe default (hanya bila tidak ada server lain, supaya iklan tidak ikut)
  if (!servers.length) {
    // batas dihitung dari server yang DITERIMA (iframe iklan yang dilewati tidak ikut dihitung)
    var iRe = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi, im, n = 0, scanned = 0;
    while ((im = iRe.exec(html
