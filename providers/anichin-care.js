// providers/anichin-care.js
// Plugin Anichin dinamis untuk Nuvio (mendukung semua donghua)

const BASE_URL = 'https://anichin.moe';
const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49'; // Kunci publik dari provider lain

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL
};

// Fungsi untuk mengambil judul dari TMDB berdasarkan tmdbId
function getTitleFromTmdb(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=id-ID`;

  return fetch(url)
    .then(res => res.json())
    .then(data => {
      // Prioritaskan judul bahasa Indonesia, lalu judul asli
      return data.title || data.name || data.original_title || data.original_name || '';
    })
    .catch(() => '');
}

// Fungsi untuk mencari slug series di Anichin berdasarkan judul
function searchAnichin(title) {
  if (!title) return Promise.resolve('');

  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;

  return fetch(searchUrl, { headers: WORKING_HEADERS })
    .then(res => res.text())
    .then(html => {
      // Menggunakan cheerio untuk parsing yang lebih stabil
      const cheerio = require('cheerio-without-node-native');
      const $ = cheerio.load(html);
      let slug = '';

      // Cari link yang mengarah ke halaman series.
      // Biasanya ada di dalam artikel atau elemen dengan class tertentu.
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (!href || slug) return;

        // Filter link yang kemungkinan besar adalah halaman series
        // Contoh: https://anichin.moe/soul-land/ atau /soul-land/
        if (href.includes('anichin.moe/') && !href.includes('?s=') && !href.includes('/genres/') && !href.includes('/studio/')) {
          // Ambil slug dari URL
          const parts = href.replace(/\/$/, '').split('/');
          const lastPart = parts[parts.length - 1];
          // Pastikan bukan halaman statis
          if (lastPart && lastPart !== 'anichin.moe' && lastPart.length > 2) {
            slug = lastPart;
          }
        }
      });

      return slug;
    })
    .catch(() => '');
}

// Fungsi utama yang dipanggil Nuvio
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function (resolve) {
    // Langkah 1: Dapatkan judul dari TMDB
    getTitleFromTmdb(tmdbId, mediaType)
      .then(function (title) {
        if (!title) {
          console.log('[Anichin] Judul tidak ditemukan untuk tmdbId:', tmdbId);
          return resolve([]);
        }

        // Langkah 2: Cari slug series di Anichin
        return searchAnichin(title).then(function (slug) {
          if (!slug) {
            console.log('[Anichin] Series tidak ditemukan untuk judul:', title);
            return resolve([]);
          }

          console.log(`[Anichin] Ditemukan slug: ${slug} untuk judul: ${title}`);

          // Langkah 3: Bangun URL episode.
          // Pola URL episode di Anichin bervariasi. Kita coba beberapa pola umum.
          const episodeUrls = [
            `${BASE_URL}/${slug}-episode-${episodeNum}`,
            `${BASE_URL}/${slug}/episode-${episodeNum}`,
            `${BASE_URL}/watch/${slug}-episode-${episodeNum}`
          ];

          // Coba satu per satu hingga menemukan halaman yang valid
          let index = 0;
          function tryNextUrl() {
            if (index >= episodeUrls.length) {
              console.log('[Anichin] Tidak ada URL episode yang valid untuk slug:', slug);
              return resolve([]);
            }

            const episodeUrl = episodeUrls[index++];

            fetch(episodeUrl, { headers: WORKING_HEADERS })
              .then(function (response) {
                if (!response.ok) {
                  throw new Error('Status: ' + response.status);
                }
                return response.text();
              })
              .then(function (html) {
                // Langkah 4: Ekstrak iframe/m3u8 dari halaman episode
                const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
                let match;
                const streamUrls = [];
                const seenUrls = {};

                while ((match = iframeRegex.exec(html)) !== null) {
                  const src = match[1];
                  if (src && src !== 'about:blank' && !seenUrls[src]) {
                    seenUrls[src] = true;
                    streamUrls.push(src);
                  }
                }

                // Fallback: cari link .m3u8 langsung
                if (streamUrls.length === 0) {
                  const m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
                  let m3u8Match;
                  while ((m3u8Match = m3u8Regex.exec(html)) !== null) {
                    const m3u8Url = m3u8Match[1];
                    if (!seenUrls[m3u8Url]) {
                      seenUrls[m3u8Url] = true;
                      streamUrls.push(m3u8Url);
                    }
                  }
                }

                if (streamUrls.length === 0) {
                  // Jika tidak ada stream, coba URL berikutnya
                  return tryNextUrl();
                }

                // Langkah 5: Bangun objek stream untuk Nuvio
                const streams = streamUrls.map(function (url, i) {
                  let serverName = 'Server ' + (i + 1);
                  try {
                    const urlObj = new URL(url);
                    serverName = urlObj.hostname.replace('www.', '');
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

                resolve(streams);
              })
              .catch(function () {
                // Jika fetch gagal, coba URL berikutnya
                tryNextUrl();
              });
          }

          tryNextUrl();
        });
      })
      .catch(function (error) {
        console.error('[Anichin] Error:', error.message);
        resolve([]);
      });
  });
}

// Ekspor untuk kompatibilitas React Native / Hermes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
