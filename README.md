# Anichin Care for Nuvio

**Anichin Care** adalah provider pihak ketiga (*unofficial*) untuk aplikasi **Nuvio**. Provider ini mencoba menemukan halaman episode di Anichin dan mengambil URL video dari server pemutar yang tersedia.

> [!IMPORTANT]
> **Proyek ini tidak resmi (UNOFFICIAL).** Anichin Care bukan aplikasi, layanan, atau plugin resmi dari Anichin maupun Nuvio. Proyek ini dibuat dan dipelihara secara independen oleh komunitas/pengembang pihak ketiga. Tidak ada afiliasi, dukungan, atau endorsement resmi dari pihak Anichin atau Nuvio.

## Informasi Proyek

| Informasi | Detail |
| --- | --- |
| Nama | Anichin Care |
| Versi | 0.6 |
| Platform | Nuvio |
| Jenis | Provider / scraper |
| Situs sumber | [anichin.moe](https://anichin.moe) |
| Bahasa konten yang ditargetkan | Indonesia |
| Tipe konten | Movie dan TV |
| Format stream | HLS (m3u8) dan MP4 |
| Status | Eksperimental, perlu pengujian berkala |

## Dukungan Server Video

Provider akan membaca pilihan server yang tersedia pada halaman episode, kemudian mencoba mengekstrak stream dari masing-masing server yang dikenali.

| Server | Status implementasi | Catatan |
| --- | --- | --- |
| Okru | Implementasi tersedia | Resolver khusus |
| Dailymotion | Implementasi tersedia | Beberapa pemutar dapat menampilkan iklan |
| Rumble | Implementasi tersedia | Akses dapat bergantung pada DNS atau jaringan |
| D-Tube | Implementasi tersedia | Resolver berdasarkan metadata video DTube |
| Odysee | Implementasi tersedia | Resolver berdasarkan metadata/stream Odysee |
| New Player | Ekstraksi generik | Bergantung pada struktur player yang digunakan |
| Streamruby | Implementasi tersedia | Beberapa pemutar dapat menampilkan iklan |
| Vidara | Implementasi tersedia | Beberapa pemutar dapat menampilkan iklan |
| VidHide | Implementasi tersedia | Beberapa pemutar dapat menampilkan iklan |

**Penting:** status "implementasi tersedia" berarti kode resolver sudah disertakan, bukan jaminan bahwa server selalu dapat diputar. Ketersediaan video, perubahan sistem player, pembatasan jaringan, DNS, iklan, dan respons situs pihak ketiga dapat memengaruhi hasil. Tidak semua server selalu muncul pada setiap judul atau episode.

## Fitur

- Mencari judul melalui beberapa variasi nama TMDB dan endpoint pencarian WordPress jika tersedia.
- Menggabungkan hasil dari seluruh variasi judul sebelum pemeringkatan, sehingga satu hasil pencarian kosong atau tidak cocok tidak menghentikan pencarian alias lainnya.
- Mencocokkan hasil pencarian dengan metadata judul.
- Mencari halaman episode yang sesuai untuk serial TV.
- Membaca pilihan server video dari halaman episode.
- Mendukung beberapa host video melalui resolver khusus dan ekstraksi generik.
- Mencoba beberapa server yang ditemukan, bukan hanya satu server.
- Menghindari penambahan URL stream yang sama berulang kali.
- Mengembalikan stream HLS (m3u8) atau MP4 yang berhasil diekstrak.
- Menyediakan informasi diagnostik melalui log ketika proses pencarian dan ekstraksi berlangsung.

## Instalasi

Tambahkan manifest berikut ke Nuvio:

```text
https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json
```

Langkah umum:
1. Buka aplikasi Nuvio.
2. Masuk ke bagian pengelolaan atau penambahan plugin/provider.
3. Tambahkan URL manifest di atas.
4. Simpan, lalu muat ulang daftar provider jika diperlukan.
5. Cari judul yang ingin ditonton dan pilih provider **Anichin Care** jika tersedia.

Nama menu dapat berbeda tergantung versi Nuvio yang digunakan.

## Persyaratan dan Kompatibilitas

- Membutuhkan aplikasi Nuvio yang mendukung format provider pada manifest proyek ini.
- Membutuhkan koneksi internet untuk mengakses situs sumber dan server video.
- Beberapa server mungkin membutuhkan konfigurasi DNS atau jaringan tertentu agar dapat diakses.
- Hasil dapat berbeda menurut judul, episode, lokasi jaringan, dan kondisi server.
- Provider ini tidak menyediakan atau meng-host file video. URL stream diambil dari situs dan layanan pihak ketiga.

## Pemecahan Masalah

### Provider tidak muncul di Nuvio
- Pastikan URL manifest benar.
- Pastikan koneksi internet aktif.
- Coba muat ulang daftar provider atau restart aplikasi.
- Periksa apakah versi Nuvio yang digunakan masih mendukung format provider ini.

### Judul tidak ditemukan
- Coba gunakan judul alternatif atau ejaan yang lebih sederhana.
- Pastikan judul tersebut tersedia di Anichin.
- Situs sumber dapat mengubah sistem pencarian atau membatasi permintaan.

### Server ditemukan, tetapi stream gagal diputar
- Coba server lain jika tersedia.
- Periksa koneksi dan pengaturan DNS, terutama untuk server yang sulit diakses di jaringan tertentu.
- Server pihak ketiga mungkin sedang bermasalah, mengganti format player, atau membatasi akses.
- Pemutar yang menggunakan iklan atau skrip khusus belum tentu selalu bisa diekstrak.

### Tidak ada stream yang dihasilkan
- Periksa log Nuvio untuk melihat jumlah server yang ditemukan dan hasil resolver.
- Catat judul, episode, server yang dipilih, dan pesan error yang muncul.
- Sertakan informasi tersebut saat membuat laporan masalah. Jangan sertakan data akun, token, atau informasi pribadi.

## Batasan yang Diketahui

- Proyek ini bergantung pada struktur halaman Anichin dan layanan server video eksternal. Perubahan pada salah satu layanan dapat membuat resolver tertentu berhenti bekerja.
- Ekstraksi generik tidak dapat menjamin dukungan untuk semua jenis pemutar.
- Iklan, proteksi anti-bot, pembatasan wilayah/jaringan, dan perubahan endpoint dapat menghambat proses.
- Pengujian sintaks kode tidak sama dengan pengujian pemutaran langsung. Dukungan tiap server perlu diuji di aplikasi Nuvio dan dapat berubah sewaktu-waktu.
- Tidak ada jaminan ketersediaan, kualitas, atau keberlangsungan stream dari layanan pihak ketiga.

## Privasi dan Koneksi

Saat digunakan, provider mengirim permintaan jaringan ke Anichin dan host video pihak ketiga untuk mencari halaman, membaca informasi server, dan mengambil alamat stream. Permintaan tersebut tunduk pada kebijakan dan praktik masing-masing layanan. Provider ini tidak dimaksudkan untuk meminta kata sandi atau data akun pengguna.

## Pelaporan Masalah dan Kontribusi

Jika menemukan masalah:
1. Gunakan versi terbaru dari repository.
2. Sertakan judul dan episode yang bermasalah.
3. Jelaskan server yang dipilih.
4. Lampirkan log error yang relevan setelah menghapus informasi pribadi.

Pull request untuk perbaikan dan penambahan dukungan server dipersilakan. Pastikan perubahan tetap sesuai dengan struktur provider Nuvio dan diuji sebelum diajukan.

## Penafian

Anichin Care disediakan **"apa adanya"** untuk tujuan integrasi teknis dengan Nuvio. Pengembang tidak memiliki, mengoperasikan, atau mengendalikan Anichin maupun server video pihak ketiga yang mungkin ditautkan oleh provider ini.

Pengguna bertanggung jawab untuk mematuhi hukum, ketentuan layanan, dan hak cipta yang berlaku di wilayah masing-masing. Jika memiliki hak atas konten atau layanan yang ditautkan dan ingin mengajukan keberatan, hubungi pengelola layanan sumber terkait.

---

**Repository:** [zeeelanddd-pixel/anichin-care-nuvio](https://github.com/zeeelanddd-pixel/anichin-care-nuvio)

**Status proyek:** Unofficial community-made provider for Nuvio.


## Donghua Catalog Addon (Cloudflare Workers)

Folder `addon/` berisi addon katalog Stremio untuk Nuvio. Addon ini menggabungkan metadata publik Kitsu dan Bangumi, menyediakan katalog serial (TV/ONA/OVA/special) dan film, serta endpoint metadata. Addon katalog ini **terpisah** dari scraper Anichin Care di `providers/`, dan tidak menyediakan video stream. Lihat [`addon/README.md`](addon/README.md) untuk instalasi, deployment, batasan, dan pengujian.
