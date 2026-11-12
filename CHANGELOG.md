# Changelog

Nomor versi di judul mengikuti provider Anichin (`manifest.json` → `anichin`). Perubahan Bilibili dan Odysee dicatat di entri yang sama.

## 1.4.0

### Provider baru
- **Animexin** (1.0.0) dan **DonghuaKing** (1.0.0): kedua situs memakai tema WordPress yang sama dengan Anichin, jadi ketiganya berbagi satu mesin. Blok mesin harus identik di `anichin-care.js`, `animexin.js`, dan `donghuaking.js`; ubah di `anichin-care.js` lalu jalankan `npm run sync` (test kontrak gagal bila berbeda).
- Server yang didukung: OK.ru, Rumble, Dailymotion, dan mirror `.m3u8`/`.mp4` langsung. Mega, Streamwish, dan Dood dilewati tanpa request (butuh token/skrip yang tidak diakali). Embed Dtube dan Odysee dicoba, tetapi halamannya tidak memuat URL media sehingga biasanya tidak menghasilkan stream.

### Anichin (1.4.0) dan mesin bersama
- **Judul:** nama alternatif dalam kurung ("Gu An [One Slash to the Heavens]" cocok dengan "Gu An"), toleransi satu salah ketik pada kata 5+ huruf ("Deamon", "Steller"), dan kata rilis (episode, sub, indo, english, END) diabaikan saat membandingkan judul.
- **Episode:** bila beberapa tautan memiliki nomor yang sama (widget serial lain), dipilih yang judulnya paling mirip. Slug tanpa kata "episode" (`renegade-61-indonesia-english`) dikenali dari label. Bila pencarian hanya mengembalikan halaman episode, daftar episode di halaman itu dipakai.
- **Film:** bila halaman film hanya memuat daftar episode, tautan pertamanya diikuti untuk menemukan pemutar.
- **Stream:** teks opsi server dari situs ("Hardsub Indonesia Ok.ru AX") dipertahankan di judul supaya bahasa subtitle terlihat; opsi Indonesia ditampilkan lebih dulu; batas hasil naik dari 12 ke 16.

### Repo
- `tests/helpers.js` (tiruan jaringan bersama), `tests/themesia-sites.test.js` (data berbentuk situs asli), `tools/sync-engine.js`.

## 1.3.0

### Anichin
- **Musim:** permintaan S2+ kini memilih halaman "Season N" lebih dulu. Sebelumnya halaman tanpa penanda musim (skor 1.0) mengalahkan "Season 2", sehingga S2E3 bisa dijawab dengan S1E3. Halaman musim lain tidak lagi dipakai sebagai kandidat musim 1.
- **OK.ru:** metadata dibaca dengan benar. Sebelumnya `\u0026` ganda membuat `JSON.parse` gagal dan penutup `\\"` salah dikenali. Kualitas (144p–1080p) diambil dari nama `videos[]`, dan URL MP4 OK.ru tanpa ekstensi tidak lagi dibuang. Mendukung `metadataUrl`.
- **Dailymotion:** resolver khusus lewat endpoint metadata publik (HLS auto + MP4 per kualitas), lalu cadangan pemindaian generik.
- **TMDB:** kembali mendukung token v4 (header `Authorization`) selain key v3; tanpa key dipakai `og:title` halaman web TMDB; judul asli (`original_name`) dicoba bila judul Inggris tidak ditemukan.
- Pencarian: jika WP REST hanya mengembalikan hasil tak relevan, pencarian HTML situs dicoba juga.
- Host mirror dikenali termasuk subdomain (mis. `geo.dailymotion.com`); link episode relatif diselesaikan terhadap URL halaman; `&amp;quot;` tidak lagi di-decode dua kali.
- `fetch` tanpa properti `status` tidak lagi dianggap gagal.
- Judul stream tidak lagi menggandakan kualitas ("720p • OK.ru • 720p"); stream HLS berlabel `Auto`.
- Satu resolver yang error tidak lagi menggugurkan mirror lain.

### Bilibili (1.0.5)
- Regex pembersih nomor episode salah di-escape (empat backslash) sehingga tidak pernah cocok; diperbaiki.
- Pola episode kini memakai batas kata, jadi "step 5" tidak dianggap "ep 5".
- Mendukung token TMDB v4; label kualitas ditambah (360p, 720p60, 1080p60, 4K).

### Odysee (1.1.4)
- **Lisensi:** `NonCommercial` dan `NoDerivatives` kini ditolak. Sebelumnya cocok dengan awalan "Creative Commons Attribution" sehingga lolos, bertentangan dengan README.
- Episode yang salah tidak lagi dikembalikan: klaim harus memuat nomor episode yang diminta (serial) dan judul klaim, bukan deskripsi, yang dicocokkan.
- Membaca respons `get` yang datar (`claim_name`, `metadata`), mendukung token TMDB v4, dan membuang kueri duplikat.

### Repo
- `manifest.json` memakai pembungkus `scrapers` (format manifest Nuvio); sebelumnya array telanjang sehingga test CI gagal.
- Test kontrak ditulis ulang (manifest ↔ file ↔ `VERSION`, ekspor, larangan `setTimeout`/`require`) dan ditambah test perilaku dengan jaringan tiruan untuk ketiga provider.
- `validate.yml` kini memeriksa ketiga provider (sebelumnya hanya dua) dan menjalankan `npm test`. `catalog-tests.yml` dihapus karena menunjuk folder `addon/` yang tidak ada.
- Ditambah `package.json` (`npm test`, `npm run check`).

## 1.1.3 – 1.2.8
- Tidak tercatat di changelog ini.

## 1.1.2
- Hasil kosong tidak lagi senyap: kartu "Anichin ⚠ debug" (DEBUG_STREAMS) menampilkan diagnosis. (Fitur ini sudah tidak ada di kode saat ini.)
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
