/*
 * Odysee Public - Nuvio provider
 * Resolves one explicitly authorized public Odysee upload through Odysee's
 * public SDK proxy. It does not search unrelated uploads or construct CDN URLs.
 */
var VERSION = "1.0.0";
var PROVIDER = "Odysee";
var API = "https://api.na-backend.odysee.com/api/v1/proxy?m=get";
var CLAIM_URI = "lbry://RI01:c";
var CANONICAL_URL = "https://odysee.com/RI01:c";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";
var TIMEOUT_MS = 25000;

function log(msg) {
  try { console.log("[OdyseePublic v" + VERSION + "] " + String(msg)); } catch (e) {}
}
function clean(s) {
  return String(s || "").replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}
function norm(s) {
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function requestJson(url, method, body, deadline) {
  if (Date.now() > deadline) return Promise.resolve(null);
  var options = {
    method: method || "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://odysee.com",
      "Referer": "https://odysee.com/"
    },
    redirect: "follow"
  };
  if (body !== null && body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return fetch(url, options).then(function (r) {
    if (!r || !r.ok) {
      log("HTTP gagal: " + (r ? r.status : "no response"));
      return null;
    }
    return r.text().then(function (raw) {
      try { return JSON.parse(raw); }
      catch (e) { log("Respons bukan JSON"); return null; }
    });
  }).catch(function (e) {
    log("request error: " + (e && e.message ? e.message : e));
    return null;
  });
}
function getTmdbTitle(id, type, deadline) {
  if (!TMDB_KEY) return Promise.resolve(null);
  var kind = type === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + kind + "/" +
    encodeURIComponent(id) + "?language=en-US&api_key=" + encodeURIComponent(TMDB_KEY);
  return requestJson(url, "GET", null, deadline).then(function (j) {
    var d = j && (j.data || j);
    var title = d && (d.name || d.title || d.original_name || d.original_title);
    return title ? String(title) : null;
  });
}
function findStreamingUrl(obj, depth) {
  if (!obj || typeof obj !== "object" || depth > 5) return "";
  if (typeof obj.streaming_url === "string" && /^https?:\/\//i.test(obj.streaming_url)) {
    return obj.streaming_url;
  }
  if (typeof obj.streamingUrl === "string" && /^https?:\/\//i.test(obj.streamingUrl)) {
    return obj.streamingUrl;
  }
  var keys = ["data", "result", "outputs", "value", "stream"];
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] && typeof obj[keys[i]] === "object") {
      var found = findStreamingUrl(obj[keys[i]], depth + 1);
      if (found) return found;
    }
  }
  return "";
}
function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  type = type === "movie" || type === "film" ? "movie" : "tv";
  var ep = Math.max(1, Number(episode) || 1);
  if (type !== "tv" || ep !== 1) return Promise.resolve([]);
  var deadline = Date.now() + TIMEOUT_MS;
  return getTmdbTitle(tmdbId, type, deadline).then(function (title) {
    // This provider is intentionally pinned to the one authorized claim supplied
    // for the initial integration. It will not return unrelated search results.
    if (!title || norm(title).indexOf("renegade immortal") < 0) {
      log("judul tidak cocok dengan claim yang dikonfigurasi");
      return [];
    }
    return requestJson(API, "POST", { uri: CLAIM_URI }, deadline).then(function (data) {
      var streamUrl = findStreamingUrl(data, 0);
      if (!streamUrl) {
        log("Odysee tidak memberikan streaming_url publik untuk claim ini");
        return [];
      }
      var lower = streamUrl.toLowerCase();
      var quality = lower.indexOf("1080") >= 0 ? "1080p" :
        lower.indexOf("720") >= 0 ? "720p" : "Auto";
      log("stream publik berhasil di-resolve");
      return [{
        name: PROVIDER,
        title: title + " • Episode 1",
        url: streamUrl,
        quality: quality,
        headers: {
          "Referer": CANONICAL_URL,
          "Origin": "https://odysee.com",
          "User-Agent": UA,
          "Accept": "*/*"
        }
      }];
    });
  }).catch(function (e) {
    log("getStreams error: " + (e && e.message ? e.message : e));
    return [];
  });
}
module.exports = { getStreams: getStreams };
