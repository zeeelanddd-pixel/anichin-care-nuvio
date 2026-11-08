# Changelog

## 1.1.2
- Hasil kosong tidak lagi senyap: kartu "Anichin ⚠ debug" (DEBUG_STREAMS) menampilkan diagnosis.
- Dukungan key TMDB berupa token v4 (header Authorization) selain key v3 (?api_key=).
- Cadangan judul tanpa key: baca og:title dari halaman web TMDB.
- OK.ru: pilih `data-options` yang memuat `flashvars` (bukan sekadar yang pertama).
- Catatan alasan gagal untuk tiap resolver (Okru, Dailymotion, Rumble, generik).

## 1.1.1
- Perbaikan runtime QuickJS Nuvio: buang `setTimeout` (tidak tersedia, membuat semua request gagal diam-diam).
- Parser kartu/episode kompatibel dengan polyfill cheerio Nuvio, dengan cadangan regex.
- Season/episode -1 atau null untuk film dinormalkan.
- Log versi saat dimuat.

## 1.1.0
- Tulis ulang provider: server dibaca dari `select.mirror` (iframe base64), embed di-resolve ke m3u8/mp4.
- Judul dari TMDB, rantai pencarian: slug -> /seri/ -> pencarian -> WP REST.
- Manifest: tambah tipe `movie`.
- 
