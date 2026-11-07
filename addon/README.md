# Donghua Catalog (Nuvio / Stremio)

Addon **katalog + metadata** donghua (animasi China) dari [AniList](https://anilist.co).  
**Tidak ada stream video** — hanya daftar judul, poster, sinopsis, dan episode.

Cocok untuk Nuvio (Settings → Addons) dan klien lain yang memakai protokol Stremio.

## Isi katalog

| Catalog ID | Tipe | Isi |
|---|---|---|
| `donghua-trending` | series | Donghua yang sedang trending |
| `donghua-series` | series | Serial / ONA / OVA / Special (populer) |
| `donghua-movies` | movie | Film donghua |

Semua difilter `countryOfOrigin: CN` di AniList. Judul mengutamakan English/romaji (huruf Latin).

## Deploy ke Cloudflare Workers

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Worker**.
2. Beri nama, misalnya `donghua-catalog`.
3. Buka **Edit code**, hapus isi default, tempel seluruh isi [`worker.js`](./worker.js).
4. **Deploy**.
5. Catat URL worker, misalnya:
   ```text
   https://donghua-catalog.USERNAME.workers.dev
   ```

## Pasang di Nuvio

1. Nuvio → **Settings** → **Addons**.
2. Tambah addon dengan URL manifest:
   ```text
   https://donghua-catalog.USERNAME.workers.dev/manifest.json
   ```
3. Install. Katalog akan muncul di home / discover.

## Uji cepat di browser

Ganti host dengan URL worker kamu:

```text
https://HOST/manifest.json
https://HOST/catalog/series/donghua-trending.json
https://HOST/catalog/series/donghua-series.json
https://HOST/catalog/movie/donghua-movies.json
https://HOST/catalog/series/donghua-series/search=nezha.json
https://HOST/meta/series/anilist:120220.json
```

## Catatan

- Rate limit AniList: ~90 permintaan/menit. Cache response 5 menit.
- ID judul berbentuk `anilist:12345`.
- Untuk serial, daftar episode dibuat dari jumlah episode AniList (`Episode 1` … `N`). Judul episode individual tidak selalu tersedia di API.
- Addon ini **sengaja tidak** menyediakan resource `stream`.
- 
