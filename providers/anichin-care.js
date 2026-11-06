// providers/anichin-care.js
const BASE_URL = 'https://anichin.moe';
const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL
};

function getTitleFromTmdb(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId +
              '?api_key=' + TMDB_API_KEY + '&language=en-US';
  return fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (d) { return d.name || d.original_name || d.title || d.original_title || ''; })
    .catch(function () { return ''; });
}

function isHomepage(url) {
  if (!url) return false;
  var u = url.replace(/\/$/, '');
  var b = BASE_URL.replace(/\/$/, '');
  return u === b;
}

function searchAnichin(title) {
  if (!title) return Promise.resolve('');
  var url = BASE_URL + '/?s=' + encodeURIComponent(title);
  return fetch(url, { headers: WORKING_HEADERS })
    .then(function (r) {
      if (isHomepage(r.url)) throw new Error('search redirected');
      return r.text();
    })
    .then(function (html) {
      var cheerio = require('cheerio-without-node-native');
      var $ = cheerio.load(html);
      var slug = '';
      $('.bsx').each(function (i, el) {
        if (slug) return;
        var href = $(el).find('a.tip').attr('href') || $(el).find('a').first().attr('href') || '';
        if (!href) return;
        var clean = href.replace(/\/$/, '');
        var parts = clean.split('/');
        var last = parts[parts.length - 1];
        if (last && last.length > 2 && last.indexOf('?') === -1 && last.indexOf('-episode-') === -1) {
          slug = last;
        }
      });
      return slug;
    })
    .catch(function () { return ''; });
}

function extractStreamsFromHtml(html) {
  var cheerio = require('cheerio-without-node-native');
  var $ = cheerio.load(html);
  var streams = [];
  var seen = {};

  function add(url, name) {
    if (!url || !/^https?:/.test(url)) return;
    if (url.indexOf('anichin.moe') !== -1) return;
    if (url === 'about:blank') return;
    if (seen[url]) return;
    seen[url] = true;
    var server = name || '';
    try { server = new URL(url).hostname.replace('www.', ''); } catch (e) {}
    streams.push({ url: url, server: server });
  }

  $('iframe').each(function (i, el) { add($(el).attr('src'), null); });
  $('select option').each(function (i, el) {
    var v = $(el).attr('value') || $(el).val();
    if (v && /^https?:/.test(v)) add(v, $(el).text().trim());
  });
  $('[data-video], [data-src], [data-embed]').each(function (i, el) {
    add($(el).attr('data-video') || $(el).attr('data-src') || $(el).attr('data-embed'), null);
  });

  if (streams.length === 0) {
    var re = /(https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*)/gi;
    var m;
    while ((m = re.exec(html)) !== null) add(m[1], null);
  }

  return streams;
}

function tryFetchAndExtract(urls, title, episodeNum) {
  return new Promise(function (resolve) {
    var index = 0;
    function next() {
      if (index >= urls.length) return resolve([]);
      var url = urls[index++];
      fetch(url, { headers: WORKING_HEADERS })
        .then(function (r) {
          if (isHomepage(r.url)) throw new Error('redirect to home');
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (html) {
          var streams = extractStreamsFromHtml(html);
          if (streams.length === 0) throw new Error('no streams');
          resolve(streams.map(function (s, i) {
            return {
              name: 'Anichin - ' + (s.server || ('Server ' + (i + 1))),
              title: title + ' Episode ' + episodeNum,
              url: s.url,
              quality: '1080p',
              size: 'Unknown',
              headers: WORKING_HEADERS,
              provider: 'anichin-care'
            };
          }));
        })
        .catch(function () { next(); });
    }
    next();
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    getTitleFromTmdb(tmdbId, mediaType)
      .then(function (title) {
        if (!title) return resolve([]);
        searchAnichin(title).then(function (slug) {
          if (!slug) return resolve([]);

          // ✅ Pattern URL yang benar (dari contoh user):
          // {BASE_URL}/{slug}-episode-{num}-subtitle-indonesia/
          var urls = [
            BASE_URL + '/' + slug + '-episode-' + episodeNum + '-subtitle-indonesia/',
            BASE_URL + '/' + slug + '-episode-' + episodeNum + '/',
            BASE_URL + '/watch/' + slug + '-episode-' + episodeNum + '-subtitle-indonesia/',
            BASE_URL + '/' + slug + '/'   // fallback untuk movie
          ];

          tryFetchAndExtract(urls, title, episodeNum).then(resolve);
        });
      })
      .catch(function () { resolve([]); });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
