# Anichin Care - Nuvio Plugin

Plugin **scraper streaming** untuk Nuvio yang mengambil stream dari Anichin (anichin.moe).
Ini bukan katalog metadata: katalog hanya menentukan *apa yang tampil*, plugin ini menentukan *dari mana streamnya*.

## Pasang

URL manifest: https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json

Setelah mengganti file, hapus lalu tambah ulang repo di Nuvio supaya versi terbaru terunduh.
Saat dimuat, log memuat `[AnichinCare] dimuat vX.Y.Z` (penanda versi yang berjalan).

## Cara kerja

1. Nuvio mengirim TMDB id (+ season/episode).
2. Judul diambil dari TMDB API (cadangan tanpa key: halaman web TMDB). Hanya judul berhuruf Latin.
3. Episode dicari di Anichin: tebak slug -> `/seri/{slug}/` -> pencarian situs -> WP REST API.
4. Server dibaca dari `<select class="mirror">` (nilai option = iframe ter-encode base64).
5. Embed di-resolve menjadi URL langsung (m3u8/mp4): OK.ru, Rumble, Dailymotion, dan host lain (pindai m3u8/mp4).

Odysee dan D-Tube belum didukung.

## Mode debug

`DEBUG_STREAMS = true` (default sementara): bila tidak ada stream, daftar Nuvio menampilkan kartu
"Anichin ⚠ debug" berisi diagnosis (key TMDB, status HTTP, server yang ditemukan, hasil resolve).
Set `false` setelah berfungsi. API key tidak pernah ditampilkan.

## Batasan runtime Nuvio Mobile (QuickJS)

- Tanpa `setTimeout`/`clearTimeout`, tanpa API Node, tanpa `new URL()`.
- Cheerio di Nuvio adalah polyfill ringan; parser punya cadangan regex.
- Console plugin tidak selalu terlihat di log aplikasi, karena itu ada kartu debug.

## Status

- ✅ Dimuat dan dijalankan di runtime QuickJS Nuvio (tanpa SyntaxError)
- ✅ Diuji dengan fetch palsu (V8 dan QuickJS asli)
- ⚠️ Belum terverifikasi di anichin.moe asli dan di aplikasi Nuvio
- ⚠️ Cloudflare dapat memblokir akses otomatis (terlihat di kartu debug sebagai `diblokir 403`)
- 
