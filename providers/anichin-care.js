/*
 * Anichin Care - provider Nuvio untuk anichin.moe
 *
 * Runtime: QuickJS di Nuvio (React Native). Kode sengaja ditulis ES5-compatible:
 * tanpa async/await, tanpa arrow function, tanpa template literal,
 * tanpa optional chaining (?.), tanpa nullish coalescing (??), tanpa new URL().
 *
 * Alur: tmdbId -> judul (TMDB) -> cari halaman episode di anichin
 *       -> ambil daftar server (select.mirror berisi iframe base64)
 *       -> resolve embed (Okru / Dailymotion / Rumble / generik) -> m3u8/mp4.
 *
 * Nuvio hanya bisa memutar URL media langsung (m3u8/mp4); URL halaman embed
 * (mis. https://ok.ru/videoembed/123) TIDAK bisa diputar, harus di-resolve dulu.
 */

/* ---------------- Konfigurasi ---------------- */
var PROVIDER_ID = 'anichin-care';
var PROVIDER_NAME = 'Anichin';
var BASES = ['https://anichin.moe']; // tambahkan domain cadangan bila situs pindah
// Nuvio umumnya menyuntikkan TMDB_API_KEY. Jika tidak ada, pakai key cadangan.
var TMDB_KEY = (typeof TMDB_API_KEY !== 'undefined' && TMDB_API_KEY) ? TMDB_API_KEY : '1865f43a0549ca50d341dd9ab8b29f49';
var REQ_TIMEOUT = 9000;    // batas per request (ms)
var TOTAL_BUDGET = 40000;  // batas total satu panggilan getStreams (ms)
var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/* ---------------- Util umum ---------------- */
function log() {
  try {
    var a = ['[AnichinCare]'];
    for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
    console.log.apply(console, a);
  } catch (e) {}
}

function unique(arr) {
  var seen = {}, out = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
  }
  return out;
}

function pad2(n) { n = parseInt(n, 10) || 0; return n < 10 ? '0' + n : String(n); }

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

// Base64 decode manual (jaga-jaga atob tidak tersedia)
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

/* ---------------- Pencocokan judul ---------------- */
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

/* ---------------- Promise & HTTP ---------------- */
function withTimeout(p, ms, label) {
  return new Promise(function (resolve, reject) {
    var finished = false;
    var timer = setTimeout(function () {
      if (!finished) { finished = true; reject(new Error('timeout: ' + label)); }
    }, ms);
    p.then(function (v) {
      if (!finished) { finished = true; clearTimeout(timer); resolve(v); }
    }, function (e) {
      if (!finished) { finished = true; clearTimeout(timer); reject(e); }
    });
  });
}

function hasItems(r) { return !!(r && r.length); }
function isValue(r) { return !!r; }

// Jalankan task satu per satu sampai ada yang menghasilkan sesuai kriteria `done`
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
  return withTimeout(p, Math.min(REQ_TIMEOUT, left), url);
}

function blocked(r) {
  if (r.status === 403 || r.status === 429 || r.status === 503) return true;
  return r.text.length < 8000 && /just a moment|cf-browser-verification|challenge-platform|attention required|cf-chl/i.test(r.text);
}

// null jika diblokir Cloudflare / error HTTP
function getHtml(ctx, url, referer) {
  return http(ctx, url, { referer: referer }).then(function (r) {
    if (blocked(r)) { log('diblokir (Cloudflare?)', r.status, url); return null; }
    if (r.status >= 400) { log('HTTP', r.status, url); return null; }
    return r;
  }).catch(function (e) { log('gagal fetch', url, e && e.message); return null; });
}

function getJson(ctx, url, o) {
  o = o || {};
  o.json = true;
  return http(ctx, url, o).then(function (r) {
    if (r.status >= 400) return null;
    try { return JSON.parse(r.text); } catch (e) { return null; }
  }).catch(function () { return null; });
}

/* ---------------- TMDB ---------------- */
function tmdb(ctx, path, params) {
  if (!TMDB_KEY) return Promise.resolve(null);
  var qs = 'api_key=' + encodeURIComponent(TMDB_KEY);
  for (var k in (params || {})) qs += '&' + k + '=' + encodeURIComponent(params[k]);
  return getJson(ctx, 'https://api.themoviedb.org/3' + path + '?' + qs);
}

function parseContentId(id) {
  var s = String(id == null ? '' : id).trim(), m;
  if ((m = /^tmdb:(\d+)/i.exec(s))) return { kind: 'tmdb', id: m[1] };
  if ((m = /(tt\d+)/i.exec(s))) return { kind: 'imdb', id: m[1] };
  if (/^\d+$/.test(s)) return { kind: 'tmdb', id: s };
  return { kind: 'unknown', id: s };
}

