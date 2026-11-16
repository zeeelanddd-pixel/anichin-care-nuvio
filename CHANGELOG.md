# Changelog

Nomor versi di judul adalah nomor rilis repo. Provider berbasis tema (Anichin, Animexin, DonghuaStream, DonghuaKing) berbagi nomor versi; perubahan Bilibili dan Odysee dicatat di entri yang sama dengan versinya sendiri.

## 1.7.0

Berdasarkan laporan: hanya Anichin dan Animexin yang menghasilkan stream; Bilibili menemukan video tetapi tidak bisa diputar.

### Kartu "⚠" penjelasan (mesin bersama dan Bilibili)
- Bila tidak ada stream, provider menampilkan satu kartu `⚠ <Provider>` yang menyebut penyebabnya: situs memblokir (HTTP 403/429/503) atau meminta verifikasi bot, tidak bisa terhubung, judul tidak cocok, episode tidak ada (dengan rentang yang terdaftar, mis. 69–121), tidak ada server yang didukung (dengan daftar host yang dilewati), atau server ada tetapi videonya tidak terbaca (mis. "OK.ru: video dihapus"). Tidak ada upaya menembus pemblokiran.
- Dinyalakan bawaan supaya kegagalan bisa dilaporkan dengan tangkapan layar. Matikan dengan `var SHOW_DIAGNOSTICS = false;` di bagian atas file provider.

### Mesin bersama (Anichin, Animexin, DonghuaStream, DonghuaKing)
- Pencarian HTML kini juga membaca tata letak kartu tanpa tag `<article>` (tautan sesitus yang punya atribut `title`), untuk situs yang menonaktifkan pencarian REST.
- Pemutar di dropdown yang hostnya tidak dikenal (mis. "All Sub Player") dipindai sebagai langkah terakhir, hanya bila tidak ada stream dari host yang dikenal, dan hanya untuk tautan media yang tertulis jelas di halamannya. Host yang butuh skrip atau token (Mega, Streamwish, Dood, Vidhide, Filemoon, Mixdrop, Streamtape, VOE, YouTube, vikingfile, dll.) tidak pernah diminta.

### Bilibili (1.1.0)
- Penyebab paling mungkin "ada tetapi tidak bisa diputar": URL `http://` diteruskan apa adanya, padahal Android memblokir HTTP polos. Kini diubah ke HTTPS.
- Meminta `platform=html5` agar mendapat MP4 (bukan FLV); CDN cadangan `mcdn`, `pcdn`, dan IP berporta, yang tidak bisa dipakai pemutar, dibuang; mirror `upos-*` diutamakan.
- Setiap URL diperiksa dengan permintaan `Range` berheader pemutar sebelum ditampilkan, sehingga URL yang ditolak CDN (403/404) tidak muncul.
- Klip, trailer, dan PV (kurang dari 8 menit) dilewati.
- Koreksi: README sebelumnya menyebut Bilibili "diblokir HTTP 412". Itu dugaan yang salah; laporan pemilik proyek menunjukkan ia menemukan video.

### Tidak ditambahkan
- **YouTube:** URL stream berasal dari API klien privat YouTube dan dijaga tanda tangan serta token anti-bot yang sering berubah; mengambilnya berarti mengakali perlindungan itu, yang tidak dilakukan proyek ini.
- **iQIYI:** stream berDRM, diminta dengan parameter bertanda tangan, dan dibatasi wilayah.
- **AnimeCube:** aplikasi JavaScript (HTML halamannya kerangka kosong) yang sumber videonya dikirim dari API terenkripsi untuk pemutarnya sendiri; membacanya berarti mendekripsi payload itu.

### Repo
- `tests/diagnostics.test.js` (9 test) dan `tests/bilibili.test.js` (4 test).

## 1.6.1

### Bilibili (1.0.6)
- Diaktifkan di manifest atas permintaan pemilik proyek (sebelumnya nonaktif bawaan). Kode tidak berubah selain nomor versi.
- Perlu diketahui: Bilibili menjawab permintaan anonim dengan HTTP 412 dan jarang memuat subtitle Indonesia, jadi hasilnya sering kosong. Provider tidak memakai cookie atau tanda tangan permintaan. Bila diblokir ia mengembalikan hasil kosong; biayanya satu permintaan gagal tambahan per pencarian.

## 1.6.0

### Provider baru
- **DonghuaStream** (donghuastream.org): tema WordPress yang sama, jadi memakai mesin bersama. Situs ini paling segar (Beyond Time’s Gaze episode 48 terbit 14 November 2026, sehari lebih cepat dari Animexin). Server Dailymotion, Rumble, dan OK.ru didukung; "All Sub Player" dilewati bila host-nya tidak dikenal. Belum diuji langsung oleh pemilik proyek.
- Anichin, Animexin, dan DonghuaKing naik ke 1.6.0 (provider berbasis tema ini berbagi nomor versi).

