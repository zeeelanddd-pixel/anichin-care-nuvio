// providers/anichin-care.js — VERSI DIAGNOSTIK
const BASE_URL = 'https://anichin.moe';
const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL
};

function dbg(title, url) {
  return {
    name: 'DEBUG: ' + title,
    title: title,
    url: url || 'https://example.com/',
    quality: 'DEBUG',
    size: '?',
    headers: WORKING_HEADERS,
    provider: 'anichin-care'
  };
}

function getTitleFromTmdb(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId +
              '?api_key=' + TMDB_API_KEY + '&language=en-US';
  console.log('[Anichin] STEP 1: TMDB fetch', url);
  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var t = data.name || data.original_name || data.title || data.original_title || '';
      console.log('[Anichin] STEP 1 result:', t);
      return t;
    })
    .catch(function (e) {
      console.log('[Anichin] STEP 1 ERROR:', e.message);
      return '';
    });
}

function searchAnichin(title) {
  if (!title) return Promise.resolve('');
  var searchUrl = BASE_URL + '/?s=' + encodeURIComponent(title);
  console.log('[Anichin] STEP 2: search', searchUrl);
  return fetch(searchUrl, { headers: WORKING_HEADERS })
    .then(function (res) {
      console.log('[Anichin] STEP 2 status:', res.status);
      return res.text();
    })
    .then(function (html) {
      console.log('[Anichin] STEP 2 HTML length:', html.length);
      var cheerio = require('cheerio-without-node-native');
      var $ = cheerio.load(html);
      var slug = '';
      var count = 0;
      $('.bsx').each(function (i, el) {
        count++;
        if (slug) return;
        var href = $(el).find('a.tip').attr('href') || $(el).find('a').first().attr('href') || '';
        if (!href) return;
        var clean = href.replace(/\/$/, '');
        var parts = clean.split('/');
        var last = parts[parts.length - 1];
        if (last && last.length > 2 && !last.includes('?') && !last.includes('.')) {
          slug = last;
        }
      });
      console.log('[Anichin] STEP 2 .bsx count:', count, '| slug:', slug);
      return slug;
    })
    .catch(function (e) {
      console.log('[Anichin] STEP 2 ERROR:', e.message);
      return '';
    });
}

function buildEpisodeUrls(slug, episodeNum) {
  return [
    BASE_URL + '/' + slug + '-episode-' + episodeNum + '/',
    BASE_URL + '/watch/' + slug + '-episode-' + episodeNum + '/',
    BASE_URL + '/' + slug + '/episode-' + episodeNum + '/',
    BASE_URL + '/' + slug + '-episode-' + episodeNum,
    BASE_URL + '/watch/' + slug + '-episode-' + episodeNum
  ];
}

function extractStreamsFromHtml(html, title, episodeNum) {
  var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var match;
  var urls = [];
  var seen = {};
  while ((match = iframeRegex.exec(html)) !== null) {
    var src = match[1];
    if (src && src !== 'about:blank' && !seen[src]) {
      seen[src] = true;
      urls.push(src);
    }
  }
  if (urls.length === 0) {
    var m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
    var m3u8Match;
    while ((m3u8Match = m3u8Regex.exec(html)) !== null) {
      var m3u8 = m3u8Match[1];
      if (!seen[m3u8]) { seen[m3u8] = true; urls.push(m3u8); }
    }
  }
  console.log('[Anichin] STEP 4 iframe/m3u8 found:', urls.length);
  return urls.map(function (url, i) {
    var serverName = 'Server ' + (i + 1);
    try { serverName = new URL(url).hostname.replace('www.', ''); } catch (e) {}
    return {
      name: 'Anichin - ' + serverName,
      title: title + ' Episode ' + episodeNum,
      url: url,
      quality: '1080p',
      size: 'Unknown',
      headers: WORKING_HEADERS,
      provider: 'anichin-care'
    };
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    console.log('[Anichin] START tmdbId=' + tmdbId + ' type=' + mediaType + ' ep=' + episodeNum);

    getTitleFromTmdb(tmdbId, mediaType).then(function (title) {
      if (!title) {
        return resolve([dbg('STEP 1 FAILED: TMDB tidak mengembalikan judul (tmdbId=' + tmdbId + ')')]);
      }

      return searchAnichin(title).then(function (slug) {
        if (!slug) {
          return resolve([dbg('STEP 2 FAILED: series tidak ditemukan di Anichin (judul: "' + title + '")')]);
        }

        var urls = buildEpisodeUrls(slug, episodeNum);
        var index = 0;

        function tryNext() {
          if (index >= urls.length) {
            return resolve([dbg('STEP 3 FAILED: tidak ada URL episode valid. Slug="' + slug + '", ep=' + episodeNum)]);
          }
          var episodeUrl = urls[index++];
          console.log('[Anichin] STEP 3 trying:', episodeUrl);

          fetch(episodeUrl, { headers: WORKING_HEADERS })
            .then(function (res) {
              console.log('[Anichin] STEP 3 status:', res.status, 'for', episodeUrl);
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.text();
            })
            .then(function (html) {
              console.log('[Anichin] STEP 3 HTML length:', html.length);
              var streams = extractStreamsFromHtml(html, title, episodeNum);
              if (streams.length === 0) return tryNext();
              resolve(streams);
            })
            .catch(function (e) {
              console.log('[Anichin] STEP 3 ERROR:', e.message);
              tryNext();
            });
        }
        tryNext();
      });
    }).catch(function (err) {
      console.log('[Anichin] FATAL:', err.message);
      resolve([dbg('FATAL ERROR: ' + err.message)]);
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
