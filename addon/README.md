# Anichin Catalog for Nuvio

Addon komunitas tidak resmi yang membaca daftar judul dan metadata publik dari Anichin untuk ditampilkan di Nuvio melalui protokol Stremio.

## Status saat ini

**Tahap 1: katalog dan metadata (eksperimental).**

- Katalog serial/donghua dan film.
- Pagination dasar melalui parameter `skip`.
- Pencarian judul melalui pencarian situs.
- Metadata halaman judul dan daftar episode jika pola URL episode terdeteksi.
- Tidak meng-host atau mem-proxy file video.

Stream playback belum diaktifkan pada tahap ini. ID katalog memakai prefix `anichin:`, sehingga integrasi dengan provider Anichin Care perlu diuji dan diselesaikan sebelum addon dinyatakan siap dipakai untuk menonton.

## Deploy ke Cloudflare Workers

1. Buat akun Cloudflare.
2. Buka Workers & Pages, lalu buat Worker bernama `anichin-catalog-nuvio`.
3. Salin isi `worker.js` ke editor Worker, lalu deploy.
4. Uji URL `https://NAMA-WORKER.NAMA-AKUN.workers.dev/manifest.json`.
5. Masukkan URL tersebut ke Settings > Addons di Nuvio.

File `wrangler.toml` disediakan untuk deployment menggunakan Wrangler CLI.

## Endpoint

- `GET /manifest.json`
- `GET /catalog/series/anichin-series.json?skip=0`
- `GET /catalog/movie/anichin-movies.json?skip=0`
- `GET /meta/series/anichin:slug.json`
- `GET /meta/movie/anichin:slug.json`

## Catatan

Struktur halaman Anichin dapat berubah. Parsing katalog dan episode harus diuji ulang jika situs mengubah HTML, pagination, atau pola URL. Gunakan hanya sesuai hukum dan ketentuan yang berlaku.
