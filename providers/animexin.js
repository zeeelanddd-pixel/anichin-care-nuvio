/*
 * Animexin - Nuvio provider
 * Uses only publicly accessible pages and media URLs.
 * Does not bypass challenges, login requirements, tokens, or access restrictions.
 *
 * Site-specific settings are the four variables below. Everything between the
 * SHARED ENGINE markers is identical in anichin-care.js, animexin.js and
 * donghuaking.js (all three sites use the same WordPress theme). Edit it in
 * anichin-care.js, then run `node tools/sync-engine.js`; the contract test fails if they differ.
 */
var VERSION = "1.0.0";
var PROVIDER = "Animexin";
var LOG_NAME = "AnimexinCare";
var BASE = "https://animexin.dev";

/* ==== SHARED ENGINE START ==== */
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var MAX_RESULTS = 16;
var REQUEST_BUDGET_MS = 45000;
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";

// Hosts whose embed pages this provider knows how to read (subdomains included).
var KNOWN_HOSTS = /(?:^|\.)(?:ok\.ru|odnoklassniki\.ru|rumble\.com|dailymotion\.com|dmcdn\.net|dai\.ly|d\.tube|dtube\.video|odysee\.com|odysee\.tv|lbry\.tv)$/;
var OKRU_QUALITY = { mobile: 144, lowest: 240, low: 360, sd: 480, hd: 720, full: 1080, quad: 1440, ultra: 2160 };
// Words that describe the release rather than the series; ignored when comparing titles.
var NOISE_WORDS = /\b(?:episode|eps?)\s*\d+(?:\.\d+)?(?:\s+\d+)?\b|\b(?:sub|subs|subtitle|subtitles|indo|indonesia|indonesian|english|eng|hardsub|softsub|dub|dubbed)\b/g;

