/*
 * Bilibili Public - Nuvio provider
 * Uses Bilibili's publicly accessible web API only.
 * No login cookies, signature bypass, paywall bypass, or restricted-content access.
 */
var VERSION = "1.0.0";
var PROVIDER = "Bilibili";
var API = "https://api.bilibili.com";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";
var TIMEOUT_MS = 35000;
var MAX_RESULTS = 8;

function log(msg) {
  try { console.log("[BilibiliPublic v" + VERSION + "] " + String(msg)); } catch (e) {}
}
function clean(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function (_, x) { return String.fromCharCode(parseInt(x, 16)); })
    .replace(/&#([0-9]+);/g, function (_, x) { return String.fromCharCode(parseInt(x, 10)); })
    .replace(/\s+/g, " ").trim();
}
function norm(s) {
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function score(a, b) {
  var aa = norm(a).split(" "), bb = norm(b).split(" "), set = {}, hit = 0;
  for (var i = 0; i < bb.length; i++) if (bb[i]) set[bb[i]] = true;
  for (var j = 0; j < aa.length; j++) if (aa[j] && set[aa[j]]) hit++;
  return aa.length && bb.length ? 2 * hit / (aa.length + bb.length) : 0;
}
function requestJson(url, referer, deadline) {
  if (Date.now() > deadline) return Promise.resolve(null);
  var headers = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Referer": referer || "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com"
  };
  return fetch(url, { method: "GET", headers: headers, redirect: "follow" }).then(function (r) {
    if (!r || !r.ok) {
      log("HTTP request gagal: " + (r ? r.status : "no response"));
      return null;
    }
    return r.text().then(function (body) {
      try {
        var data = JSON.parse(body);
        if (data && typeof data.code === "number" && data.code !== 0) {
          log("API menolak request code=" + data.code);
          return null;
        }
        return data;
      } catch (e) {
        log("Respons API bukan JSON");
        return null;
      }
    });
  }).catch(function (e) {
    log("request error: " + (e && e.message ? e.message : e));
    return null;
  });
}
function tmdbTitle(id, type, deadline) {
  if (!TMDB_KEY) {
    log("TMDB_API_KEY tidak tersedia di runtime Nuvio");
    return Promise.resolve(null);
  }
  var kind = type === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + kind + "/" + encodeURIComponent(id) +
    "?language=en-US&api_key=" + encodeURIComponent(TMDB_KEY);
  return requestJson(url, "https://www.themoviedb.org/", deadline).then(function (j) {
    var d = j && (j.data || j);
    var title = d && (d.name || d.title || d.original_name || d.original_title);
    return title ? String(title) : null;
  });
}
function searchVideos(title, episode, type, deadline) {
  var query = title;
  if (type === "tv") query += " episode " + episode;
  var url = API + "/x/web-interface/search/type?search_type=video&page=1&order=totalrank&keyword=" + encodeURIComponent(query);
  return requestJson(url, "https://search.bilibili.com/", deadline).then(function (j) {
    var data = j && j.data;
    var items = data && data.result;
    if (!Array.isArray(items)) return [];
    var out = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var x = items[i] || {};
      var name = clean(x.title || "");
      var bvid = String(x.bvid || "");
      var aid = Number(x.aid || 0);
      if (!name || (!bvid && !aid)) continue;
      var titleScore = score(title, name);
      var epMatch = type !== "tv" || new RegExp("(?:第\\s*0*" + episode + "\\s*集|episode\\s*0*" + episode + "\\b|\\bep\\s*0*" + episode + "\\b|\\b0*" + episode + "\\s*/)").test(name.toLowerCase());
      if (titleScore < 0.45 || !epMatch) continue;
      var key = bvid || String(aid);
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ bvid: bvid, aid: aid, title: name, score: titleScore });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, MAX_RESULTS);
  });
}
function videoInfo(item, deadline) {
  var key = item.bvid ? "bvid=" + encodeURIComponent(item.bvid) : "aid=" + item.aid;
  return requestJson(API + "/x/web-interface/view?" + key, "https://www.bilibili.com/", deadline).then(function (j) {
    var d = j && j.data;
    if (!d || !d.cid || !d.bvid) return null;
    return { bvid: d.bvid, cid: Number(d.cid), title: clean(d.title || item.title), duration: Number(d.duration || 0) };
  });
}
function playUrl(info, deadline) {
  var url = API + "/x/player/playurl?bvid=" + encodeURIComponent(info.bvid) +
    "&cid=" + info.cid + "&qn=80&fnver=0&fnval=0&fourk=0";
  return requestJson(url, "https://www.bilibili.com/video/" + info.bvid + "/", deadline).then(function (j) {
    var d = j && j.data;
    var urls = [];
    if (d && Array.isArray(d.durl)) {
      for (var i = 0; i < d.durl.length; i++) {
        var part = d.durl[i] || {};
        if (part.url && /^https?:\/\//i.test(part.url)) urls.push(part.url);
        if (urls.length >= 4) break;
      }
    }
    var quality = d && d.quality ? String(d.quality) : "";
    var label = quality === "80" ? "1080p" : quality === "64" ? "720p" : quality === "32" ? "480p" : "Auto";
    return urls.map(function (u, i) {
      return {
        name: PROVIDER,
        title: info.title + (urls.length > 1 ? " • Part " + (i + 1) : ""),
        url: u,
        quality: label,
        headers: { "Referer": "https://www.bilibili.com/video/" + info.bvid + "/", "User-Agent": UA }
      };
    });
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  type = type === "movie" || type === "film" ? "movie" : "tv";
  var ep = Math.max(1, Number(episode) || 1);
  var deadline = Date.now() + TIMEOUT_MS;
  log("start type=" + type + " tmdb=" + tmdbId + (type === "tv" ? " episode=" + ep : ""));
  return tmdbTitle(tmdbId, type, deadline).then(function (title) {
    if (!title) return [];
    log("TMDB title: " + title);
    return searchVideos(title, ep, type, deadline).then(function (items) {
      if (!items.length) {
        log("tidak ada video publik yang cocok");
        return [];
      }
      return Promise.all(items.map(function (item) {
        return videoInfo(item, deadline).then(function (info) {
          return info ? playUrl(info, deadline) : [];
        });
      })).then(function (groups) {
        var out = [], seen = {};
        for (var i = 0; i < groups.length; i++) {
          for (var j = 0; j < groups[i].length; j++) {
            var stream = groups[i][j];
            if (!stream.url || seen[stream.url]) continue;
            seen[stream.url] = true;
            out.push(stream);
            if (out.length >= MAX_RESULTS) return out;
          }
        }
        log("stream publik ditemukan: " + out.length);
        return out;
      });
    });
  }).catch(function (e) {
    log("getStreams error: " + (e && e.message ? e.message : e));
    return [];
  });
}
module.exports = { getStreams: getStreams };
