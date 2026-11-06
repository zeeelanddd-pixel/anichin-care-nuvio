// providers/anichin-care.js
// Nuvio Provider untuk Anichin (Donghua/Anime Sub Indo)
// Domain: anichin.moe

const BASE_URL = 'https://anichin.moe';

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    var seriesSlug = 'soul-land';
    var episodeUrl = BASE_URL + '/watch/' + seriesSlug + '-episode-' + episodeNum;

    fetch(episodeUrl, { headers: WORKING_HEADERS })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Gagal memuat halaman: ' + response.status);
        }
        return response.text();
      })
      .then(function (html) {
        var iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var match;
        var streamUrls = [];
        var seenUrls = {};

        while ((match = iframeRegex.exec(html)) !== null) {
          var src = match[1];
          if (src && src !== 'about:blank' && !seenUrls[src]) {
            seenUrls[src] = true;
            streamUrls.push(src);
          }
        }

        if (streamUrls.length === 0) {
          var m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
          var m3u8Match;
          while ((m3u8Match = m3u8Regex.exec(html)) !== null) {
            var m3u8Url = m3u8Match[1];
            if (!seenUrls[m3u8Url]) {
              seenUrls[m3u8Url] = true;
              streamUrls.push(m3u8Url);
            }
          }
        }

        var streams = streamUrls.map(function (url, index) {
          var serverName = 'Server ' + (index + 1);
          try {
            var urlObj = new URL(url);
            serverName = urlObj.hostname.replace('www.', '');
          } catch (e) {}

          return {
            name: 'Anichin - ' + serverName,
            title: 'Anichin Episode ' + episodeNum,
            url: url,
            quality: '1080p',
            size: 'Unknown',
            headers: WORKING_HEADERS,
            provider: 'anichin-care'
          };
        });

        resolve(streams);
      })
      .catch(function (error) {
        console.error('[Anichin] Error:', error.message);
        resolve([]);
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
