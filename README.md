# Anichin Care

Satu provider JavaScript untuk Nuvio. Repositori ini hanya berisi provider streaming, bukan katalog metadata atau addon Stremio.

## Manifest

Tambahkan URL berikut pada menu Plugins Nuvio:

`https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json`

## Isi repositori

- `manifest.json`: mendaftarkan satu scraper/provider.
- `providers/anichin-care.js`: implementasi provider dengan kontrak `getStreams(tmdbId, mediaType, season, episode)`.

Tidak ada resource katalog, metadata, atau daftar judul. Nuvio dan katalog lain tetap bertanggung jawab menampilkan judul; provider ini hanya mencari sumber video untuk item yang dipilih.

## Cara kerja

1. Mengambil judul dan data season dari TMDB menggunakan `TMDB_API_KEY` yang disediakan runtime Nuvio.
2. Mencari halaman judul pada endpoint pencarian publik situs.
3. Untuk serial, memilih halaman episode yang sesuai dengan nomor episode.
4. Membaca mirror yang memang ditautkan pada halaman episode.
5. Mengembalikan URL media langsung yang ditemukan pada respons publik host yang didukung.

Provider tidak mencoba melewati halaman challenge, login, token akses, atau pembatasan situs. Jika situs menolak request, provider mengembalikan hasil kosong dan mencatat diagnosis singkat pada log.

## Format hasil

Provider mengembalikan array objek stream dengan `name`, `title`, `url`, `quality`, dan header playback bila diperlukan. URL halaman embed tidak dikembalikan sebagai stream karena Nuvio membutuhkan URL media yang dapat diputar.

## Pengujian

Pemeriksaan otomatis memvalidasi sintaks JavaScript dan kontrak ekspor. Pengujian akhir tetap perlu dilakukan di Nuvio karena akses jaringan dan kompatibilitas playback bergantung pada runtime serta host sumber.

Versi saat ini: **1.2.2**. Stream yang ditemukan dideduplikasi berdasarkan host dan path media, label server dipertahankan, dan resolusi hanya ditampilkan jika dapat dikenali dari label atau URL.