### Mesin bersama
- Kata "multiple" dan "multi" diabaikan saat membandingkan judul (judul episode DonghuaStream berakhiran "Multiple Subtitles"). Tanpa ini postingan episode tidak dikelompokkan bersama halaman serialnya, sehingga satu halaman episode yang besar ikut diunduh sia-sia pada setiap pencarian. Hasil streamnya sendiri tidak berubah.
- `about:blank` (pemutar bawaan DonghuaStream sebelum diisi skrip) dan `blob:` tidak lagi diperlakukan sebagai tautan relatif.

### Repo
- `tools/sync-engine.js` dan test kontrak menemukan otomatis semua provider yang memakai mesin bersama: situs baru cukup menambah satu file berisi header empat variabel (`VERSION`, `PROVIDER`, `LOG_NAME`, `BASE`) plus entri manifest, lalu `npm run sync`.
- `wpAnd` (tiruan pencarian WordPress) dipindah ke `tests/helpers.js`; test DonghuaStream memakai data berbentuk halaman aslinya.

## 1.5.0

Berdasarkan hasil uji lapangan (Renegade Immortal dan Beyond Time’s Gaze): Anichin jalan di keduanya, Animexin hanya di Renegade Immortal, provider lain tidak menghasilkan stream.

### Mesin bersama (Anichin, Animexin, DonghuaKing)
- **Apostrof:** Animexin menulis "Beyond Time’s Gaze" dengan apostrof melengkung, sedangkan TMDB memakai apostrof lurus; pencarian WordPress menganggapnya kata berbeda sehingga hasilnya kosong. Kueri kini dibersihkan dari tanda baca (apostrof menjadi spasi, sisa satu huruf dibuang). Judul panjang juga dicoba dengan tiga kata pertama.
- **Nomor episode lanjutan:** situs menomori episode terus-menerus (Beyond Time’s Gaze sampai 47), sedangkan TMDB per musim. Pada halaman tanpa penanda "Season N", S2E3 setelah S1 berisi 26 episode kini dicari sebagai episode 29. Bila episode itu belum ada, hasilnya kosong, bukan episode musim 1 yang salah. Halaman yang bernomor per musim tetap memakai nomor di dalam musim.
- **Judul alias:** nama alternatif TMDB (mis. "Guang Yin Zhi Wai") dicoba bila judul utama tidak ditemukan; hanya yang beraksara Latin.
- **Satu halaman per serial:** hasil pencarian yang berisi banyak postingan episode serial yang sama tidak lagi diunduh semuanya; halaman serial diutamakan (daftar episodenya lengkap). Batas kandidat 8 menjadi 5.
- **DonghuaKing:** pemutar bawaan halaman (Dailymotion) kini selalu dibaca, bukan hanya bila dropdown kosong, dan halaman pemutar milik situs sendiri yang dipilih di dropdown ikut dicoba.
- **Dailymotion:** bila permintaan polos ditolak (ID privat "k…"), diulang dengan bentuk permintaan pemutar web dailymotion.com; embedder-nya halaman tonton Dailymotion sendiri, bukan situs pihak ketiga.
- Log lebih rinci (kandidat, jumlah episode yang terdaftar, nomor yang dicari) untuk memudahkan pelacakan.

### Provider
- **Animexin, DonghuaKing, Anichin** naik ke 1.5.0 (ketiganya berbagi nomor versi).
- **Bilibili dan Odysee dinonaktifkan bawaan.** Bilibili: API anonim dijawab HTTP 412 dan jarang memuat subtitle Indonesia; melewatinya butuh cookie atau tanda tangan permintaan yang tidak dilakukan proyek ini. Odysee: sengaja hanya mengembalikan klaim berlisensi bebas pakai, yang hampir tidak pernah dipakai donghua. Kode keduanya tidak diubah.
- DonghuaKing hanya bisa menayangkan yang ada di situsnya. Halaman Renegade Immortal di sana berhenti di episode 121 (Desember 2025) dan baru mulai dari episode 69.

### Repo
- `tools/diagnose.js` (`npm run diagnose`) menjalankan provider ke jaringan sungguhan dan mencetak tiap langkah.
- `tests/field-reports.test.js`: skenario dari laporan di atas, dengan tiruan pencarian WordPress yang meniru perilaku aslinya (semua kata harus cocok sebagai substring).
- README ditulis ulang dengan tabel status provider dan panduan "tidak ada stream".

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