function isLatin(t) {
  return /[A-Za-z]/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(t);
}

function resolveMeta(ctx, parsed) {
  var kind = ctx.type === 'movie' ? 'movie' : 'tv', idP;
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
    if (!id) return null;
    return Promise.all([
      tmdb(ctx, '/' + kind + '/' + id, { language: 'en-US' }),
      tmdb(ctx, '/' + kind + '/' + id + '/alternative_titles', {})
    ]).then(function (res) {
      var d = res[0], alt = res[1];
      if (!d) return null;
      var list = [d.name || d.title, d.original_name || d.original_title];
      var extra = (alt && (alt.results || alt.titles)) || [];
      var i, titles = [];
      for (i = 0; i < extra.length; i++) list.push(extra[i].title);
      for (i = 0; i < list.length; i++) {
        if (list[i] && isLatin(list[i])) titles.push(String(list[i]).trim());
      }
      return { titles: unique(titles).slice(0, 5), seasons: d.seasons || [] };
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

/* ---------------- Parsing halaman situs (tema AnimeStream) ---------------- */
// Kartu hasil pencarian / daftar: <article class="... bs ...">
function parseCards(html, pageUrl) {
  var out = [], seen = {};
  var re = /<article\b[^>]*class="[^"]*\bbs\b[^"]*"[\s\S]*?<\/article>/gi, m;
  while ((m = re.exec(html))) {
    var block = m[0];
    var am = /<a\b[^>]*href="([^"]+)"[^>]*>/i.exec(block);
    if (!am) continue;
    var url = absUrl(am[1], pageUrl);
    if (!url || seen[url]) continue;
    var tm = /\btitle="([^"]*)"/i.exec(am[0]) ||
             /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(block) ||
             /class="tt"[^>]*>([\s\S]*?)</i.exec(block);
    var title = tm ? decodeEntities(tm[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
    if (!title) continue;
    seen[url] = 1;
    out.push({ url: url, title: title });
  }
  return out;
}

// Daftar episode: semua anchor yang mengandung 'episode-N' di href
function parseEpisodes(html, pageUrl) {
  var out = [], seen = {};
  var re = /<a\b[^>]*href="([^"]*episode-0*(\d+(?:\.\d+)?)[^"]*)"[^>]*>/gi, m;
  while ((m = re.exec(html))) {
    var url = absUrl(m[1], pageUrl);
    if (!url || seen[url]) continue;
    seen[url] = 1;
    out.push({ url: url, num: parseFloat(m[2]) });
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

/* ---------------- Ekstrak server dari halaman episode ---------------- */
// <select class="mirror"><option value="BASE64(<iframe src=...>)">Okru</option>...
function extractServers(html, pageUrl) {
  var servers = [], seen = {}, pageHost = hostOf(pageUrl);
  var skip = /(^|\.)(googletagmanager|google-analytics|googlesyndication|doubleclick|facebook|histats|disqus|youtube|youtu)\./i;

  function push(url, label) {
    url = absUrl(url, pageUrl);
    var host = hostOf(url);
    if (!url || !host || host === pageHost || seen[url] || skip.test(host)) return;
    seen[url] = 1;
    servers.push({ url: url, label: String(label || host).replace(/\s+/g, ' ').trim() });
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

  // 1) dropdown server (value = base64 iframe)
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
    var iRe = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi, im, n = 0;
    while ((im = iRe.exec(html)) && n < 3) { push(im[1], 'Default'); n++; }
  }
  return servers;
}

/* ---------------- Resolver embed -> URL langsung ---------------- */
var OK_Q = { mobile: 144, lowest: 240, low: 360, sd: 480, hd: 720, full: 1080, quad: 1440, ultra: 2160 };

function okruStreams(meta) {
  var out = [], hdr = { 'User-Agent': UA, 'Referer': 'https://ok.ru/' };
  if (!meta) return out;
  var hls = meta.hlsManifestUrl || meta.ondemandHls || meta.hlsMasterPlaylistUrl;
  if (hls) out.push({ url: absUrl(hls, 'https://ok.ru'), quality: 'Auto', type: 'hls', headers: hdr });
  var vids = meta.videos || [];
  for (var i = 0; i < vids.length; i++) {
    var q = OK_Q[vids[i].name];
    if (!vids[i].url || (q && q < 360)) continue;
    out.push({ url: absUrl(vids[i].url, 'https://ok.ru'), quality: q ? q + 'p' : 'HD', type: 'mp4', headers: hdr });
  }
  return out;
}

function resolveOkru(ctx, url) {
  var m = /\/video(?:embed)?\/(\d+)/i.exec(url);
  if (!m) return Promise.resolve([]);
  var embed = 'https://ok.ru/videoembed/' + m[1];
  return http(ctx, embed, { referer: ctx.base + '/' }).then(function (r) {
    var mm = /data-options\s*=\s*(["'])([\s\S]*?)\1/.exec(r.text);
    if (!mm) return [];
    var opts;
    try { opts = JSON.parse(decodeEntities(mm[2])); } catch (e) { return []; }
    var fv = (opts && opts.flashvars) || {}, metaP;
    if (fv.metadata) {
      try { metaP = Promise.resolve(typeof fv.metadata === 'string' ? JSON.parse(fv.metadata) : fv.metadata); }
      catch (e2) { metaP = Promise.resolve(null); }
    } else if (fv.metadataUrl) {
      metaP = getJson(ctx, absUrl(fv.metadataUrl, 'https://ok.ru'), { referer: embed });
    } else {
      metaP = Promise.resolve(null);
    }
    return metaP.then(okruStreams);
  });
}

function resolveDailymotion(ctx, url) {
  var m = /(?:\/video\/|[?&]video=|dai\.ly\/)([a-z0-9]+)/i.exec(url);
  if (!m) return Promise.resolve([]);
  var api = 'https://www.dailymotion.com/player/metadata/video/' + m[1] + '?embedder=' + encodeURIComponent(ctx.base + '/');
  return getJson(ctx, api, { referer: ctx.base + '/' }).then(function (j) {
    var auto = j && j.qualities && j.qualities.auto && j.qualities.auto[0];
    if (!auto || !auto.url) return [];
    return [{ url: auto.url, quality: 'Auto', type: 'hls', headers: { 'User-Agent': UA, 'Referer': 'https://www.dailymotion.com/' } }];
  });
}

function resolveRumble(ctx, url) {
  var m = /\/embed\/([a-z0-9]+)/i.exec(url);
  if (!m) return Promise.resolve([]);
  var api = 'https://rumble.com/embedJS/u3/?request=video&ver=2&v=' + m[1];
  return getJson(ctx, api, { referer: 'https://rumble.com/' }).then(function (j) {
    var out = [], ua = j && j.ua, hdr = { 'User-Agent': UA, 'Referer': 'https://rumble.com/' };
    if (!ua) return out;
    for (var fmt in ua) {
      var group = ua[fmt];
      for (var h in group) {
        var item = group[h];
        if (!item || !item.url) continue;
        if (fmt === 'hls') out.push({ url: item.url, quality: 'Auto', type: 'hls', headers: hdr });
        else if (fmt === 'mp4') out.push({ url: item.url, quality: /^\d+$/.test(h) ? h + 'p' : 'HD', type: 'mp4', headers: hdr });
      }
    }
    return out;
  });
}

// Host lain: cari m3u8/mp4 langsung di HTML embed
function resolveGeneric(ctx, url) {
  return http(ctx, url, { referer: ctx.base + '/' }).then(function (r) {
    if (r.status >= 400) return [];
    var t = r.text.replace(/\\\//g, '/');
    var re = /https?:\/\/[^\s"'<>\\)]+?\.(m3u8|mp4)(?:\?[^\s"'<>\\)]*)?/gi, m, found = {}, out = [];
    while ((m = re.exec(t))) {
      if (found[m[0]]) continue;
      found[m[0]] = 1;
      out.push({
        url: m[0], quality: 'Auto', type: m[1].toLowerCase() === 'm3u8' ? 'hls' : 'mp4',
        headers: { 'User-Agent': UA, 'Referer': originOf(url) + '/' }
      });
    }
    return out.slice(0, 3);
  });
}

function resolveServer(ctx, srv) {
  var u = srv.url, host = hostOf(u), p;
  if (/\.m3u8(?:[?#]|$)/i.test(u)) p = Promise.resolve([{ url: u, quality: 'Auto', type: 'hls' }]);
  else if (/\.mp4(?:[?#]|$)/i.test(u)) p = Promise.resolve([{ url: u, quality: 'Auto', type: 'mp4' }]);
  else if (/(^|\.)ok\.ru$/.test(host)) p = resolveOkru(ctx, u);
  else if (/(^|\.)(dailymotion\.com|dai\.ly)$/.test(host)) p = resolveDailymotion(ctx, u);
  else if (/(^|\.)rumble\.com$/.test(host)) p = resolveRumble(ctx, u);
  else if (/(^|\.)(odysee\.com|d\.tube)$/.test(host)) p = Promise.resolve([]); // belum didukung
  else p = resolveGeneric(ctx, u);

  return p.then(function (items) {
    var label = srv.label || host;
    var t0 = (ctx.titles && ctx.titles.length) ? ctx.titles[0] : 'Video';
    var base = t0;
    if (ctx.type === 'tv' && ctx.season > 0) base += ' S' + pad2(ctx.season) + 'E' + pad2(ctx.episode);
    var out = [];
    for (var i = 0; i < (it
