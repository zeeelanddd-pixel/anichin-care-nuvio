# Donghua Catalog for Nuvio

Addon katalog komunitas untuk Nuvio yang menggabungkan metadata anime/donghua dari **Kitsu** dan **Bangumi** melalui protokol Stremio.

## Status versi 1.1.0

Addon ini menyediakan **katalog dan metadata**, bukan video atau layanan streaming.

- Katalog serial: TV, ONA, OVA, dan special.
- Katalog film.
- Sumber metadata: Kitsu dan Bangumi.
- Pencarian judul melalui parameter `search`.
- Pagination melalui parameter `skip`.
- Dedup dasar lintas sumber berdasarkan judul, tahun, dan tipe.
- ID metadata menggunakan prefix `kitsu:` dan `bangumi:`.
- Kata kunci pencarian dan judul yang ditampilkan diprioritaskan dalam huruf Latin; judul non-Latin tanpa alternatif Latin tidak ditampilkan.
- Provider Anichin menerima ID `kitsu:` dan `bangumi:` lalu mengambil judul Latin dari API metadata untuk pencarian situs.
- Timeout permintaan sumber untuk menghindari request menggantung.
- Pencarian default memakai 24 kata kunci Latin dan maksimal 48 permintaan sumber (24 Kitsu + 24 Bangumi), sebelum redirect.

Cakupan katalog bergantung pada data publik kedua layanan. Tidak ada jaminan semua donghua pernah terindeks atau selalu muncul. Judul anime Jepang dan animasi Korea dapat ikut muncul karena filter sumber tidak selalu dapat membedakan asal produksi secara sempurna.

## Endpoint

- `GET /manifest.json`
- `GET /catalog/series/donghua-series.json?skip=0`
- `GET /catalog/movie/donghua-movies.json?skip=0`
- `GET /catalog/series/donghua-series.json?search=Soul%20Land`
- `GET /meta/series/kitsu:1234.json`
- `GET /meta/series/bangumi:1234.json`

## Deploy ke Cloudflare Workers

Worker yang sudah terhubung ke repository ini dapat diperbarui dengan menyalin isi `worker.js` ke editor Worker lalu menekan Deploy. Jika menggunakan Wrangler CLI:

```sh
cd addon
npm test
npx wrangler deploy
```

Worker yang sudah dibuat untuk proyek ini menggunakan URL manifest berikut:

`https://anichin-catalog-nuvio.zeeelanddd.workers.dev/manifest.json`

Setelah kode Worker diperbarui dan di-deploy, buka URL manifest tersebut untuk memastikan statusnya normal, lalu tambahkan URL itu di Nuvio melalui Settings → Addons. Jangan membuat Worker baru jika Worker lama masih digunakan.

## Pengujian lokal

Membutuhkan Node.js 18 atau lebih baru.

```sh
cd addon
npm test
```

Tes memakai mock response sehingga memeriksa routing, bentuk manifest, pemetaan hasil Kitsu/Bangumi, pemisahan series/movie, dan metadata tanpa membebani API publik.

## Catatan dan batasan

- Kitsu dan Bangumi adalah sumber metadata, bukan sumber stream.
- Pencarian multi-kata kunci memperluas jangkauan, tetapi tidak berarti katalog lengkap 100%.
- Klasifikasi movie Bangumi memakai informasi platform/judul dan dapat memiliki kasus ambigu.
- Ketersediaan poster, judul alternatif, tahun, dan ringkasan bergantung pada data sumber.
- Addon ini tidak mencoba melewati proteksi, login, atau pembatasan akses situs mana pun.
