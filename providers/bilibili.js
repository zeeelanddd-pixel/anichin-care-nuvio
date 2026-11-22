/*
 * Bilibili Public - Nuvio provider
 * Uses Bilibili's publicly accessible web API only.
 * No login cookies, signature bypass, paywall bypass, or restricted-content access.
 */
var VERSION = "1.2.2";
// true: when nothing is found, show one "⚠" card that says why. Set to false to hide it.
var SHOW_DIAGNOSTICS = true;
var PROVIDER = "Bilibili";
var API = "https://api.bilibili.com";
var UA = "Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";
var TIMEOUT_MS = 35000;
var MAX_RESULTS = 8;
var MIN_SECONDS = 480; // shorter videos are clips, trailers and PVs, not episodes
// Plain HTTPS video CDNs. PCDN/"mcdn" mirrors and bare IPs (usually on odd ports) are skipped: players cannot use them.
var GOOD_HOST = /(?:^|\.)(?:bilivideo\.com|akamaized\.net|hdslb\.com|bilibili\.com)$/i;
var QUALITY_LABELS = { "120": "4K", "116": "1080p60", "112": "1080p+", "80": "1080p", "74": "720p60", "64": "720p", "32": "480p", "16": "360p" };

function log(msg) {
  try { console.log("[BilibiliPublic v" + VERSION + "] " + String(msg)); } catch (e) {}
}
// Why a lookup returned nothing, shown as one "⚠" card. Nuvio's card displays only `name` (bold line) and `quality`
// (line below), so the short cause goes into `name` and the detail into `quality`; `title` keeps the full sentence.
// Higher stages are further along and win over lower ones.
var diag = { stage: 0, text: "", short: "", detail: "" };
function clip(text, n) { text = String(text || ""); return text.length > n ? text.slice(0, n - 1) + "…" : text; }
function why(stage, text, short, detail) {
  log("why[" + stage + "]: " + text);
  if (stage >= diag.stage) { diag.stage = stage; diag.text = text; diag.short = short || ""; diag.detail = detail || ""; }
}
function diagnosticCards() {
  var on = typeof SHOW_DIAGNOSTICS !== "undefined" && SHOW_DIAGNOSTICS;
  if (!on || (typeof DISABLE_DIAGNOSTICS !== "undefined" && DISABLE_DIAGNOSTICS)) return [];
  return [{
    name: "⚠ " + (diag.short || "Penyebab tidak diketahui"),
    title: "Tidak ada stream: " + (diag.text || "penyebab tidak diketahui"),
    url: "https://www.bilibili.com/",
    quality: clip(diag.detail, 150) || "Info",
    headers: { "User-Agent": UA }
  }];
}
function who(url) { return /themoviedb/i.test(String(url)) ? "TMDB" : "Bilibili"; }
function hostName(u) {
  var m = /^https?:\/\/([^/:?#]+)/i.exec(String(u || ""));
  return m ? m[1].toLowerCase() : "?";
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
function parseDurationSec(v) {
  if (typeof v === "number") return v > 0 ? v : 0;
  var s = String(v || "").trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  var parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return 0;
  var total = 0;
  for (var i = 0; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) return 0;
    total = total * 60 + Number(parts[i]);
  }
  return total;
}
function requestJson(url, referer, deadline, extraHeaders) {
  if (Date.now() > deadline) return Promise.resolve(null);
  var headers = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Referer": referer || "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com"
  };
  if (extraHeaders) {
    for (var k in extraHeaders) if (Object.prototype.hasOwnProperty.call(extraHeaders, k)) headers[k] = extraHeaders[k];
  }
  return fetch(url, { method: "GET", headers: headers, redirect: "follow" }).then(function (r) {
    if (!r || !r.ok) {
      log("HTTP request failed: " + (r ? r.status : "no response"));
      why(2, hostName(url) + " menjawab HTTP " + (r ? r.status : "tanpa respons"), who(url) + " menjawab HTTP " + (r ? r.status : "tanpa respons"), hostName(url));
      return null;
    }
    return r.text().then(function (body) {
      try {
        var data = JSON.parse(body);
        if (data && typeof data.code === "number" && data.code !== 0) {
          log("API menolak request code=" + data.code);
          why(2, hostName(url) + " menolak permintaan (code " + data.code + (data.message ? ": " + data.message : "") + ")", who(url) + " menolak (code " + data.code + ")", data.message || hostName(url));
          return null;
        }
        return data;
      } catch (e) {
        log("API response is not valid JSON");
        why(2, hostName(url) + " mengirim jawaban yang bukan JSON", "Jawaban " + who(url) + " bukan JSON", hostName(url));
        return null;
      }
    });
  }).catch(function (e) {
    log("request error: " + (e && e.message ? e.message : e));
    why(2, "tidak bisa terhubung ke " + hostName(url) + " (" + (e && e.message ? e.message : e) + ")", "Tidak bisa terhubung", hostName(url) + " (" + (e && e.message ? e.message : e) + ")");
    return null;
  });
}
function tmdbTitle(id, type, deadline) {
  if (!TMDB_KEY) {
    log("TMDB_API_KEY is not available in the Nuvio runtime");
    return Promise.resolve(null);
  }
  var kind = type === "movie" ? "movie" : "tv";
  var cleanId = String(id == null ? "" : id).replace(/^tmdb:/i, "").trim();
  if (!/^\d+$/.test(cleanId)) { log("Unsupported TMDB id: " + id); return Promise.resolve(null); }
  var url = "https://api.themoviedb.org/3/" + kind + "/" + cleanId + "?language=en-US", headers = {};
  // v4 read-access tokens are JWTs and go in a header; v3 keys go in the query string.
  if (/^eyJ/.test(TMDB_KEY) || TMDB_KEY.length > 40) headers.Authorization = "Bearer " + TMDB_KEY;
  else url += "&api_key=" + encodeURIComponent(TMDB_KEY);
  return requestJson(url, "https://www.themoviedb.org/", deadline, headers).then(function (d) {
    var title = d && (d.name || d.title || d.original_name || d.original_title);
    if (!title) return null;
    return { title: String(title), originalTitle: String(d.original_name || d.original_title || title) };
  });
}
function searchVideos(title, episode, type, deadline) {
  var isCjk = /[\u3400-\u9fff]/.test(String(title || ""));
  var queries = type === "tv" ? (isCjk ? [
    title + " 第" + episode + "集",
    title + " " + episode,
    title
  ] : [
    title + " episode " + episode,
    title + " ep " + episode,
    title + " " + episode,
    title
  ]) : [title];
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
      "(?:第\\s*0*" + ep + "\\s*[集话話]|\\b(?:episode|ep|e)\\s*0*" + ep + "\\b|(?:^|[\\s#_-])0*" + ep + "(?:集|话|話|期)?(?:$|[\\s#_.-]))",
      "i"
    );
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].length; i++) {
        var x = groups[g][i] || {};
        var name = clean(x.title || "");
        var bvid = String(x.bvid || "");
        var aid = Number(x.aid || 0);
        if (!name || (!bvid && !aid)) continue;
        var titleScore = Math.max(score(title, name), score(title, name.replace(/(?:\b(?:episode|ep)|第)?\s*0*\d+\s*(?:集|话|話|期)?/ig, " ")));
        var epMatch = type !== "tv" || epPattern.test(name);
        if (titleScore < 0.38 || !epMatch) continue;
        var key = bvid || String(aid);
        if (seen[key]) continue;
        seen[key] = true;
        var dur = parseDurationSec(x.duration);
        var isFullLength = dur === 0 || dur >= MIN_SECONDS;
        out.push({ bvid: bvid, aid: aid, title: name, score: titleScore, duration: dur, full: isFullLength });
      }
    }
    // Full-length episodes (>= 8 min) must be ranked ahead of short clips before slicing to MAX_RESULTS.
    out.sort(function (a, b) {
      return (b.full ? 1 : 0) - (a.full ? 1 : 0) || b.score - a.score;
    });
    return out.slice(0, MAX_RESULTS);
  });
}
function pickPage(pages, episode, fallbackTitle, fallbackCid, fallbackDuration) {
  if (!Array.isArray(pages) || !pages.length) {
    return fallbackCid ? { cid: Number(fallbackCid), title: fallbackTitle, duration: Number(fallbackDuration || 0) } : null;
  }
  var ep = Math.max(1, Number(episode) || 1);
  if (pages.length > 1) {
    var epRe = new RegExp("(?:第\\s*0*" + ep + "\\s*[集话話]|\\b(?:episode|ep|p)?\\s*0*" + ep + "\\b)", "i");
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i] || {};
      if (p.cid && (Number(p.page) === ep || epRe.test(String(p.part || "")))) {
        var partName = clean(p.part || "");
        return {
          cid: Number(p.cid),
          title: partName ? fallbackTitle + " • " + partName : fallbackTitle,
          duration: Number(p.duration || fallbackDuration || 0)
        };
      }
    }
  }
  var first = pages[0] || {};
  var cid = Number(fallbackCid || first.cid || 0);
  return cid ? { cid: cid, title: fallbackTitle, duration: Number(fallbackDuration || first.duration || 0) } : null;
}
function videoInfo(item, episode, deadline) {
  var key = item.bvid ? "bvid=" + encodeURIComponent(item.bvid) : "aid=" + item.aid;
  return requestJson(API + "/x/web-interface/view?" + key, "https://www.bilibili.com/", deadline).then(function (j) {
    var d = j && j.data;
    if (d && (d.cid || (Array.isArray(d.pages) && d.pages.length)) && d.bvid) {
      var picked = pickPage(d.pages, episode, clean(d.title || item.title), d.cid, d.duration);
      if (picked) return { bvid: d.bvid, cid: picked.cid, title: picked.title, duration: picked.duration };
    }
    if (!item.bvid) return null;
    // Public pagelist endpoint as a non-authenticated fallback when /view is unavailable.
    return requestJson(API + "/x/player/pagelist?bvid=" + encodeURIComponent(item.bvid) + "&jsonp=jsonp",
      "https://www.bilibili.com/video/" + item.bvid + "/", deadline).then(function (pageData) {
      var pages = pageData && pageData.data;
      var picked = pickPage(pages, episode, clean(item.title), 0, 0);
      if (!picked) return null;
      return {
        bvid: item.bvid,
        cid: picked.cid,
        title: picked.title,
        duration: picked.duration
      };
    });
  });
}
function formatSize(bytes) {
  var b = Number(bytes);
  if (!(b > 0)) return "";
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1024)) + " KB";
}
// Android blocks cleartext HTTP, and Bilibili often hands out http:// links; its CDNs answer on HTTPS too.
function usableUrl(u) {
  if (typeof u !== "string") return "";
  var url = u.replace(/^http:\/\//i, "https://");
  var m = /^https:\/\/([^/:?#]+)(:\d+)?\//i.exec(url);
  if (!m || m[2]) return "";
  var h = m[1].toLowerCase();
  if (!GOOD_HOST.test(h) || /\bmcdn\b|szbdyd|\.pcdn\./i.test(h)) return "";
  return url;
}
// Ask for the first two bytes with the same headers the player will use; a 403/404 here means it will not play either.
function probe(url, headers, deadline) {
  if (Date.now() > deadline) return Promise.resolve({ ok: false, status: 0, error: "waktu habis" });
  var h = {};
  for (var k in headers) if (Object.prototype.hasOwnProperty.call(headers, k)) h[k] = headers[k];
  h.Range = "bytes=0-1";
  return fetch(url, { method: "GET", headers: h, redirect: "follow" }).then(function (r) {
    var status = Number(r && r.status) || (r && r.ok === false ? 500 : 200);
    var range = r && r.headers && typeof r.headers.get === "function" ? r.headers.get("content-range") : "";
    var total = /\/(\d+)\s*$/.exec(String(range || ""));
    return { ok: status === 200 || status === 206, status: status, size: total ? Number(total[1]) : 0 };
  }).catch(function (e) {
    return { ok: false, status: 0, error: e && e.message ? e.message : String(e) };
  });
}
function playUrl(info, deadline) {
  var referer = "https://www.bilibili.com/video/" + info.bvid + "/";
  // platform=html5 returns plain MP4 (the default can be FLV); high_quality lifts the html5 limit to 1080p when allowed.
  var url = API + "/x/player/playurl?bvid=" + encodeURIComponent(info.bvid) +
    "&cid=" + info.cid + "&qn=64&fnver=0&fnval=0&fourk=0&platform=html5&high_quality=1";
  return requestJson(url, referer, deadline).then(function (j) {
    var d = j && j.data;
    if (!d) return [];
    var urls = [], seen = {};
    function addUrl(u) {
      var good = usableUrl(u);
      if (!good || seen[good]) return;
      seen[good] = true;
      urls.push(good);
    }
    if (Array.isArray(d.durl)) {
      for (var i = 0; i < d.durl.length; i++) {
        var part = d.durl[i] || {};
        addUrl(part.url);
        if (Array.isArray(part.backup_url)) {
          for (var b = 0; b < part.backup_url.length; b++) addUrl(part.backup_url[b]);
        }
      }
    }
    // upos-* mirrors are the reliable ones.
    urls.sort(function (a, b) { return (/upos-/.test(hostName(b)) ? 1 : 0) - (/upos-/.test(hostName(a)) ? 1 : 0); });
    if (!urls.length) {
      why(4, "Bilibili tidak memberi URL video yang bisa diputar untuk '" + info.title + "' (tidak ada, atau hanya CDN yang tidak didukung)",
        "Tidak ada URL yang bisa diputar", "hanya CDN yang tidak didukung: '" + clip(info.title, 40) + "'");
      return [];
    }
    var headers = { "Referer": referer, "Origin": "https://www.bilibili.com", "User-Agent": UA, "Accept": "*/*" };
    var label = QUALITY_LABELS[d.quality ? String(d.quality) : ""] || "Auto";
    var knownSize = Number(Array.isArray(d.durl) && d.durl[0] && d.durl[0].size) || 0; // bytes, as reported by playurl
    return Promise.all(urls.slice(0, 3).map(function (u) {
      return probe(u, headers, deadline).then(function (res) { res.url = u; return res; });
    })).then(function (results) {
      var good = results.filter(function (x) { return x.ok; });
      if (!good.length) {
        var first = results[0];
        why(5, "Bilibili menolak pemutaran (" + (first.status ? "HTTP " + first.status : first.error) + ") untuk '" + info.title + "'",
          "CDN menolak pemutaran (" + (first.status ? "HTTP " + first.status : first.error) + ")", "'" + clip(info.title, 50) + "'");
        return [];
      }
      return good.map(function (x, n) {
        var size = formatSize(knownSize || x.size);
        var stream = {
          name: PROVIDER,
          title: info.title + (good.length > 1 ? " • CDN " + (n + 1) : "") + (size ? " • " + size : ""),
          url: x.url,
          quality: label, // Nuvio prints `size` after the quality itself; repeating it showed "480p • 165.2 MB • 165.2 MB"
          headers: headers
        };
        if (size) stream.size = size;
        return stream;
      });
    });
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  type = type === "movie" || type === "film" ? "movie" : "tv";
  var ep = Math.max(1, Number(episode) || 1);
  var deadline = Date.now() + TIMEOUT_MS;
  diag = { stage: 0, text: "", short: "", detail: "" };
  log("start type=" + type + " tmdb=" + tmdbId + (type === "tv" ? " episode=" + ep : ""));
  return tmdbTitle(tmdbId, type, deadline).then(function (meta) {
    if (!meta || !meta.title) {
      if (diag.stage < 2) why(1, "judul TMDB tidak bisa dibaca (periksa TMDB_API_KEY di Nuvio)", "Judul TMDB tidak terbaca", "periksa TMDB_API_KEY di Nuvio");
      return diagnosticCards();
    }
    log("TMDB title: " + meta.title + " / original: " + meta.originalTitle);
    var queries = [meta.title];
    if (meta.originalTitle && norm(meta.originalTitle) !== norm(meta.title)) queries.push(meta.originalTitle);
    return Promise.all(queries.map(function (q) { return searchVideos(q, ep, type, deadline); })).then(function (groups) {
      var items = [], itemSeen = {};
      for (var gi = 0; gi < groups.length; gi++) for (var gj = 0; gj < groups[gi].length; gj++) {
        var candidate = groups[gi][gj], key = candidate.bvid || String(candidate.aid);
        if (!itemSeen[key]) { itemSeen[key] = true; items.push(candidate); }
      }
      items.sort(function (a, b) { return (b.full ? 1 : 0) - (a.full ? 1 : 0) || b.score - a.score; });
      items = items.slice(0, MAX_RESULTS);
      if (!items.length) {
        log("No matching public videos found");
        if (diag.stage < 2) why(3, "tidak ada video Bilibili yang cocok dengan '" + meta.title + "'" + (type === "tv" ? " episode " + ep : ""),
          "Video tidak ditemukan", "tidak ada hasil cocok untuk '" + clip(meta.title, 40) + "'" + (type === "tv" ? " episode " + ep : ""));
        return diagnosticCards();
      }
      var shortClips = 0;
      return Promise.all(items.map(function (item) {
        return videoInfo(item, ep, deadline).then(function (info) {
          if (!info) return [];
          if (info.duration && info.duration < MIN_SECONDS) { shortClips++; log("skip short video: " + info.title); return []; }
          return playUrl(info, deadline);
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
        log("Public streams found: " + out.length);
        if (!out.length) {
          if (shortClips && diag.stage < 4) why(3, "hanya klip pendek (kurang dari 8 menit) yang cocok dengan '" + meta.title + "'", "Hanya klip pendek", "kurang dari 8 menit untuk '" + clip(meta.title, 40) + "'");
          return diagnosticCards();
        }
        return out;
      });
    });
  }).catch(function (e) {
    log("getStreams error: " + (e && e.message ? e.message : e));
    if (!diag.text) why(0, "kesalahan tak terduga: " + (e && e.message ? e.message : e), "Kesalahan tak terduga", String(e && e.message ? e.message : e));
    return diagnosticCards();
  });
}
module.exports = { getStreams: getStreams };
            
