# TRICO PANEL

> **Mesin pemahaman dunia pribadi. Tiga lensa, satu paham.**
> Diam sampai dipanggil. Setiap angka bisa menjelaskan dirinya.

Panel intelijen pribadi satu-pengguna: berita dunia + domestik, agenda, prediksi,
pengetahuan, radar global, dan peringatan darurat · disajikan dalam bento responsif
desktop, digerakkan oleh pipeline data 100% free tier, dan (Fase 2) dipanggil lewat
suara: *"hey trico"*.

## Prinsip Desain (Tiga Hukum)

1. **Tak terlihat sampai dipanggil** · tidak ada noise ambient; kamu yang menarik, bukan didorong.
2. **Setiap angka harus bisa menjelaskan dirinya** · chip skor, asal-usul, sitasi (Vista Function).
3. **Interupsi adalah utang** · satu-satunya yang boleh menginterupsi: darurat seismik.

## Arsitektur

```
SUMBER GRATIS                COMPUTE                    STATE                   PENYAJIAN
─────────────                ───────                    ─────                   ─────────
BMKG TEWS (ID seismik) ─┐
USGS (global)           │   Cloudflare Cron */15 mnt    R2: state/latest.json   Workers assets:
Nager.Date (libur)      ├──► buildWorldState()  ──────► + state/YYYY-MM-DD/  ─► panel bento /api/state
Wikipedia (onthisday)   │   (worker/scheduled)          HH-mm.json (Mesin      /w/jam.txt (KWGT)
GDELT* (Fase 1)         │                               Waktu, 192 snapshot     mobile = teks saja
Kalshi/Polymarket*      │                               tersimpan)
Groq* (Fase 2 LLM)     ─┘
* menyusul sesuai roadmap
```

Semua rahasia hidup di **Cloudflare Dashboard → Variables and Secrets**, tidak pernah
di repo. Deploy dilakukan via `wrangler` dengan API token ter-scoped.

## Struktur Repo

```
trico-panel/
├── web/                 # panel bento (static assets, vanilla · tanpa framework)
├── worker/              # trico-core: API + cron snapshot (src/index.js, wrangler.toml)
├── docs/                # ADR · keputusan arsitektur tertulis
│   └── ADR-001-world-state-vista.md
├── pipelines/           # (Fase 1) ETL GitHub Actions untuk tile berita/radar
└── infra/               # CHANGELOG operasional
```

## Endpoint (v0.1)

| Path | Isi |
|---|---|
| `/` | Panel bento (desktop). Layar sempit → ringkasan teks otomatis |
| `/health` | Status worker + binding |
| `/api/state` | World-State terbaru (JSON) |
| `/api/state/index` | Indeks snapshot (Mesin Waktu · 48 jam) |
| `/w/jam.txt` | Ringkas kalender untuk widget (KWGT/HTTP Shortcuts) |
| `POST /api/snapshot/now` | Paksa snapshot (header `x-trico-key`) |

## Deploy

```bash
cd worker
npx wrangler deploy          # baca CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

## Roadmap

- **Fase 0 · Fondasi** (repo ini): worker, snapshot world-state, panel v0, ADR-001
- **Fase 1 · Panel Vista 3 tile:** Berita (Keterjelasanan), Radar GDELT, Agenda Google (Apps Script gateway) + TiDB
- **Fase 2 · Trico Mode:** wake word + speaker verification (on-device) + STT Groq + jawaban teks singkat
- **Fase 3 · Kedalaman Vista:** Prisma Narasi lintas bahasa, slider Mesin Waktu, papan kalibrasi prediksi, widget KWGT penuh

## Atribusi Data (asal-usul · ditampilkan juga di footer panel)

- Gempa: **BMKG** · Badan Meteorologi, Klimatologi, dan Geofisika (wajib atribusi) · data.bmkg.go.id
- Gempa global: **USGS** Earthquake Hazards Program (public domain) · earthquake.usgs.gov
- Hari libur: **Nager.Date** (open source) · date.nager.at
- Sejarah harian: **Wikipedia / Wikimedia** (CC BY-SA) · wikipedia.org

Lisensi kode: MIT (lihat saat rilis publik final).
