// providers/anichin-care.js
// Plugin Anichin dinamis untuk Nuvio (Advanced Search + fallback ?s=)

const BASE_URL = 'https://anichin.moe';
const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL
};

// 1) Ambil judul dari TMDB (en-US)
function getTitleFromTmdb(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId +
              '?api_key=' + TMDB_API_KEY + '&language=en-US';

  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      return data.name || data.original_name || data.title || data.original_title || '';
    })
    .catch(function () { return ''; });
}

// 2) Ambil daftar series via Advanced Search (/seri/) dan cocokkan judul
function searchAnichinAdvanced(title) {
  if (!title) return Promise.resolve('');

  // per_page=100 untuk memperbesar peluang menemukan judul
  var advancedUrl = BASE_URL + '/seri/?per_page=100&order=latest';

  return fetch(advancedUrl, { headers: WORKING_HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var cheerio = require('cheerio-without-node-native');
      var $ = cheerio.load(html);
      var target = title.toLowerCase().trim();
      var slug = '';

      // Parser Anichin: setiap series ada di dalam .bsx
      $('.bsx').each(function (i, el) {
        if (slug) return;
        var link = $(el).find('a.tip').attr('href') || $(el).find('a').first().attr('href') || '';
        var cardTitle = $(el).find('.tt').text().trim() || $(el).find('h2').text().trim() || '';

        if (!link || !cardTitle) return;

        // Cocokkan judul (case-insensitive)
        if (cardTitle.toLowerCase().indexOf(target) !== -1) {
          var clean = link.replace(/\/$/, '');
          var parts = clean.split('/');
          var last = parts[parts.length - 1];
          if (last && last.length > 2 && !last.includes('?') && !last.includes('.')) {
            slug = last;
          }
        }
      });

      return slug;
    })
    .catch(function () { return ''; });
}

// 3) Fallback: pencarian ?s= (lebih akurat untuk judul spesifik)
function searchAnichinFallback(title) {
  if (!title) return Promise.resolve('');

  var searchUrl = BASE_URL + '/?s=' + encodeURIComponent(title);

  return fetch(searchUrl, { headers: WORKING_HEADERS })
    .then(function (res) { return res.text(); })
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

        if (last && last.length > 2 && !last.includes('?') && !last.includes('.')) {
          slug = last;
        }
      });

      return slug;
    })
    .catch(function () { return ''; });
}

// 4) Orkestrasi: Advanced Search dulu, lalu fallback ?s=
function searchAnichin(title) {
  return searchAnichinAdvanced(title).then(function (slug) {
    if (slug) return slug;
    return searchAnichinFallback(title);
  });
}

// 5) Pola URL episode
function buildEpisodeUrls(slug, episodeNum) {
  return [
    BASE_URL + '/' + slug + '-episode-' + episodeNum + '/',
    BASE_URL + '/watch/' + slug + '-episode-' + episodeNum + '/',
    BASE_URL + '/' + slug + '/episode-' + episodeNum + '/',
    BASE_URL + '/' + slug + '-episode-' + episodeNum,
    BASE_URL + '/watch/' + slug + '-episode-' + episodeNum
  ];
}

// 6) Ekstrak stream dari HTML halaman episode
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
      if (!seen[m3u8]) {
        seen[m3u8] = true;
        urls.push(m3u8);
      }
    }
  }

  return urls.map(function (url, i) {
    var serverName = 'Server ' + (i + 1);
    try {
      serverName = new URL(url).hostname.replace('www.', '');
    } catch (e) {}

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

// 7) getStreams utama
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    getTitleFromTmdb(tmdbId, mediaType)
      .then(function (title) {
        if (!title) {
          console.log('[Anichin] Judul tidak ditemukan untuk tmdbId:', tmdbId);
          return resolve([]);
        }

        return searchAnichin(title).then(function (slug) {
          if (!slug) {
            console.log('[Anichin] Series tidak ditemukan untuk judul:', title);
            return resolve([]);
          }

          console.log('[Anichin] Slug ditemukan:', slug, 'untuk:', title);

          var urls = buildEpisodeUrls(slug, episodeNum);
          var index = 0;

          function tryNext() {
            if (index >= urls.length) {
              console.log('[Anichin] Tidak ada URL episode valid untuk slug:', slug);
              return resolve([]);
            }

            var episodeUrl = urls[index++];

            fetch(episodeUrl, { headers: WORKING_HEADERS })
              .then(function (res) {
                if (!res.ok) throw new Error('Status ' + res.status);
                return res.text();
              })
              .then(function (html) {
                var streams = extractStreamsFromHtml(html, title, episodeNum);
                if (streams.length === 0) return tryNext();
                resolve(streams);
              })
              .catch(function () {
                tryNext();
              });
          }

          tryNext();
        });
      })
      .catch(function (err) {
        console.error('[Anichin] Error:', err.message);
        resolve([]);
      });
  });
}

// Ekspor untuk React Native / Hermes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
    }