function log(msg) {
  try { console.log("[" + LOG_NAME + " v" + VERSION + "] " + String(msg)); } catch (e) {}
}
function decodeHtml(s) {
  // &amp; is decoded last so "&amp;quot;" becomes "&quot;" and not a quote.
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, x) { return String.fromCharCode(parseInt(x, 16)); })
    .replace(/&#([0-9]+);/g, function (_, x) { return String.fromCharCode(parseInt(x, 10)); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function stripTags(s) {
  return decodeHtml(String(s || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function absUrl(u, base) {
  u = decodeHtml(String(u || "").trim());
  if (!u || /^(?:javascript|data|mailto|tel):|^#/i.test(u) || /[\s<>"]/.test(u)) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  var b = String(base || BASE);
  var origin = /^(https?:\/\/[^/?#]+)/i.exec(b);
  if (!origin) return "";
  if (u.charAt(0) === "/") return origin[1] + u;
  var dir = b.split("#")[0].split("?")[0];
  dir = dir.substring(0, dir.lastIndexOf("/") + 1);
  if (dir.length <= origin[1].length) dir = origin[1] + "/";
  return dir + u;
}
function hostOf(u) {
  var m = /^https?:\/\/([^/:?#]+)/i.exec(String(u || ""));
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}
function sameUrl(a, b) {
  function clean(u) { return String(u || "").split("#")[0].replace(/\/+$/, "").toLowerCase(); }
  return clean(a) === clean(b);
}
function isKnownHost(h) { return KNOWN_HOSTS.test(h || ""); }
function isMedia(u) { return /\.(?:m3u8|mp4)(?:$|[?#])/i.test(String(u || "")); }
function sourceName(h) {
  if (/(?:^|\.)(?:ok\.ru|odnoklassniki\.ru|okcdn\.ru|mycdn\.me)$/.test(h)) return "OK.ru";
  if (/(?:^|\.)(?:rumble\.com|rumble\.cloud|rmbl\.ws)$/.test(h)) return "Rumble";
  if (/(?:^|\.)(?:dailymotion\.com|dmcdn\.net|dai\.ly)$/.test(h)) return "Dailymotion";
  if (/(?:^|\.)(?:odysee\.com|odysee\.tv|odycdn\.com|lbry\.tv)$/.test(h)) return "Odysee";
  return h || PROVIDER;
}
function compact(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function unique(items) {
  var seen = {}, out = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i] && !seen[items[i]]) { seen[items[i]] = true; out.push(items[i]); }
  }
  return out;
}

/* ---------- Title matching ---------- */
function norm(s) {
  return stripTags(s).toLowerCase().replace(/&/g, " and ")
    .replace(/\b(donghua|sub indo|subtitle indonesia)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function scoreNorm(s) {
  return norm(s).replace(NOISE_WORDS, " ").replace(/\bend\s*$/, " ").replace(/\s+/g, " ").trim();
}
function tokensOf(s) { return unique(scoreNorm(s).split(" ")); }
// True when two strings differ by at most one substitution, insertion, deletion or adjacent swap.
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
// Sites misspell titles ("Deamon Hunter", "Steller"); tolerate one typo in words of 5+ letters.
function sameToken(a, b) { return a === b || (a.length >= 5 && b.length >= 5 && withinOneEdit(a, b)); }
function scoreTokens(aa, bb) {
  if (!aa.length || !bb.length) return 0;
  var used = {}, hit = 0, i, j;
  for (i = 0; i < aa.length; i++) {
    for (j = 0; j < bb.length; j++) {
      if (!used[j] && sameToken(aa[i], bb[j])) { used[j] = true; hit++; break; }
    }
  }
  return (2 * hit) / (aa.length + bb.length);
}
// "Gu An [One Slash to the Heavens]" is also known as "Gu An" and as "One Slash to the Heavens".
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
  for (var i = 0; i < av.length; i++) {
    for (var j = 0; j < bv.length; j++) {
      var sc = scoreTokens(tokensOf(av[i]), tokensOf(bv[j]));
      if (sc > best) best = sc;
    }
  }
  return best;
}
function seasonMarker(normalized) {
  var m = /\bseason (\d+)\b/.exec(normalized) || /\bs(\d{1,2})\b/.exec(normalized) ||
          /\b(\d+)(?:st|nd|rd|th) season\b/.exec(normalized);
  return m ? Number(m[1]) : 0;
}

/* ---------- HTTP ---------- */
function fetchText(url, referer, deadline, extraHeaders) {
  if (Date.now() > deadline) return Promise.resolve(null);
  var headers = { "User-Agent": UA, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "id-ID,id;q=0.9,en;q=0.7" };
  if (referer) headers.Referer = referer;
  if (extraHeaders) {
    for (var k in extraHeaders) if (Object.prototype.hasOwnProperty.call(extraHeaders, k)) headers[k] = extraHeaders[k];
  }
  return fetch(url, { method: "GET", headers: headers, redirect: "follow" }).then(function (r) {
    return r.text().then(function (body) {
      // Some fetch polyfills omit `status`; fall back to `ok` instead of treating it as a failure.
      var status = Number(r.status);
      if (!status) status = r.ok === false ? 500 : 200;
      if (status === 403 || status === 429 || status === 503) {
        log("Access denied with HTTP " + status + " on " + hostOf(url) + "; access restrictions will not be bypassed");
        return null;
      }
      if (status < 200 || status >= 400) { log("HTTP " + status + " on " + hostOf(url)); return null; }
      if (/cf-browser-verification|challenge-platform|just a moment/i.test(String(body || "").slice(0, 12000))) {
        log("challenge page detected on " + hostOf(url));
        return null;
      }
      return { url: r.url || url, text: String(body || ""), status: status };
    });
  }).catch(function (e) {
    log("Request failed for " + hostOf(url) + ": " + (e && e.message ? e.message : e));
    return null;
  });
}

/* ---------- TMDB ---------- */
function tmdbApi(path, deadline) {
  var url = "https://api.themoviedb.org/3/" + path, headers = {};
  // v4 read-access tokens are JWTs and go in a header; v3 keys go in the query string.
  if (/^eyJ/.test(TMDB_KEY) || TMDB_KEY.length > 40) headers.Authorization = "Bearer " + TMDB_KEY;
  else url += (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + encodeURIComponent(TMDB_KEY);
  return fetchText(url, "https://www.themoviedb.org/", deadline, headers);
}
function tmdbMeta(name, original) {
  var titles = unique([name ? String(name) : "", original && norm(original) ? String(original) : ""]);
  return titles.length ? { title: titles[0], titles: titles } : null;
}
function tmdbWebTitle(id, kind, deadline) {
  return fetchText("https://www.themoviedb.org/" + kind + "/" + encodeURIComponent(id) + "?language=en-US", null, deadline).then(function (r) {
    if (!r) return null;
    var m = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(r.text) ||
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(r.text);
    var t = m ? decodeHtml(m[1]).replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim() : "";
    return t ? tmdbMeta(t, "") : null;
  });
}
function tmdbTitle(id, type, deadline) {
  var kind = type === "movie" ? "movie" : "tv";
  var cleanId = String(id == null ? "" : id).replace(/^tmdb:/i, "").trim();
  if (!/^\d+$/.test(cleanId)) { log("Unsupported TMDB id: " + id); return Promise.resolve(null); }
  var viaApi = Promise.resolve(null);
  if (TMDB_KEY) {
    viaApi = tmdbApi(kind + "/" + cleanId + "?language=en-US", deadline).then(function (r) {
      if (!r) return null;
      try {
        var j = JSON.parse(r.text);
        return tmdbMeta(j.name || j.title || j.original_name || j.original_title, j.original_name || j.original_title);
      } catch (e) { return null; }
    });
  } else {
    log("TMDB_API_KEY is not available in the Nuvio runtime; using the TMDB web page instead");
  }
  return viaApi.then(function (meta) { return meta || tmdbWebTitle(cleanId, kind, deadline); });
}

/* ---------- Search ---------- */
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
function rankCandidates(items, title, season) {
  var ranked = [];
  for (var i = 0; i < items.length; i++) {
    var score = titleScore(items[i].title, title);
    var marker = seasonMarker(norm(items[i].title));
    // tier 2 = right season, 1 = no season marker (could be a long single-page series), 0 = wrong season.
    // Tier is sorted before score: otherwise an unmarked "Title" page (score 1.0) beats "Title Season 2".
    var tier;
    if (season > 1) tier = marker === season ? 2 : (marker ? 0 : 1);
    else tier = marker > 1 ? 0 : 2;
    if (tier === 0) score -= 0.35;
    else if (season > 1 && tier === 2) score += 0.2;
    if (score >= 0.48) ranked.push({ url: items[i].url, title: items[i].title, score: score, tier: tier });
  }
  ranked.sort(function (a, b) { return b.tier - a.tier || b.score - a.score; });
  return ranked.slice(0, 8);
}
function searchTitle(title, season, deadline) {
  return wpSearch(title, deadline).then(function (items) {
    var ranked = rankCandidates(items, title, season);
    if (ranked.length) return ranked;
    // The REST search can return only unrelated posts; try the site's HTML search too.
    return htmlSearch(title, deadline).then(function (html) { return rankCandidates(html, title, season); });
  });
}
function findSeries(titles, season, deadline) {
  var i = 0;
  function next() {
    if (i >= titles.length) return Promise.resolve([]);
    var t = titles[i++];
    return searchTitle(t, season, deadline).then(function (ranked) { return ranked.length ? ranked : next(); });
  }
  return next();
}

/* ---------- Episode + mirror parsing ---------- */
function episodeNumber(label, url) {
  var s = stripTags(label || "");
  var m = /\b(?:episode|eps?)\s*0*(\d+(?:\.\d+)?)/i.exec(s) ||
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
function slugText(u) { return String(u || "").replace(/^https?:\/\/[^/]+/i, "").replace(/[-_/.]+/g, " "); }
// Episode pages also link to other series' episodes (widgets); among equal numbers prefer the right series.
function pickEpisode(eps, e, title) {
  var best = null, bestScore = -1;
  for (var i = 0; i < eps.length; i++) {
    if (eps[i].num !== e) continue;
    var sc = title ? titleScore(eps[i].label + " " + slugText(eps[i].url), title) : 0;
    if (sc > bestScore) { best = eps[i]; bestScore = sc; }
  }
  return best;
}
// Movie pages on this theme can hold only the episode list; the player is on the linked page.
function firstEpisodeLink(html, pageUrl) {
  var m = /class=["'][^"']*eplister[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i.exec(html);
  return m ? absUrl(m[1], pageUrl) : "";
}
function decodeBase64(s) {
  var clean = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  try {
    if (typeof atob === "function") return atob(clean);
  } catch (e) {}
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var input = clean.replace(/[^A-Za-z0-9+/]/g, "");
  var out = "", bits = 0, acc = 0;
  for (var i = 0; i < input.length; i++) {
    var v = chars.indexOf(input.charAt(i));
    if (v < 0) continue;
    acc = ((acc << 6) | v) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 255); }
  }
  return out;
}
function parseServerLinks(html, pageUrl) {
  var out = [], seen = {};
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
    if (!isKnownHost(h) && !isMedia(u)) return;
    seen[u] = true; out.push({ url: u, label: stripTags(label) || sourceName(h) });
  }
  var sel = /<select\b[^>]*(?:class|name|id)=["'][^"']*mirror[^"']*["'][^>]*>([\s\S]*?)<\/select>/gi, sm;
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

/* ---------- Resolvers ---------- */
// Items: { url, quality ("720p" | "Auto"), height, referer, trusted }. resolveServer adds serverLabel + source.
// Generic scan: media URLs published as plain text in HTML or JSON.
function directMediaUrls(text, pageUrl) {
  var src = String(text || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  var found = [], seen = {}, re = /https?:[^"'\s<>\\]+/gi, m;
  while ((m = re.exec(src)) && found.length < MAX_RESULTS) {
    var u = absUrl(m[0].replace(/[),;]+$/, ""), pageUrl);
    if (!u || !isMedia(u) || !hostOf(u) || seen[u]) continue;
    seen[u] = true;
    found.push(u);
  }
  return found;
}
function genericItems(text, pageUrl) {
  return directMediaUrls(text, pageUrl).map(function (u) { return { url: u, referer: pageUrl }; });
}
function resolveGeneric(server, deadline) {
  return fetchText(server.url, BASE + "/", deadline).then(function (r) {
    if (!r) return [];
    var items = genericItems(r.text, r.url);
    if (!items.length) log("No public media URL found in the " + hostOf(server.url) + " embed page");
    return items;
  });
}

function okruInfo(html) {
  var re = /data-options=(["'])([\s\S]*?)\1/gi, m, raw = null;
  while ((m = re.exec(html))) { if (/flashvars/.test(m[2])) { raw = m[2]; break; } }
  if (!raw) return null;
  var opts;
  try { opts = JSON.parse(decodeHtml(raw)); } catch (e) { return null; }
  var fv = opts && opts.flashvars;
  if (!fv) return null;
  var md = fv.metadata;
  if (typeof md === "string") { try { md = JSON.parse(md); } catch (e2) { md = null; } }
  var metaUrl = "";
  if (fv.metadataUrl) { try { metaUrl = decodeURIComponent(String(fv.metadataUrl)); } catch (e3) { metaUrl = String(fv.metadataUrl); } }
  return { metadata: md && typeof md === "object" ? md : null, metadataUrl: metaUrl };
}
function okruItems(md, referer) {
  var out = [], seen = {};
  function push(u, height) {
    u = absUrl(u, referer);
    if (!u || seen[u]) return;
    seen[u] = true;
    // OK.ru MP4 URLs carry no file extension, so they are flagged as trusted media.
    out.push({ url: u, quality: height ? height + "p" : "Auto", height: height || 0, referer: referer, trusted: true });
  }
  var videos = Array.isArray(md.videos) ? md.videos : [];
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i] || {};
    if (v.url) push(String(v.url), OKRU_QUALITY[String(v.name || "").toLowerCase()] || 0);
  }
  ["hlsManifestUrl", "ondemandHls", "hlsMasterPlaylistUrl"].forEach(function (key) {
    if (typeof md[key] === "string" && md[key]) push(md[key], 0);
  });
  out.sort(function (a, b) { return b.height - a.height; });
  return out;
}
function resolveOkru(server, deadline) {
  return fetchText(server.url, BASE + "/", deadline).then(function (r) {
    if (!r) return [];
    var info = okruInfo(r.text);
    if (!info) {
      log("OK.ru: no data-options with flashvars (video removed or page changed)");
      return genericItems(r.text, r.url);
    }
    function fromMetadata(md) {
      if (!md) return [];
      if (md.error) log("OK.ru: " + stripTags(String(md.error)));
      var items = okruItems(md, r.url);
      return items.length ? items : genericItems(JSON.stringify(md), r.url);
    }
    if (info.metadata) return fromMetadata(info.metadata);
    if (info.metadataUrl) {
      return fetchText(absUrl(info.metadataUrl, r.url), r.url, deadline).then(function (mr) {
        if (!mr) return [];
        try { return fromMetadata(JSON.parse(mr.text)); } catch (e) { log("OK.ru: metadata is not valid JSON"); return []; }
      });
    }
    log("OK.ru: flashvars has no metadata");
    return [];
  });
}

function dailymotionId(u) {
  var m = /dailymotion\.com\/(?:embed\/)?video\/([a-z0-9]+)/i.exec(u) || /dai\.ly\/([a-z0-9]+)/i.exec(u) || /[?&]video=([a-z0-9]+)/i.exec(u);
  return m ? m[1] : "";
}
function resolveDailymotion(server, deadline) {
  var id = dailymotionId(server.url);
  if (!id) return resolveGeneric(server, deadline);
  var api = "https://www.dailymotion.com/player/metadata/video/" + encodeURIComponent(id);
  return fetchText(api, server.url, deadline).then(function (r) {
    var out = [];
    if (r) {
      try {
        var j = JSON.parse(r.text);
        if (j.error) log("Dailymotion: " + stripTags(String(j.error.message || j.error.title || j.error)));
        var q = j.qualities || {};
        Object.keys(q).forEach(function (key) {
          (Array.isArray(q[key]) ? q[key] : []).forEach(function (entry) {
            var u = absUrl(entry && entry.url, api);
            if (!u) return;
            var height = /^\d+$/.test(key) ? Number(key) : 0;
            out.push({ url: u, quality: height ? height + "p" : "Auto", height: height, referer: "https://www.dailymotion.com/", trusted: true });
          });
        });
        out.sort(function (a, b) { return b.height - a.height; });
      } catch (e) { log("Dailymotion: metadata is not valid JSON"); }
    }
    return out.length ? out : resolveGeneric(server, deadline);
  });
}

function resolveRumble(server, deadline) {
  var m = /rumble\.com\/embed\/([a-z0-9]+)/i.exec(server.url);
  if (!m) return resolveGeneric(server, deadline);
  var apiUrl = "https://rumble.com/embedJS/u3/?request=video&ver=2&v=" + encodeURIComponent(m[1]);
  return fetchText(apiUrl, server.url, deadline).then(function (r) {
    if (!r) return [];
    try {
      var data = JSON.parse(r.text);
      var formats = data && data.ua && data.ua.mp4;
      var out = [], seen = {};
      if (formats && typeof formats === "object") {
        Object.keys(formats).forEach(function (key) {
          var item = formats[key] || {};
          var u = String(item.url || "");
          if (!/^https?:\/\//i.test(u) || seen[u]) return;
          seen[u] = true;
          var meta = item.meta || {};
          var height = Number(meta.h || meta.height || key || 0);
          var quality = height > 0 ? height + "p" : (/^\d+$/.test(key) ? key + "p" : "Auto");
          out.push({ url: u, quality: quality, height: height, referer: server.url, trusted: true });
        });
      }
      out.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
      if (out.length) {
        log("Rumble provides " + out.length + " public MP4 variants");
        return out.slice(0, MAX_RESULTS);
      }
    } catch (e) {
      log("Unable to read Rumble quality metadata");
    }
    return genericItems(r.text, r.url).map(function (it) { it.referer = server.url; return it; });
  });
}
function resolveServer(server, deadline) {
  var h = hostOf(server.url), items;
  if (isMedia(server.url)) {
    items = Promise.resolve([{ url: server.url, referer: BASE + "/" }]);
  } else if (!isKnownHost(h)) {
    items = Promise.resolve([]);
  } else if (/(?:^|\.)(?:ok\.ru|odnoklassniki\.ru)$/.test(h)) {
    items = resolveOkru(server, deadline);
  } else if (/(?:^|\.)(?:dailymotion\.com|dmcdn\.net|dai\.ly)$/.test(h)) {
    items = resolveDailymotion(server, deadline);
  } else if (h === "rumble.com" && /\/embed\//i.test(server.url)) {
    items = resolveRumble(server, deadline);
  } else {
    items = resolveGeneric(server, deadline);
  }
  var source = sourceName(h);
  return items.then(function (list) {
    for (var i = 0; i < list.length; i++) { list[i].source = source; list[i].serverLabel = server.label; }
    return list;
  });
}

/* ---------- Stream assembly ---------- */
function resolutionOf(s) {
  var m = /(?:^|[^0-9])(2160|1440|1080|720|480|360|240|144)p(?:[^0-9]|$)/i.exec(String(s || ""));
  return m ? m[1] : "";
}
function buildStreams(resolved, pageUrl) {
  var rows = [], seen = {};
  for (var a = 0; a < resolved.length; a++) {
    for (var b = 0; b < resolved[a].length; b++) {
      var item = resolved[a][b];
      if (!item || !item.url) continue;
      // Drop only the fragment: signed URLs may share a path but differ by query token.
      var key = String(item.url).split("#")[0];
      if (seen[key]) continue;
      seen[key] = true;
      // Expose direct media only, not watch/embed pages (trusted = extensionless media API URLs).
      if (!item.trusted && !isMedia(item.url)) continue;
      var source = item.source || sourceName(hostOf(item.url));
      // The site's own option text ("Hardsub Indonesia Ok.ru AX") carries the subtitle language; keep it.
      var serverLabel = stripTags(item.serverLabel || "");
      if (/^(server|mirror|auto)$/i.test(serverLabel)) serverLabel = "";
      var res = resolutionOf(item.quality) || resolutionOf(item.url) || resolutionOf(serverLabel);
      var quality = res ? res + "p" : (item.quality || serverLabel || source);
      var parts = [];
      if (serverLabel) parts.push(serverLabel);
      if (!serverLabel || compact(serverLabel).indexOf(compact(source)) < 0) parts.push(source);
      if (res && compact(serverLabel).indexOf(res + "p") < 0) parts.push(res + "p");
      rows.push({
        order: rows.length,
        indo: /\bindo(?:nesia)?\b/i.test(serverLabel),
        stream: {
          name: source,
          title: parts.join(" • "),
          url: item.url,
          quality: quality,
          headers: { "Referer": item.referer || pageUrl, "User-Agent": UA }
        }
      });
    }
  }
  // Indonesian-subtitle options first, otherwise keep the site's order; then cap the list.
  rows.sort(function (x, y) { return (y.indo ? 1 : 0) - (x.indo ? 1 : 0) || x.order - y.order; });
  return rows.slice(0, MAX_RESULTS).map(function (row) { return row.stream; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase();
  type = (type === "movie" || type === "film") ? "movie" : "tv";
  var s = Math.max(1, Number(season) || 1);
  var e = Math.max(1, Number(episode) || 1);
  var deadline = Date.now() + REQUEST_BUDGET_MS;
  log("start type=" + type + " id=" + tmdbId + (type === "tv" ? " S" + s + "E" + e : ""));
  return tmdbTitle(tmdbId, type, deadline).then(function (meta) {
    if (!meta || !meta.title) { log("TMDB title is unavailable"); return []; }
    log("TMDB title: " + meta.titles.join(" / "));
    return findSeries(meta.titles, s, deadline).then(function (candidates) {
      if (!candidates.length) { log("Title not found in public search results"); return []; }
      var pageTasks = candidates.map(function (candidate) {
        return fetchText(candidate.url, BASE + "/", deadline).then(function (r) {
          if (!r) return null;
          if (type === "movie") return { page: r };
          var hit = pickEpisode(parseEpisodes(r.text, r.url), e, candidate.title);
          if (hit) return sameUrl(hit.url, r.url) ? { page: r } : { pageUrl: hit.url };
          // The search may have returned the episode post itself rather than the series page.
          var own = /\bepisode\s*0*(\d+(?:\.\d+)?)/i.exec(candidate.title);
          if (own && Number(own[1]) === e) return { page: r };
          return null;
        });
      });
      return Promise.all(pageTasks).then(function (results) {
        var chosen = null;
        for (var k = 0; k < results.length; k++) if (results[k]) { chosen = results[k]; break; }
        if (!chosen) { log("No matching page or episode was found"); return []; }
        var pagePromise = chosen.page ? Promise.resolve(chosen.page) : fetchText(chosen.pageUrl, BASE + "/", deadline);
        return pagePromise.then(function (page) {
          if (!page) return null;
          var servers = parseServerLinks(page.text, page.url);
          if (servers.length || type !== "movie") return { page: page, servers: servers };
          var next = firstEpisodeLink(page.text, page.url);
          if (!next || sameUrl(next, page.url)) return { page: page, servers: servers };
          return fetchText(next, BASE + "/", deadline).then(function (watch) {
            return watch ? { page: watch, servers: parseServerLinks(watch.text, watch.url) } : { page: page, servers: [] };
          });
        }).then(function (found) {
          if (!found) return [];
          log("Mirrors found: " + found.servers.length);
          if (!found.servers.length) return [];
          return Promise.all(found.servers.map(function (server) {
            return Promise.resolve().then(function () { return resolveServer(server, deadline); }).catch(function (err) {
              log("Resolver error for " + hostOf(server.url) + ": " + (err && err.message ? err.message : err));
              return [];
            });
          })).then(function (resolved) {
            var streams = buildStreams(resolved, found.page.url);
            log("Direct streams found: " + streams.length);
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
/* ==== SHARED ENGINE END ==== */
