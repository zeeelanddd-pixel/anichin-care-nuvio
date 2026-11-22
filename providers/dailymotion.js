/*
 * Dailymotion - Nuvio provider
 * Searches Dailymotion's public Data API (api.dailymotion.com) and plays public videos through the same
 * player-metadata endpoint that Dailymotion's own embed uses. Private, password-protected and restricted
 * videos are not touched. Does not bypass challenges, login requirements, tokens, or access restrictions.
 */
var VERSION = "1.0.1";
var PROVIDER = "Dailymotion";
var API = "https://api.dailymotion.com";
var WATCH = "https://www.dailymotion.com";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";
var MAX_RESULTS = 12;
var MAX_VIDEOS = 4;
var MIN_SECONDS = 480; // shorter videos are clips, trailers and PVs, not episodes
var TIMEOUT_MS = 40000;
var SIZE_BUDGET_MS = 6000; // time allowed for reading file sizes after the streams are known
// true: when nothing is found, show one "⚠" card that says why. Set to false to hide it.
var SHOW_DIAGNOSTICS = true;

var JUNK = /\b(?:trailer|teaser|preview|recap|review|reaction|amv|pv|clip|highlights?|ost|opening|ending|shorts?|promo)\b/i;
var NOISE_WORDS = /\b(?:episode|eps?)\s*\d+(?:\.\d+)?(?:\s+\d+)?\b|\b(?:sub|subs|subtitle|subtitles|indo|indonesia|indonesian|english|eng|hardsub|softsub|dub|dubbed|multiple|multi)\b/g;

function log(s) { try { console.log("[DailymotionCare v" + VERSION + "] " + s); } catch (e) {} }
function clip(text, n) { text = String(text || ""); return text.length > n ? text.slice(0, n - 1) + "…" : text; }

