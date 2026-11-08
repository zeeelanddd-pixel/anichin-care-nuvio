/*
 * Anichin Care - Nuvio provider
 * Hanya memakai halaman dan URL media yang dapat diakses secara publik.
 * Tidak mencoba melewati challenge, login, token, atau pembatasan akses.
 */
var VERSION = "1.2.3";
var PROVIDER = "Anichin";
var BASE = "https://anichin.moe";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var MAX_RESULTS = 12;
var REQUEST_BUDGET_MS = 45000;
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";

function log(msg) {
  try { console.log("[AnichinCare v" + VERSION + "] " + String(msg)); } catch (e) {}
}
function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, function (_, x) { return String.fromCharCode(parseInt(x, 16)); })
    .replace(/&#([0-9]+);/g, function (_, x) { return String.fromCharCode(parseInt(x, 10)); });
}
function stripTags(s) {
  return decodeHtml(String(s || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function absUrl(u, base) {
  u = decodeHtml(String(u || "").trim()).replace(/&amp;/g, "&");
  if (!u || /^javascript:|^data:/i.test(u)) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") {
    var m = /^(https?:\/\/[^/]+)/i.exec(base || BASE);
    return m ? m[1] + u : "";
  }
  return "";
}
function hostOf(u) {
  var m = /^https?:\/\/([^/:?#]+)/i.exec(String(u || ""));
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}
function unique(items) {
  var seen = {}, out = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i] && !seen[items[i]]) { seen[items[i]] = true; out.push(items[i]); }
  }
  return out;
}
function norm(s) {
  return stripTags(s).toLowerCase().replace(/&/g, " and ")
    .replace(/\b(donghua|sub indo|subtitle indonesia)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function titleScore(a, b) {
  var aa = unique(norm(a).split(" ")), bb = unique(norm(b).split(" "));
  var set = {}, hit = 0, i;
  for (i = 0; i < bb.length; i++) set[bb[i]] = true;
  for (i = 0; i < aa.length; i++) if (set[aa[i]]) hit++;
  return aa.length && bb.length ? (2 * hit) / (aa.length + bb.length) : 0;
}
function fetchText(url, referer, deadline) {
  if (Date.now() > deadline) return Promise.resolve(null);
  var headers = { "User-Agent": UA, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "id-ID,id;q=0.9,en;q=0.7" };
  if (referer) headers.Referer = referer;
  return fetch(url, { method: "GET", headers: headers, redirect: "follow" }).then(function (r) {
    return r.text().then(function (body) {
      var status = Number(r.status || 0);
      if (status === 403 || status === 429 || status === 503) {
        log("akses ditolak HTTP " + status + " pada " + hostOf(url) + "; tidak mencoba melewati pembatasan");
        return null;
      }
      if (status < 200 || status >= 400) return null;
      if (/cf-browser-verification|challenge-platform|just a moment/i.test(String(body || "").slice(0, 12000))) {
        log("halaman challenge terdeteksi pada " + hostOf(url));
        return null;
      }
      return { url: r.url || url, text: String(body || ""), status: status };
    });
  }).catch(function (e) {
    log("request gagal " + hostOf(url) + ": " + (e && e.message ? e.message : e));
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
  return fetchText(url, "https://www.themoviedb.org/", deadline).then(function (r) {
    if (!r) return null;
    try {
      var j = JSON.parse(r.text);
      var t = j.name || j.title || j.original_name || j.original_title;
      return t ? { title: String(t), seasons: j.seasons || [] } : null;
    } catch (e) { return null; }
  });
}
function wpSearch(title, deadline) {
  var url = BASE + "/wp-json/wp/v2/search?search=" + encodeURIComponent(title) + "&per_page=30";
  return fetchText(url, BASE + "/", deadline).then(function (r) {
    if (!r) return [];
    try {
      var data = JSON.parse(r.text), out = [];
      if (!Array.isArray(data)) return out;
      for (var i = 0; i < data.length; i++) {
        var item = data[i] || {};
        var u = absUrl(item.url || item.link, r.url);
        var t = stripTags(item.title && (item.title.rendered || item.title) || "");
        if (u && t) out.push({ url: u, title: t });
      }
      return out;
    } catch (e) { return []; }
  });
}
function htmlSearch(title, deadline) {
  var url = BASE + "/?s=" + encodeURIComponent(title);
  return fetchText(url, BASE + "/", deadline).then(function (r) {
    if (!r) return [];
    var out = [], seen = {}, re = /<article\b[\s\S]*?<\/article>/gi, m;
    while ((m = re.exec(r.text))) {
      var a = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(m[0]);
      if (!a) continue;
      var u = absUrl(a[1], r.url);
      var tm = /\btitle=["']([^"']+)["']/i.exec(a[0]) || /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(m[0]);
      var t = tm ? stripTags(tm[1]) : "";
      if (u && t && !seen[u]) { seen[u] = true; out.push({ url: u, title: t }); }
    }
    return out;
  });
}
function findSeries(title, season, deadline) {
  return wpSearch(title, deadline).then(function (items) {
    if (items.length) return items;
    return htmlSearch(title, deadline);
  }).then(function (items) {
    var ranked = [];
    for (var i = 0; i < items.length; i++) {
      var score = titleScore(items[i].title, title);
      var st = norm(items[i].title), hasSeason = new RegExp("\\bseason " + season + "\\b|\\bs" + season + "\\b").test(st);
      if (season > 1 && hasSeason) score += 0.2;
      if (season > 1 && /\bseason [2-9]\b|\bs[2-9]\b/.test(st) && !hasSeason) score -= 0.35;
      if (score >= 0.48) ranked.push({ url: items[i].url, title: items[i].title, score: score });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked.slice(0, 8);
  });
}
function episodeNumber(label, url) {
  var s = stripTags(label || "");
  var m = /\b(?:episode|ep|eps?)\s*0*(\d+(?:\.\d+)?)/i.exec(s) ||
          /episode[-_ ]0*(\d+(?:\.\d+)?)/i.exec(url || "") ||
          /(?:^|[-_/])0*(\d+(?:\.\d+)?)(?:[-_./?]|$)/.exec(url || "");
  return m ? Number(m[1]) : null;
}
function parseEpisodes(html, pageUrl) {
  var out = [], seen = {}, re = /<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html))) {
    var u = absUrl(m[2], pageUrl);
    if (!u || seen[u] || !(/episode[-_ ]?\d+/i.test(u) || /eplister|episode/i.test(m[1] + m[3]))) continue;
    var n = episodeNumber(m[3], u);
    if (n !== null) { seen[u] = true; out.push({ url: u, num: n, label: stripTags(m[3]) }); }
  }
  return out;
}
function decodeBase64(s) {
  try {
    if (typeof atob === "function") return atob(String(s || "").replace(/-/g, "+").replace(/_/g, "/"));
  } catch (e) {}
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var input = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  var out = "", bits = 0, acc = 0;
  for (var i = 0; i < input.length; i++) {
    var v = chars.indexOf(input.charAt(i));
    if (v < 0) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 255); }
  }
  return out;
}
function parseServerLinks(html, pageUrl) {
  var out = [], seen = {}, m;
  function add(raw, label) {
    var decoded = String(raw || "").trim();
    if (!decoded) return;
    if (decoded.charAt(0) !== "<" && !/^https?:|^\/\//i.test(decoded)) {
      var maybe = decodeBase64(decoded);
      if (maybe) decoded = maybe;
    }
    var im = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(decoded);
    var sm = /<(?:source|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(decoded);
    var u = absUrl(im ? im[1] : (sm ? sm[1] : decoded), pageUrl);
    var h = hostOf(u);
    if (!u || !h || h === hostOf(pageUrl) || seen[u]) return;
    if (!/^(ok\.ru|odnoklassniki\.ru|rumble\.com|dailymotion\.com|dmcdn\.net)$/.test(h) && !/\.(m3u8|mp4)(?:$|[?#])/i.test(u)) return;
    seen[u] = true; out.push({ url: u, label: stripTags(label) || h });
  }
  var sel = /<select\b[^>]*(?:class|name)=["'][^"']*mirror[^"']*["'][^>]*>([\s\S]*?)<\/select>/gi, sm;
  while ((sm = sel.exec(html))) {
    var opt = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi, om;
    while ((om = opt.exec(sm[1]))) {
      var val = /\bvalue=["']([^"']+)["']/i.exec(om[1]);
      if (val) add(val[1], om[2]);
    }
  }
  if (!out.length) {
    var data = /\bdata-(?:embed|video|iframe)=["']([^"']+)["']/gi, dm;
    while ((dm = data.exec(html))) add(dm[1], "Mirror");
  }
  if (!out.length) {
    var iframe = /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi, fm, count = 0;
    while ((fm = iframe.exec(html)) && count < 8) { add(fm[1], "Mirror"); count++; }
  }
  return out;
}
function directMediaUrls(html, pageUrl) {
  var text = String(html || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  var found = [], seen = {}, re = /https?:\\?\/\\?\/[^"'\\\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\\\s<>]*)?/gi, m;
  while ((m = re.exec(text))) {
    var u = m[0].replace(/\\\//g, "/").replace(/[),;]+$/, "");
    u = absUrl(u, pageUrl);
    if (u && !seen[u]) { seen[u] = true; found.push(u); }
    if (found.length >= MAX_RESULTS) break;
  }
  var keyPattern = /["'](?:hlsMasterPlaylistUrl|hlsManifestUrl|ondemandHls|videoUrl|file)["']\s*:\s*["']([^"']+)["']/gi, km;
  while ((km = keyPattern.exec(text))) {
    var ku = absUrl(km[1].replace(/\\\//g, "/"), pageUrl);
    if (ku && /\.(m3u8|mp4)(?:$|[?#])/i.test(ku) && !seen[ku]) { seen[ku] = true; found.push(ku); }
  }
  return found;
}
function resolveServer(server, deadline) {
  if (/\.(m3u8|mp4)(?:$|[?#])/i.test(server.url)) {
    return Promise.resolve([{ url: server.url, label: server.label, referer: BASE + "/" }]);
  }
  var h = hostOf(server.url);
  if (!/^(ok\.ru|odnoklassniki\.ru|rumble\.com|dailymotion\.com|dmcdn\.net)$/.test(h)) return Promise.resolve([]);
  return fetchText(server.url, BASE + "/", deadline).then(function (r) {
    if (!r) return [];
    var urls = directMediaUrls(r.text, r.url);
    var out = [];
    for (var i = 0; i < urls.length; i++) {
      out.push({ url: urls[i], label: server.label, referer: r.url });
    }
    return out;
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  type = (type === "movie" || type === "film") ? "movie" : "tv";
  var s = Math.max(1, Number(season) || 1);
  var e = Math.max(1, Number(episode) || 1);
  var deadline = Date.now() + REQUEST_BUDGET_MS;
  log("start type=" + type + " id=" + tmdbId + (type === "tv" ? " S" + s + "E" + e : ""));
  return tmdbTitle(tmdbId, type, deadline).then(function (meta) {
    if (!meta || !meta.title) return [];
    log("judul TMDB: " + meta.title);
    return findSeries(meta.title, s, deadline).then(function (candidates) {
      if (!candidates.length) { log("judul tidak ditemukan pada pencarian publik"); return []; }
      var pageTasks = [];
      for (var i = 0; i < candidates.length; i++) {
        (function (candidate) {
          pageTasks.push(fetchText(candidate.url, BASE + "/", deadline).then(function (r) {
            if (!r) return null;
            if (type === "movie") return { page: r, title: candidate.title };
            var eps = parseEpisodes(r.text, r.url);
            for (var j = 0; j < eps.length; j++) {
              if (eps[j].num === e) return { pageUrl: eps[j].url, title: candidate.title };
            }
            return null;
          }));
        })(candidates[i]);
      }
      return Promise.all(pageTasks).then(function (results) {
        var chosen = null;
        for (var k = 0; k < results.length; k++) if (results[k]) { chosen = results[k]; break; }
        if (!chosen) { log("halaman/episode yang cocok tidak ditemukan"); return []; }
        var pagePromise = chosen.page ? Promise.resolve(chosen.page) : fetchText(chosen.pageUrl, BASE + "/", deadline);
        return pagePromise.then(function (page) {
          if (!page) return [];
          var servers = parseServerLinks(page.text, page.url);
          log("mirror ditemukan: " + servers.length);
          if (!servers.length) return [];
          var tasks = [];
          for (var n = 0; n < servers.length; n++) tasks.push(resolveServer(servers[n], deadline));
          return Promise.all(tasks).then(function (resolved) {
            var streams = [], seen = {};
            for (var a = 0; a < resolved.length; a++) {
              for (var b = 0; b < resolved[a].length; b++) {
                var item = resolved[a][b];
                if (!item.url) continue;
                // Buang query token sementara agar URL media yang sama tidak muncul berkali-kali.
                var canonical = String(item.url).split("?")[0].split("#")[0];
                var host = hostOf(item.url);
                var hostEnd = canonical.indexOf("://");
                var pathAndHost = hostEnd >= 0 ? canonical.substring(hostEnd + 3) : canonical;
                var pathStart = pathAndHost.indexOf("/");
                var path = pathStart >= 0 ? pathAndHost.substring(pathStart).toLowerCase() : "/";
                var dedupeKey = host + path;
                if (seen[dedupeKey]) continue;
                seen[dedupeKey] = true;
                var label = stripTags(item.label || "").replace(/[ \t\r\n]+/g, " ").trim();
                var hostLabel = host === "ok.ru" || host === "odnoklassniki.ru" ? "OK.ru" :
                  host === "rumble.com" ? "Rumble" :
                  host === "dailymotion.com" || host === "dmcdn.net" ? "Dailymotion" : host;
                if (!label || /^(server|mirror|auto)$/i.test(label)) label = hostLabel || "Server";
                var resolution = /(?:^|[^0-9])(2160|1440|1080|720|480|360)p(?:[^0-9]|$)/i.exec(label + " " + item.url);
                var displayQuality = resolution ? resolution[1] + "p" : label;
                streams.push({
                  name: PROVIDER,
                  title: label + (resolution ? " • " + resolution[1] + "p" : ""),
                  url: item.url,
                  quality: displayQuality,
                  headers: { "Referer": item.referer || page.url, "User-Agent": UA }
                });
                if (streams.length >= MAX_RESULTS) break;
              }
              if (streams.length >= MAX_RESULTS) break;
            }
            log("stream langsung ditemukan: " + streams.length);
            return streams;
          });
        });
      });
    });
  }).catch(function (err) {
    log("getStreams error: " + (err && err.message ? err.message : err));
    return [];
  });
}
module.exports = { getStreams: getStreams };
