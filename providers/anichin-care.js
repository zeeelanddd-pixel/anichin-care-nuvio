// providers/anichin-care.js
// Strategi baru: ?s= search → fetch series page → cari episode link → extract player

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
    .then(function (d) {
      return d.name || d.original_name || d.title || d.original_title || '';
    })
    .catch(function () { return ''; });
}

// STEP 2: Search pakai ?s= saja
function searchAnichin(title) {
  if (!title) return Promise.resolve('');
  var url = BASE_URL + '/?s=' + encodeURIComponent(title);
  console.log('[Anichin] Search:', url);

  return fetch(url, { headers: WORKING_HEADERS })
    .then(function (r) {
      console.log('[Anichin] Search status:', r.status, '| finalUrl:', r.url);
      // Kalau redirect ke homepage, berarti pencarian diblokir
      if (r.url && r.url.replace(/\/$/, '') === BASE_URL) {
        console.log('[Anichin] Search redirected to homepage - might be blocked');
        return '';
      }
      return r.text();
    })
    .then(function (html) {
      if (!html) return '';
      var cheerio = require('cheerio-without-node-native');
      var $ = cheerio.load(html);
      var slug = '';
      $('.bsx').each(function (i, el) {
        if (slug) return;
        var href = $(el).find('a.tip').attr('href') || $(el).find('a').first().attr('href') || '';
        if (!href) return;
        if (href.indexOf('-episode-') !== -1) return; // skip episode links
        var clean = href.replace(/\/$/, '');
        var parts = clean.split('/');
        var last = parts[parts.length - 1];
        if (last && last.length > 2 && last.indexOf('?') === -1) slug = last;
      });
      console.log('[Anichin] Slug from search:', slug);
      return slug;
    })
    .catch(function (e) {
      console.log('[Anichin] Search error:', e.message);
      return '';
    });
}

// STEP 3: Fetch series page
function fetchSeriesPage(slug) {
  var url = BASE_URL + '/' + slug + '/';
  console.log('[Anichin] Fetch series page:', url);
  return fetch(url, { headers: WORKING_HEADERS })
    .then(function (r) {
      console.log('[Anichin] Series status:', r.status, '| finalUrl:', r.url);
      if (r.url && r.url.replace(/\/$/, '') === BASE_URL) {
        throw new Error('Series page redirected to homepage');
      }
      return r.text();
    });
}

// STEP 4: Cari link episode di halaman series (atau return '' untuk film)
function findEpisodeUrl(seriesHtml, episodeNum) {
  var cheerio = require('cheerio-without-node-native');
  var $ = cheerio.load(seriesHtml);
  var found = '';

  $('a').each(function (i, el) {
    if (found) return;
    var href = $(el).attr('href');
    if (!href) return;
    // Harus link episode
    if (href.indexOf('-episode-') === -1 && href.indexOf('/episode/') === -1) return;

    // Coba ekstrak nomor episode dari URL
    var m = href.match(/-episode-(\d+)/i) || href.match(/episode-?(\d+)/i) || href.match(/episode\/(\d+)/i);
    var num = m ? parseInt(m[1], 10) : null;

    // Fallback: ekstrak dari teks anchor
    if (!num) {
      var t = $(el).text().match(/(\d+)/);
      if (t) num = parseInt(t[1], 10);
    }

    if (num === episodeNum) {
      found = href;
    }
  });

  console.log('[Anichin] Episode link found:', found || '(none - assume movie)');
  return found;
}

// STEP 5: Extract player dari halaman episode/movie
function extractStreamsFromHtml(html, title, episodeNum) {
  var cheerio = require('cheerio-without-node-native');
  var $ = cheerio.load(html);
  var streams = [];
  var seen = {};

  function add(url, name) {
    if (!url || !url.match(/^https?:/)) return;
    if (url.indexOf('anichin.moe') !== -1) return; // jangan ambil link internal
    if (url === 'about:blank') return;
    if (seen[url]) return;
    seen[url] = true;
    var server = name || '';
    try { server = new URL(url).hostname.replace('www.', ''); } catch (e) {}
    streams.push({ url: url, server: server });
  }

  // Metode 1: iframe
  $('iframe').each(function (i, el) {
    add($(el).attr('src'), null);
  });

  // Metode 2: select.mirror > option[value]
  $('select option').each(function (i, el) {
    var v = $(el).attr('value') || $(el).val();
    if (v && v.match(/^https?:/)) add(v, $(el).text().trim());
  });

  // Metode 3: data-video / data-src / data-embed
  $('[data-video], [data-src], [data-embed]').each(function (i, el) {
    add($(el).attr('data-video') || $(el).attr('data-src') || $(el).attr('data-embed'), null);
  });

  // Metode 4: regex m3u8/mp4 di HTML mentah
  if (streams.length === 0) {
    var re = /(https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/gi;
    var m;
    while ((m = re.exec(html)) !== null) add(m[1], null);
  }

  console.log('[Anichin] Streams extracted:', streams.length);

  return streams.map(function (s, i) {
    return {
      name: 'Anichin - ' + (s.server || ('Server ' + (i + 1))),
      title: title + ' Episode ' + episodeNum,
      url: s.url,
      quality: '1080p',
      size: 'Unknown',
      headers: WORKING_HEADERS,
      provider: 'anichin-care'
    };
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    console.log('[Anichin] START tmdb=' + tmdbId + ' ep=' + episodeNum);

    getTitleFromTmdb(tmdbId, mediaType)
      .then(function (title) {
        if (!title) { console.log('[Anichin] No title'); return resolve([]); }
        console.log('[Anichin] Title:', title);

        return searchAnichin(title).then(function (slug) {
          if (!slug) { console.log('[Anichin] No slug'); return resolve([]); }

          return fetchSeriesPage(slug).then(function (seriesHtml) {
            var episodeUrl = findEpisodeUrl(seriesHtml, episodeNum);
            var targetUrl = episodeUrl || (BASE_URL + '/' + slug + '/');

            console.log('[Anichin] Player page:', targetUrl);

            return fetch(targetUrl, { headers: WORKING_HEADERS })
              .then(function (r) {
                console.log('[Anichin] Player status:', r.status, '| finalUrl:', r.url);
                return r.text();
              })
              .then(function (playerHtml) {
                var streams = extractStreamsFromHtml(playerHtml, title, episodeNum);
                resolve(streams);
              });
          });
        });
      })
      .catch(function (e) {
        console.log('[Anichin] Fatal:', e.message);
        resolve([]);
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
                    }