// Why a lookup returned nothing, shown as one "⚠" card. Nuvio's card displays only `name` (bold line) and `quality`
// (line below), so the short cause goes into `name` and the detail into `quality`; `title` keeps the full sentence.
var diag = { stage: 0, text: "", short: "", detail: "", notes: [] };
function why(stage, text, short, detail) {
  log("why[" + stage + "]: " + text);
  if (stage >= diag.stage) { diag.stage = stage; diag.text = text; diag.short = short || ""; diag.detail = detail || ""; }
}
function warn(text) { log(text); if (diag.notes.length < 3 && diag.notes.indexOf(text) < 0) diag.notes.push(text); }
function diagnosticCards() {
  var on = typeof SHOW_DIAGNOSTICS !== "undefined" && SHOW_DIAGNOSTICS;
  if (!on || (typeof DISABLE_DIAGNOSTICS !== "undefined" && DISABLE_DIAGNOSTICS)) return [];
  return [{
    name: "⚠ " + (diag.short || "Penyebab tidak diketahui"),
    title: "Tidak ada stream: " + (diag.text || "penyebab tidak diketahui"),
    url: WATCH + "/",
    quality: clip(diag.detail, 150) || "Info",
    headers: { "User-Agent": UA }
  }];
}
function hostName(u) {
  var m = /^https?:\/\/([^/:?#]+)/i.exec(String(u || ""));
  return m ? m[1].toLowerCase() : "?";
}
function who(url) { return /themoviedb/i.test(String(url)) ? "TMDB" : "Dailymotion"; }

function decodeHtml(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, x) { return String.fromCharCode(parseInt(x, 16)); })
    .replace(/&#([0-9]+);/g, function (_, x) { return String.fromCharCode(parseInt(x, 10)); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function stripTags(s) { return decodeHtml(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function unique(items) {
  var seen = {}, out = [];
  for (var i = 0; i < items.length; i++) if (items[i] && !seen[items[i]]) { seen[items[i]] = true; out.push(items[i]); }
  return out;
}

/* ---------- Title matching (same rules as the donghua site providers) ---------- */
function norm(s) {
  return stripTags(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function scoreNorm(s) { return norm(s).replace(NOISE_WORDS, " ").replace(/\bend\s*$/, " ").replace(/\s+/g, " ").trim(); }
function tokensOf(s) { return unique(scoreNorm(s).split(" ")); }
function withinOneEdit(a, b) {
  if (a === b) return true;
  var la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  var i = 0;
  while (i < la && i < lb && a.charAt(i) === b.charAt(i)) i++;
  if (la === lb) {
    if (a.substring(i + 1) === b.substring(i + 1)) return true;
    return a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.substring(i + 2) === b.substring(i + 2);
  }
  return la > lb ? a.substring(i + 1) === b.substring(i) : b.substring(i + 1) === a.substring(i);
}
function sameToken(a, b) { return a === b || (a.length >= 5 && b.length >= 5 && withinOneEdit(a, b)); }
function scoreTokens(aa, bb) {
  if (!aa.length || !bb.length) return 0;
  var used = {}, hit = 0, i, j;
  for (i = 0; i < aa.length; i++) {
    for (j = 0; j < bb.length; j++) if (!used[j] && sameToken(aa[i], bb[j])) { used[j] = true; hit++; break; }
  }
  return (2 * hit) / (aa.length + bb.length);
}
function titleVariants(s) {
  s = String(s || "");
  var out = [s], inner = [], m, re = /[\[(]([^\]\[()]+)[\])]/g;
  while ((m = re.exec(s))) { if (tokensOf(m[1]).length >= 2) inner.push(m[1]); }
  if (inner.length) {
    out.push(s.replace(/[\[(][^\]\[()]*[\])]/g, " "));
    for (var i = 0; i < inner.length; i++) out.push(inner[i]);
  }
  return out;
}
function titleScore(a, b) {
  var av = titleVariants(a), bv = titleVariants(b), best = 0;
  for (var i = 0; i < av.length; i++) for (var j = 0; j < bv.length; j++) {
    var sc = scoreTokens(tokensOf(av[i]), tokensOf(bv[j]));
    if (sc > best) best = sc;
  }
  return best;
}
// "Time's" and "Time’s" are different words to a search engine; punctuation becomes spaces.
function plain(title) {
  return String(title || "").replace(/['’‘`´]/g, " ").replace(/[:;,.!?()\[\]{}"“”<>|\/\\*+=_~^&-]+/g, " ")
    .split(/\s+/).filter(function (w) { return w && (w.length > 1 || /\d/.test(w)); }).join(" ");
}
function episodeIn(title, n) {
  return new RegExp("\\b(?:episode|eps?|e)\\s*0*" + n + "\\b|\\bs\\d{1,2}\\s*e0*" + n + "\\b|第\\s*0*" + n + "\\s*[集话話]", "i").test(title);
}
function seasonIn(title) {
  var m = /\bseason\s*(\d+)\b|\bs(\d{1,2})\s*e\d+\b/i.exec(title);
  return m ? Number(m[1] || m[2]) : 0;
}
// TMDB numbers episodes per season; uploaders often number them continuously. With a season marker the in-season
// number counts; without one, the continuous number does (S2E3 after a 26-episode S1 is "Episode 29").
function episodeMatches(title, e, season, offset) {
  var m = seasonIn(title);
  if (season > 1 && offset) {
    if (m) return m === season && (episodeIn(title, e) || episodeIn(title, offset + e));
    return episodeIn(title, offset + e);
  }
  if (m && m !== season) return false;
  return episodeIn(title, e);
}

/* ---------- HTTP + TMDB ---------- */
function fetchJson(url, referer, deadline, extraHeaders) {
  if (Date.now() > deadline) return Promise.resolve(null);
  var headers = { "User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "id-ID,id;q=0.9,en;q=0.7" };
  if (referer) headers.Referer = referer;
  if (extraHeaders) for (var k in extraHeaders) if (Object.prototype.hasOwnProperty.call(extraHeaders, k)) headers[k] = extraHeaders[k];
  return fetch(url, { method: "GET", headers: headers, redirect: "follow" }).then(function (r) {
    var status = Number(r && r.status) || (r && r.ok === false ? 500 : 200);
    return r.text().then(function (body) {
      if (status < 200 || status >= 400) {
        why(2, hostName(url) + " menjawab HTTP " + status, who(url) + " menjawab HTTP " + status, hostName(url));
        return null;
      }
      try { return JSON.parse(body); } catch (e) {
        why(2, hostName(url) + " mengirim jawaban yang bukan JSON", "Jawaban " + who(url) + " bukan JSON", hostName(url));
        return null;
      }
    });
  }).catch(function (e) {
    why(2, "tidak bisa terhubung ke " + hostName(url) + " (" + (e && e.message ? e.message : e) + ")", "Tidak bisa terhubung", hostName(url) + " (" + (e && e.message ? e.message : e) + ")");
    return null;
  });
}
function tmdbMeta(name, original, alts, counts) {
  var seen = {}, titles = [];
  [name, original].concat(alts || []).forEach(function (t) {
    t = t ? String(t) : "";
    var k = norm(t);
    if (!k || seen[k]) return;
    if (titles.length && /[^\u0000-\u024F\u2018-\u201D]/.test(t)) return; // Latin-script aliases only
    seen[k] = true; titles.push(t);
  });
  return titles.length ? { title: titles[0], titles: titles.slice(0, 6), counts: counts || null } : null;
}
function seasonOffset(counts, season) {
  if (!counts || season <= 1) return 0;
  var sum = 0;
  for (var n = 1; n < season; n++) {
    if (typeof counts[n] !== "number" || !(counts[n] > 0)) return 0;
    sum += counts[n];
  }
  return sum;
}
function tmdbTitle(id, type, deadline) {
  if (!TMDB_KEY) { log("TMDB_API_KEY is not available"); return Promise.resolve(null); }
  var kind = type === "movie" ? "movie" : "tv";
  var cleanId = String(id == null ? "" : id).replace(/^tmdb:/i, "").trim();
  if (!/^\d+$/.test(cleanId)) { log("Unsupported TMDB id: " + id); return Promise.resolve(null); }
  var url = "https://api.themoviedb.org/3/" + kind + "/" + cleanId + "?language=en-US&append_to_response=alternative_titles", headers = {};
  // v4 read-access tokens are JWTs and go in a header; v3 keys go in the query string.
  if (/^eyJ/.test(TMDB_KEY) || TMDB_KEY.length > 40) headers.Authorization = "Bearer " + TMDB_KEY;
  else url += "&api_key=" + encodeURIComponent(TMDB_KEY);
  return fetchJson(url, "https://www.themoviedb.org/", deadline, headers).then(function (j) {
    if (!j) return null;
    var alts = [], counts = null;
    var rows = j.alternative_titles && (j.alternative_titles.results || j.alternative_titles.titles);
    if (Array.isArray(rows)) rows.forEach(function (x) { if (x && x.title) alts.push(String(x.title)); });
    if (Array.isArray(j.seasons)) {
      counts = {};
      j.seasons.forEach(function (sn) { if (sn && sn.season_number >= 1 && sn.episode_count >= 0) counts[sn.season_number] = Number(sn.episode_count); });
    }
    return tmdbMeta(j.name || j.title || j.original_name || j.original_title, j.original_name || j.original_title, alts, counts);
  });
}

/* ---------- Search + matching ---------- */
function searchVideos(query, deadline) {
  var url = API + "/videos?search=" + encodeURIComponent(query) + "&fields=" + encodeURIComponent("id,title,duration,owner.screenname") +
    "&limit=20&sort=relevance&private=false&password_protected=false&longer_than=8&flags=no_live";
  return fetchJson(url, WATCH + "/", deadline).then(function (j) {
    if (!j) return [];
    if (j.error) {
      var msg = String(j.error.message || j.error.type || "error");
      why(2, "Dailymotion menolak pencarian (" + msg + ")", "Dailymotion menolak pencarian", msg);
      return [];
    }
    var out = [], list = Array.isArray(j.list) ? j.list : [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i] || {};
      if (!x.id) continue;
      out.push({
        id: String(x.id),
        title: stripTags(x.title),
        seconds: Number(x.duration) || 0,
        owner: String(x["owner.screenname"] || (x.owner && x.owner.screenname) || "")
      });
    }
    return out;
  });
}
// 0 = reject; otherwise a score (higher is better)
function scoreVideo(item, meta, type, season, e, offset) {
  if (item.seconds < MIN_SECONDS || JUNK.test(item.title)) return 0;
  var best = 0;
  for (var i = 0; i < meta.titles.length && i < 3; i++) best = Math.max(best, titleScore(item.title, meta.titles[i]));
  if (best < 0.5) return 0;
  if (type === "tv") { if (!episodeMatches(item.title, e, season, offset)) return 0; }
  else if (/\bepisode\s*\d+/i.test(item.title)) return 0; // a movie request must not return a series episode
  if (/sub\s*indo|indonesia|indo\s*sub/i.test(item.title)) best += 0.15;
  return best;
}

/* ---------- File size ---------- */
function formatSize(bytes) {
  var b = Number(bytes);
  if (!(b > 0)) return "";
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1024)) + " KB";
}
// The server's own answer to HEAD, so no part of the video is downloaded. Nothing is guessed: no answer, no size.
function headSize(url, headers, deadline) {
  if (Date.now() > deadline) return Promise.resolve(0);
  return fetch(url, { method: "HEAD", headers: headers, redirect: "follow" }).then(function (r) {
    var status = Number(r && r.status) || (r && r.ok === false ? 500 : 200);
    if (status < 200 || status >= 400) return 0;
    var len = r.headers && typeof r.headers.get === "function" ? Number(r.headers.get("content-length")) : 0;
    return len > 0 ? len : 0;
  }).catch(function () { return 0; });
}
// Progressive MP4 files get their size in `size` (Nuvio's card prints it after the quality, "720p • 245.3 MB") and in the
// title; it is not repeated in `quality`. HLS has no single file, so it is left alone.
function addSizes(streams, deadline) {
  var until = Math.min(deadline, Date.now() + SIZE_BUDGET_MS);
  return Promise.all(streams.map(function (st) {
    return /\.m3u8(?:$|[?#])/i.test(st.url) ? 0 : headSize(st.url, st.headers, until);
  })).then(function (sizes) {
    for (var i = 0; i < streams.length; i++) {
      var text = formatSize(sizes[i]);
      if (!text) continue;
      streams[i].size = text;
      streams[i].title = streams[i].title + " • " + text;
    }
    return streams;
  });
}

/* ---------- Playback: the metadata endpoint Dailymotion's own embed player uses ---------- */
function parseMetadata(r, api) {
  var out = [];
  if (!r) return out;
  if (r.error) warn("Dailymotion: " + stripTags(String(r.error.message || r.error.title || r.error)));
  var q = r.qualities || {};
  Object.keys(q).forEach(function (key) {
    (Array.isArray(q[key]) ? q[key] : []).forEach(function (entry) {
      var u = entry && typeof entry.url === "string" ? entry.url : "";
      if (!/^https:\/\//i.test(u)) return;
      var height = /^\d+$/.test(key) ? Number(key) : 0;
      out.push({ url: u, quality: height ? height + "p" : "Auto", height: height });
    });
  });
  out.sort(function (a, b) { return b.height - a.height; });
  return out;
}
function resolveVideo(item, deadline) {
  var api = WATCH + "/player/metadata/video/" + encodeURIComponent(item.id);
  var watch = WATCH + "/video/" + item.id;
  return fetchJson(api, watch, deadline).then(function (r) { return parseMetadata(r); }).then(function (items) {
    if (items.length) return items;
    // Some videos answer only to the request shape of the dailymotion.com web player (embedder = its own watch page).
    var q = api + "?app=com.dailymotion.neon&embedder=" + encodeURIComponent(watch) + "&integration=inline&GK_PV5_NEON=1";
    return fetchJson(q, watch, deadline).then(function (r) { return parseMetadata(r); });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  type = (type === "movie" || type === "film") ? "movie" : "tv";
  var s = Math.max(1, Number(season) || 1);
  var e = Math.max(1, Number(episode) || 1);
  var deadline = Date.now() + TIMEOUT_MS;
  diag = { stage: 0, text: "", short: "", detail: "", notes: [] };
  log("start type=" + type + " id=" + tmdbId + (type === "tv" ? " S" + s + "E" + e : ""));
  return tmdbTitle(tmdbId, type, deadline).then(function (meta) {
    if (!meta || !meta.title) {
      if (diag.stage < 2) why(1, "judul TMDB tidak bisa dibaca (periksa TMDB_API_KEY di Nuvio)", "Judul TMDB tidak terbaca", "periksa TMDB_API_KEY di Nuvio");
      return diagnosticCards();
    }
    log("TMDB title: " + meta.titles.join(" / "));
    var offset = type === "tv" ? seasonOffset(meta.counts, s) : 0;
    var t0 = plain(meta.titles[0]), t1 = meta.titles[1] ? plain(meta.titles[1]) : "";
    var queries = type === "tv"
      ? [t0 + " episode " + (offset ? offset + e : e), t0 + " season " + s + " episode " + e, t0 + " " + (offset ? offset + e : e) + " sub indo", t1 && t1 + " episode " + (offset ? offset + e : e)]
      : [t0, t0 + " movie", t0 + " sub indo"];
    queries = unique(queries).slice(0, 4);
    return Promise.all(queries.map(function (q) { return searchVideos(q, deadline); })).then(function (groups) {
      var seen = {}, all = [], picked = [];
      for (var g = 0; g < groups.length; g++) for (var i = 0; i < groups[g].length; i++) {
        var item = groups[g][i];
        if (seen[item.id]) continue;
        seen[item.id] = true; all.push(item);
        var score = scoreVideo(item, meta, type, s, e, offset);
        if (score > 0) { item.score = score; picked.push(item); }
      }
      picked.sort(function (a, b) { return b.score - a.score || b.seconds - a.seconds; });
      picked = picked.slice(0, MAX_VIDEOS);
      if (!picked.length) {
        if (diag.stage < 2) {
          var sample = all.slice(0, 2).map(function (x) { return clip(x.title, 34); }).join(" | ");
          why(3, "tidak ada video Dailymotion yang cocok dengan '" + meta.title + "'" + (type === "tv" ? " episode " + e : ""), "Video tidak ditemukan",
            all.length + " hasil, tidak ada yang cocok" + (sample ? " [" + sample + "]" : ""));
        }
        return diagnosticCards();
      }
      log("Matched videos: " + picked.map(function (x) { return x.id + " " + clip(x.title, 40); }).join(" | "));
      return Promise.all(picked.map(function (item) {
        return resolveVideo(item, deadline).then(function (items) { return { item: item, items: items }; });
      })).then(function (resolved) {
        var out = [], urls = {};
        resolved.forEach(function (r) {
          r.items.slice(0, 3).forEach(function (x) {
            if (urls[x.url] || out.length >= MAX_RESULTS) return;
            urls[x.url] = true;
            out.push({
              name: PROVIDER,
              title: clip(r.item.title, 70) + (r.item.owner ? " • " + r.item.owner : "") + (x.quality !== "Auto" ? " • " + x.quality : ""),
              url: x.url,
              quality: x.quality,
              headers: { "Referer": WATCH + "/", "User-Agent": UA }
            });
          });
        });
        log("Streams found: " + out.length);
        if (out.length) return addSizes(out, deadline);
        why(4, "video ditemukan tetapi pemutar Dailymotion tidak memberi tautan" + (diag.notes.length ? " (" + diag.notes.join("; ") + ")" : ""), "Video tidak terbaca",
          picked.slice(0, 2).map(function (x) { return "'" + clip(x.title, 30) + "'"; }).join(", ") + (diag.notes.length ? " — " + diag.notes.join("; ") : ""));
        return diagnosticCards();
      });
    });
  }).catch(function (err) {
    log("getStreams error: " + (err && err.message ? err.message : err));
    if (!diag.text) why(0, "kesalahan tak terduga: " + (err && err.message ? err.message : err), "Kesalahan tak terduga", String(err && err.message ? err.message : err));
    return diagnosticCards();
  });
}
module.exports = { getStreams: getStreams };
