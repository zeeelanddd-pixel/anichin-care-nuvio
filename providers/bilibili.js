/*
 * Bilibili Public - Nuvio provider
 * Uses Bilibili's publicly accessible web API only.
 * No login cookies, signature bypass, paywall bypass, or restricted-content access.
 */
var VERSION = "1.0.3";
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
  return clean(s).toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").replace(/\s+/g, " ").trim();
}
function score(a, b) {
  var na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return 0.9;
  var aa = na.split(" "), bb = nb.split(" "), set = {}, hit = 0;
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
    if (!title) return null;
    return { title: String(title), originalTitle: String(d.original_name || d.original_title || title) };
  });
}
function searchVideos(title, episode, type, deadline) {
  var queries = type === "tv" ? [
    title + " episode " + episode,
    title + " ep " + episode,
    title + " " + episode,
    title
  ] : [title];
  return Promise.all(queries.map(function (query) {
    var url = API + "/x/web-interface/search/type?search_type=video&page=1&order=totalrank&keyword=" + encodeURIComponent(query);
    return requestJson(url, "https://search.bilibili.com/", deadline).then(function (j) {
      var items = j && j.data && j.data.result;
      return Array.isArray(items) ? items : [];
    });
  })).then(function (groups) {
    var out = [], seen = {};
    var ep = String(Math.max(1, Number(episode) || 1));
    var epPattern = new RegExp(
      "(?:第\\s*0*" + ep + "\\s*[集话話]|(?:episode|ep|e)\\s*0*" + ep + "\\b|(?:^|[\\s#_-])0*" + ep + "(?:集|话|話|期)?(?:$|[\\s#_.-]))",
      "i"
    );
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].length; i++) {
        var x = groups[g][i] || {};
        var name = clean(x.title || "");
        var bvid = String(x.bvid || "");
        var aid = Number(x.aid || 0);
        if (!name || (!bvid && !aid)) continue;
        var titleScore = Math.max(score(title, name), score(title, name.replace(/(?:episode|ep|第)?\\\\s*0*\\\\d+\\\\s*(?:集|话|話)?/ig, " ")));
        var epMatch = type !== "tv" || epPattern.test(name);
        if (titleScore < 0.38 || !epMatch) continue;
        var key = bvid || String(aid);
        if (seen[key]) continue;
        seen[key] = true;
        out.push({ bvid: bvid, aid: aid, title: name, score: titleScore });
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, MAX_RESULTS);
  });
}
function videoInfo(item, deadline) {
  var key = item.bvid ? "bvid=" + encodeURIComponent(item.bvid) : "aid=" + item.aid;
  return requestJson(API + "/x/web-interface/view?" + key, "https://www.bilibili.com/", deadline).then(function (j) {
    var d = j && j.data;
    if (d && d.cid && d.bvid) {
      return { bvid: d.bvid, cid: Number(d.cid), title: clean(d.title || item.title), duration: Number(d.duration || 0) };
    }
    if (!item.bvid) return null;
    // Public pagelist endpoint as a non-authenticated fallback when /view is unavailable.
    return requestJson(API + "/x/player/pagelist?bvid=" + encodeURIComponent(item.bvid) + "&jsonp=jsonp",
      "https://www.bilibili.com/video/" + item.bvid + "/", deadline).then(function (pageData) {
      var pages = pageData && pageData.data;
      if (!Array.isArray(pages) || !pages.length || !pages[0].cid) return null;
      return {
        bvid: item.bvid,
        cid: Number(pages[0].cid),
        title: clean(item.title),
        duration: Number(pages[0].duration || 0)
      };
    });
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
  return tmdbTitle(tmdbId, type, deadline).then(function (meta) {
    if (!meta || !meta.title) return [];
    log("TMDB title: " + meta.title + " / original: " + meta.originalTitle);
    var queries = [meta.title];
    if (meta.originalTitle && norm(meta.originalTitle) !== norm(meta.title)) queries.push(meta.originalTitle);
    return Promise.all(queries.map(function (q) { return searchVideos(q, ep, type, deadline); })).then(function (groups) {
      var items = [], itemSeen = {};
      for (var gi = 0; gi < groups.length; gi++) for (var gj = 0; gj < groups[gi].length; gj++) {
        var candidate = groups[gi][gj], key = candidate.bvid || String(candidate.aid);
        if (!itemSeen[key]) { itemSeen[key] = true; items.push(candidate); }
      }
      items.sort(function (a, b) { return b.score - a.score; });
      items = items.slice(0, MAX_RESULTS);
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
