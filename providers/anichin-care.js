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
  const url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=en-US';
  return fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (d) { return d.name || d.original_name || d.title || d.original_title || ''; })
    .catch(function () { return ''; });
}

// 1. SEARCH menggunakan WP REST API (menghindari blokir ?s=)
function searchAnichin(title) {
  if (!title) return Promise.resolve('');
  
  // Coba WP REST API dulu
  var wpApiUrl = BASE_URL + '/wp-json/wp/v2/search?search=' + encodeURIComponent(title) + '&per_page=5';
  
  return fetch(wpApiUrl, { headers: WORKING_HEADERS })
    .then(function(res) {
      if (!res.ok) throw new Error('REST API failed');
      return res.json();
    })
    .then(function(data) {
      if (data && data.length > 0) {
        // Ambil URL dari hasil pertama, ekstrak slug-nya
        var link = data[0].url;
        return link.replace(/\/$/, '').split('/').pop();
      }
      throw new Error('No results');
    })
    .catch(function() {
      // Fallback ke ?s= jika REST API gagal
      var url = BASE_URL + '/?s=' + encodeURIComponent(title);
      return fetch(url, { headers: WORKING_HEADERS })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var cheerio = require('cheerio-without-node-native');
          var $ = cheerio.load(html);
          var slug = '';
          $('.bsx').each(function(i, el) {
             if(slug) return;
             var href = $(el).find('a.tip').attr('href') || $(el).find('a').first().attr('href') || '';
             if(href) slug = href.replace(/\/$/, '').split('/').pop();
          });
          return slug;
        });
    });
}

// 2. EKSTRAKSI STREAM DARI HTML (Iframe, Select, Regex, AJAX)
function extractStreams(html) {
  var streams = [];
  var seen = {};
  
  function add(url, name) {
    if (!url || !/^https?:/.test(url)) return;
    if (url.indexOf('anichin.moe') !== -1) return;
    if (seen[url]) return;
    seen[url] = true;
    var server = name || '';
    try { server = new URL(url).hostname.replace('www.', ''); } catch(e) {}
    streams.push({ url: url, server: server });
  }

  // A. Cari <iframe>
  var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var match;
  while ((match = iframeRegex.exec(html)) !== null) add(match[1]);

  // B. Cari <select> option (server list) atau link video
  var cheerio = require('cheerio-without-node-native');
  var $ = cheerio.load(html);
  
  $('select option, .mirror li').each(function(i, el) {
    var val = $(el).val() || $(el).attr('data-video') || $(el).attr('data-src') || $(el).attr('data-url');
    var text = $(el).text().trim();
    if (val && /^https?:/.test(val)) add(val, text);
  });

  // C. Regex untuk host streaming umum (Okru, Dailymotion, dll)
  var hostRegex = /(https?:\/\/(?:[^"'\s<>\\]+\.)?(?:ok\.ru|dailymotion\.com|rumble\.com|odysee\.com|streamruby\.com|vidhide\.com|vidara\.to|d-tube\.net|vidsrc\.me|embed[^"'\s<>\\]+)\/[^"'\s<>\\]+)/gi;
  while ((match = hostRegex.exec(html)) !== null) add(match[1]);

  // D. Deteksi AJAX Player (jika stream dimuat lewat JS)
  var ajaxUrl = null;
  var postId = $('.player').attr('data-post') || $('[data-post]').attr('data-post');
  if (postId) {
    var nume = $('.player').attr('data-nume') || $('[data-nume]').attr('data-nume') || '1';
    var type = $('.player').attr('data-type') || $('[data-type]').attr('data-type') || 'tv';
    ajaxUrl = BASE_URL + '/wp-admin/admin-ajax.php?action=player_ajax&post=' + postId + '&nume=' + nume + '&type=' + type;
  }

  return { streams: streams, ajaxUrl: ajaxUrl };
}

// 3. CARI EPISODE DARI HALAMAN SERIES
function findEpisodeUrl(seriesHtml, episodeNum) {
  var cheerio = require('cheerio-without-node-native');
  var $ = cheerio.load(seriesHtml);
  var found = '';

  $('a').each(function (i, el) {
    if (found) return;
    var href = $(el).attr('href');
    if (!href || href.indexOf('-episode-') === -1) return;

    var m = href.match(/-episode-(\d+)/i);
    var num = m ? parseInt(m[1], 10) : null;

    if (num === episodeNum) found = href;
  });
  return found;
}

// 4. FUNGSI UTAMA
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    getTitleFromTmdb(tmdbId, mediaType)
      .then(function (title) {
        if (!title) return resolve([]);
        
        searchAnichin(title).then(function (slug) {
          if (!slug) return resolve([]);

          // Ambil halaman series untuk mencari link episode
          var seriesUrl = BASE_URL + '/' + slug + '/';
          
          fetch(seriesUrl, { headers: WORKING_HEADERS })
            .then(function(r) { return r.text(); })
            .then(function(seriesHtml) {
              var episodeUrl = findEpisodeUrl(seriesHtml, episodeNum);
              
              // Jika tidak ada link episode, berarti ini Movie, pakai URL series
              var targetUrl = episodeUrl ? (episodeUrl.startsWith('http') ? episodeUrl : BASE_URL + episodeUrl) : seriesUrl;
              
              return fetch(targetUrl, { headers: WORKING_HEADERS })
                .then(function(r) { return r.text(); })
                .then(function(playerHtml) {
                  var ext = extractStreams(playerHtml);
                  
                  if (ext.streams.length > 0) {
                    return resolve(ext.streams.map(function(s, i) {
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
                  }

                  // Jika tidak ada stream tapi ada AJAX endpoint, panggil AJAX-nya
                  if (ext.ajaxUrl) {
                    fetch(ext.ajaxUrl, { headers: WORKING_HEADERS })
                      .then(function(r) { return r.text(); })
                      .then(function(ajaxHtml) {
                        var ajaxExt = extractStreams(ajaxHtml);
                        resolve(ajaxExt.streams.map(function(s, i) {
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
                      });
                  } else {
                    resolve([]);
                  }
                });
            })
            .catch(function() { resolve([]); });
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
