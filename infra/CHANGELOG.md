# infra/CHANGELOG

Log operasional infrastruktur. Setiap perubahan infra (deploy, secret, binding,
cron, bucket) dicatat di sini oleh agen builder. Entry terbaru di atas.

---

## 2026-10-22 · Fase 0: Fondasi berdiri

- Repo `bcksmuhblig/trico-panel` (public) di-scaffold: `web/`, `worker/`, `docs/`, `pipelines/`, `infra/`.
- `.gitignore` dipasang sejak commit pertama (rahasia tidak pernah masuk repo).
- Dokumen: `README.md`, `docs/ADR-001-world-state-vista.md` (kontrak data utama).
- Bucket R2 `trico-snapshots` **gagal dibuat** · akun belum mengaktifkan R2 (API code
  10042). Pivot: namespace KV `trico-state` (`36f422c019e5420c968c38780dddd745`,
  binding `STATE`). Arsip snapshot memakai TTL 7 hari (KV membersihkan dirinya;
  kuota 1 GB aman). R2 bisa diaktifkan manual di dashboard kapan pun bila arsip
  jangka panjang dibutuhkan · kode tinggal ganti adapter storage.
- Secret `ADMIN_KEY` diprovision agen (random hex 24B, disimpan di luar repo) untuk
  menjaga `POST /api/snapshot/now`.
- Worker `trico-core` di-deploy: assets `web/`, R2 binding, cron `*/15 * * * *`.
- Verifikasi pasca-deploy: `/health`, `/api/state`, `/w/jam.txt`, paksa snapshot.

### Catatan akses (untuk audit)
- Cloudflare: API token user ter-scoped (Workers Scripts/KV/R2/D1/Workflows; Workers AI:Read).
  **Bukan** Global API Key. Ritual rotasi tiap akhir fase.
- GitHub: fine-grained PAT, hanya repo `trico-panel`, izin Contents RW + Actions RW.
- Kedua token disimpan agen di `~/.trico/env` (chmod 600), di luar repo dan git history.

## 2026-10-22 · Fase 0.2: perombakan total wajah dan sumber

Pemicu: penilaian pengguna atas panel v0.1 ("sangat jelek, 0%, mainstream, AI slop").
Keputusan: rombak total sistem desain dan katalog data, bukan tambal sulam.

- worker/src/index.js ditulis ulang: 9 sumber terbuka (BMKG, USGS, Google Berita RSS,
  Polymarket Gamma, Open-Meteo, Aladhan metode 20 Kemenag, Nager Date, Wikipedia
  On-This-Day). Skema state naik ke `trico.world-state/0.2`.
- Kunci state baru: `cuaca` (kini + 24 titik per jam), `sholat` (7 waktu, zona Jakarta),
  `prediksi` (6 pasar, prob dalam persen dari harga pasar), `berita` (dedupe 50 karakter),
  `seismik.global.per_jam` (histogram 24 ember).
- web/ ditulis ulang penuh dengan sistem desain "ruang kendali": garis rambut, sudut alat
  ukur, angka tabular, microcaps letterspaced, kertas grafik samar. Tanpa glassmorphism,
  tanpa gradien blob, tanpa emoji, tanpa em-dash; seluruh label Bahasa Indonesia.
- Visual data asli dari angka: sparkline suhu SVG, histogram gempa 24 jam, timeline sholat
  24 jam dengan jarum waktu sekarang dan hitung mundur, bar peluang prediksi, strip jam
  dunia JKT/MKH/LDN/NYC/TYO.
- Mode layar sempit dipertahankan: bento disembunyikan, hanya teks /w/jam.txt.
- Perbaikan: parsing jam WIB widget memakai formatToParts (lepas dari masalah pemisah
  locale); prosa repo disapu dari em-dash (ganti titik tengah) dan istilah Inggris di
  permukaan produk.
