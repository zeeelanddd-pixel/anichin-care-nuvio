# Anichin Providers

Kumpulan provider JavaScript untuk Nuvio. Repository ini berisi provider streaming saja, bukan katalog metadata atau addon Stremio.

## Manifest

Tambahkan URL berikut pada menu Plugins Nuvio:

`https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json`

## Provider

- **Anichin** — mencari mirror publik dari halaman Anichin. Implementasi: `providers/anichin-care.js`.
- **Bilibili** — mencari video publik melalui API web Bilibili dan meminta URL playback yang disediakan API. Implementasi: `providers/bilibili.js`.
- **Odysee** — me-resolve claim publik yang telah diotorisasi melalui SDK proxy resmi Odysee. Implementasi: `providers/odysee.js`. Integrasi awal dibatasi ke claim yang dikonfigurasi.

Keduanya terdaftar terpisah di Nuvio. Provider Bilibili tidak memakai cookie login, tidak melewati pembatasan wilayah, paywall, DRM, challenge, atau kontrol akses. Provider Odysee hanya mengembalikan URL streaming yang diberikan API publik untuk claim yang dikonfigurasi, tanpa membuat URL CDN sendiri atau mencari unggahan lain. Hanya URL playback langsung yang diberikan oleh API publik dan kompatibel dengan pemutar yang akan dikembalikan. Konten yang memerlukan login atau tidak diizinkan untuk playback publik dapat menghasilkan daftar kosong.

## Kontrak

Setiap provider mengekspor `getStreams(tmdbId, mediaType, season, episode)` dan mengembalikan array stream dengan `name`, `title`, `url`, `quality`, dan header playback bila diperlukan.

## Pengujian

GitHub Actions memeriksa sintaks JavaScript, kontrak ekspor, dan validitas JSON manifest. Uji playback nyata tetap bergantung pada ketersediaan konten publik, wilayah, API Bilibili, dan runtime Nuvio.
