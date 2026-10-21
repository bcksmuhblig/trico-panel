# ADR-001 — World-State Document & Skema Vista

**Status:** Diterima (Fase 0)
**Tanggal:** 2026-10-22
**Pengambil keputusan:** pemilik produk + agen builder

## Konteks

Panel ini bukan sekumpulan widget yang masing-masing memanggil API sendiri.
Panel adalah *pemirsa* terhadap satu dokumen keadaan dunia yang diproduksi
berkala oleh pipeline. Keputusan ini menopang tiga inovasi utama sekaligus:

- **Mesin Waktu Planet** (snapshot berversi → rewind),
- **Prisma Narasi** (peristiwa lintas bahasa terklaster),
- **Keterjelasanan** (skor + provenance wajib ada di setiap kartu).

## Keputusan

### 1. Satu dokumen: `trico.world-state`

Semua tile membaca dari satu objek JSON berversi-skema, bukan dari sumber
secara langsung (kecuali jalur darurat seismik, lihat §5).

```json
{
  "schema": "trico.world-state/0.1",
  "generated_at": "2026-10-22T03:15:00.000Z",
  "build_ms": 842,
  "wib": { "tanggal": "2026-10-22", "gregorian": "...", "hijri": { "text": "..." } },
  "seismik": { "indonesia": {}, "global": {} },
  "kalender": { "libur_id_next": [], "libur_dunia_next": [] },
  "hari_ini_dalam_sejarah": [],
  "sources": { "bmkg": { "ok": true, "ms": 210, "status": 200 } }
}
```

### 2. Snapshot berversi (bibit Mesin Waktu)

- Ditulis tiap 15 menit oleh cron worker ke R2:
  - `state/latest.json` — selalu yang terbaru
  - `state/{YYYY-MM-DD}/{HH-mm}.json` — arsip per snapshot (UTC)
  - `state/index.json` — 192 kunci terakhir (±48 jam), rolling
- **Retensi v0:** tidak dihapus. Estimasi ±10–40 KB/snapshot ⇒ ±1–4 MB/hari;
  kuota R2 gratis 10 GB bertahan bertahun-tahun. Kebijakan pemadatan (misal
  simpan 1/jam setelah 7 hari) diputuskan di ADR lanjutan, sebelum kuota jadi isu.

### 3. Skema peristiwa untuk Vista (target Fase 1–3)

Setiap *event* berita yang masuk world-state WAJIB membawa:

| Field | Tipe | Fungsi |
|---|---|---|
| `id` | string (hash url kanonik) | dedup |
| `cluster_id` | string | pengikat Prisma lintas bahasa |
| `title`, `summary` | string | kartu |
| `occurred_at`, `ingested_at`, `published_at` | ISO | garis waktu Mesin Waktu |
| `lenses` | `{ id:[], en:[], ar:[] }` | artikel per lensa bahasa |
| `provenance[]` | `{ source, url, fetched_at }` | Keterjelasanan & hukum |
| `skor` | `{ velocity, corroboration, novelty, tone }` | "Kenapa berita ini?" |
| `geo` | `{ lat, lon, country } \| null` | radar/peta |

Tanpa `provenance` dan `skor`, sebuah peristiwa **tidak boleh naik** ke tile.
Itu penjaga kualitas tingkat data, bukan disiplin UI.

### 4. Kesegaran bertingkat (freshness budget)

| Tier | Interval | Isi | Eksekutor |
|---|---|---|---|
| 0 | 30–60 dtk (klien) | gempa darurat (overlay) | browser → BMKG/USGS langsung |
| 1 | 15 mnt | world-state snapshot | Cloudflare cron |
| 2 | per jam | dedup/cluster/skor berita | GitHub Actions (Fase 1) |
| 3 | harian | briefing, pengetahuan, kalender | GitHub Actions (Fase 1) |
| 4 | mingguan | kalibrasi prediksi | GitHub Actions (Fase 3) |

### 5. Pengecualian jalur darurat

Overlay darurat (gempa/tsunami) **tidak** menunggu snapshot: klien mem-poll
BMKG/USGS langsung dari browser (CORS terbuka). Ini disengaja: jalur terpendek
untuk data yang latency-critical. Snapshot tetap mencatatnya untuk Mesin Waktu.

### 6. Degradasi jujur

Setiap tile menyatakan umur datanya ("diperbarui 12 mnt lalu"). Jika sumber
mati (lihat `sources.ok: false`), tile tampil *stale dan jujur*, tidak kosong,
tidak berpura-pura segar. **Stale terhormat > mati putih.**

## Konsekuensi

- UI menjadi murni fungsi dari dokumen → bisa di-render ulang untuk titik waktu
  mana pun (prasyarat slider Mesin Waktu di Fase 3).
- Pipeline dan UI bisa berkembang independen selama skema dihormati.
- Penambahan sumber = penambahan field/adapter, bukan bedah ulang.

## Bukan tujuan (non-goals) Fase 0

- Belum ada LLM, RAG, autentikasi pengguna, atau stream realtime (disepakati:
  tanpa WebSocket permanen; denyut di-poll).
- Google Calendar/Tasks masuk lewat gateway Apps Script terpisah (ADR-002 nanti).
