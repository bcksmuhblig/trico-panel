/**
 * TRICO-CORE v0.1 — Fondasi
 * ---------------------------------------------------------------------------
 * Tugas:
 *   - scheduled(): membangkitkan World-State tiap 15 menit -> R2 (snapshot)
 *   - GET /api/state           -> state terbaru (bootstrap dingin jika kosong)
 *   - GET /api/state/index     -> indeks snapshot (Mesin Waktu, 48 jam)
 *   - GET /w/jam.txt           -> teks ringkas kalender (widget KWGT)
 *   - GET /health              -> status worker + binding
 *   - POST /api/snapshot/now   -> paksa snapshot (header: x-trico-key)
 *
 * Prinsip (ADR-001): stale terhormat > mati putih. Setiap sumber membawa
 * status kesehatannya sendiri di dalam dokumen.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,x-trico-key",
};

const UA = { "User-Agent": "trico-panel/0.1 (personal dashboard)" };

const SRC = {
  bmkg: "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  usgs: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
  nager_id: "https://date.nager.at/api/v3/NextPublicHolidays/ID",
  nager_world: "https://date.nager.at/api/v3/NextPublicHolidaysWorldwide",
};

const HIJRI_MONTHS_ID = [
  "Muharam", "Safar", "Rabiulawal", "Rabiulakhir", "Jumadilawal", "Jumadilakhir",
  "Rajab", "Syakban", "Ramadhan", "Syawal", "Zulkaidah", "Zulhijah",
];

/* ------------------------------ utilitas ------------------------------ */

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...(init.headers || {}) },
  });
}

function text(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS },
  });
}

async function fetchJson(url, ms = 9000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { headers: UA, signal: ctrl.signal, cf: { cacheTtl: 60 } });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, ms: Date.now() - t0, status: res.status };
    const data = await res.json();
    return { ok: true, ms: Date.now() - t0, status: res.status, data };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, status: 0, error: String(e && e.name || e) };
  }
}

function wibDateStr(d) {
  // YYYY-MM-DD di zona Asia/Jakarta
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function gregorianId(d) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(d);
}

function hijriId(d) {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "numeric", year: "numeric",
    }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    const day = parseInt(get("day"), 10);
    const monthIdx = parseInt(get("month"), 10) - 1;
    const year = parseInt(get("year"), 10);
    if (!day || monthIdx < 0 || monthIdx > 11 || !year) return { text: "-" };
    return { text: day + " " + HIJRI_MONTHS_ID[monthIdx] + " " + year + "H", day, month: monthIdx + 1, year };
  } catch {
    return { text: "-" };
  }
}

function daysUntil(dateStr, todayStr) {
  const a = new Date(todayStr + "T00:00:00Z");
  const b = new Date(dateStr + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ------------------------- pembangun world-state ------------------------ */

async function buildWorldState() {
  const t0 = Date.now();
  const now = new Date();
  const wibStr = wibDateStr(now);
  const [mm, dd] = [wibStr.slice(5, 7), wibStr.slice(8, 10)];

  const wikiUrl = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/" + mm + "/" + dd;

  const [bmkg, usgs, nagerId, nagerWorld, wiki] = await Promise.all([
    fetchJson(SRC.bmkg),
    fetchJson(SRC.usgs),
    fetchJson(SRC.nager_id),
    fetchJson(SRC.nager_world),
    fetchJson(wikiUrl),
  ]);

  // --- seismik
  const seismik = { indonesia: null, global: null };
  if (bmkg.ok) {
    const g = bmkg.data && bmkg.data.Infogempa && bmkg.data.Infogempa.gempa;
    if (g) {
      seismik.indonesia = {
        mag: g.Magnitude, wilayah: g.Wilayah, kedalaman: g.Kedalaman,
        waktu: (g.Tanggal || "") + " " + (g.Jam || ""), potensi: g.Potensi || "",
        koordinat: g.Coordinates || "", shakemap: g.Shakemap || "",
      };
    }
  }
  if (usgs.ok) {
    const f = (usgs.data && usgs.data.features) || [];
    let max = 0;
    for (const x of f) { const m = (x.properties && x.properties.mag) || 0; if (m > max) max = m; }
    const top3 = f.slice()
      .sort((a, b) => ((b.properties && b.properties.mag) || 0) - ((a.properties && a.properties.mag) || 0))
      .slice(0, 3)
      .map((x) => ({
        mag: x.properties && x.properties.mag,
        place: x.properties && x.properties.place,
        time: x.properties && x.properties.time ? new Date(x.properties.time).toISOString() : null,
      }));
    seismik.global = { count24h_m25: f.length, max24h: max, top3 };
  }

  // --- kalender (buang yang sudah lewat di zona WIB; dunia bergerak dalam UTC,
  //     dan "besok" di Port Moresby bisa jadi "kemarin" di Jakarta)
  const liburId = (nagerId.ok && Array.isArray(nagerId.data) ? nagerId.data : [])
    .map((h) => ({ nama: h.localName || h.name, tanggal: h.date, h_minus: daysUntil(h.date, wibStr) }))
    .filter((h) => h.h_minus != null && h.h_minus >= 0)
    .slice(0, 3);
  const liburWorld = (nagerWorld.ok && Array.isArray(nagerWorld.data) ? nagerWorld.data : [])
    .map((h) => ({ nama: h.name, negara: h.countryCode, tanggal: h.date, h_minus: daysUntil(h.date, wibStr) }))
    .filter((h) => h.h_minus != null && h.h_minus >= 0)
    .slice(0, 3);

  // --- hari ini dalam sejarah
  let hariIni = [];
  if (wiki.ok && wiki.data && Array.isArray(wiki.data.events)) {
    hariIni = wiki.data.events.slice(0, 3).map((e) => ({
      tahun: e.year,
      teks: typeof e.text === "string" && e.text.length > 160 ? e.text.slice(0, 160) + "…" : e.text,
    }));
  }

  return {
    schema: "trico.world-state/0.1",
    generated_at: now.toISOString(),
    build_ms: Date.now() - t0,
    wib: { tanggal: wibStr, gregorian: gregorianId(now), hijri: hijriId(now) },
    seismik,
    kalender: { libur_id_next: liburId, libur_dunia_next: liburWorld },
    hari_ini_dalam_sejarah: hariIni,
    sources: {
      bmkg: { ok: bmkg.ok, ms: bmkg.ms, status: bmkg.status },
      usgs: { ok: usgs.ok, ms: usgs.ms, status: usgs.status },
      nager_id: { ok: nagerId.ok, ms: nagerId.ms, status: nagerId.status },
      nager_world: { ok: nagerWorld.ok, ms: nagerWorld.ms, status: nagerWorld.status },
      wikipedia: { ok: wiki.ok, ms: wiki.ms, status: wiki.status },
    },
    catatan: "Fase 0 (fondasi). Tile Berita, Radar, Agenda, Prediksi: menyusul — lihat ADR-001.",
  };
}

async function writeSnapshot(env) {
  const state = await buildWorldState();
  const body = JSON.stringify(state);
  const iso = state.generated_at;
  const snapKey = "state/" + iso.slice(0, 10) + "/" + iso.slice(11, 16).replace(":", "-") + ".json";

  await env.STATE.put("state/latest.json", body);
  // arsip ber-TTL: KV membersihkan dirinya sendiri setelah 7 hari (hemat kuota 1 GB)
  await env.STATE.put(snapKey, body, { expirationTtl: 7 * 24 * 3600 });

  // indeks rolling 192 snapshot (±48 jam @ 15 mnt)
  let idx = [];
  try {
    const cur = await env.STATE.get("state/index.json");
    if (cur) {
      idx = JSON.parse(cur);
      if (!Array.isArray(idx)) idx = [];
    }
  } catch {}
  idx.unshift(snapKey);
  idx = idx.slice(0, 192);
  await env.STATE.put("state/index.json", JSON.stringify(idx));

  return state;
}

async function readLatest(env) {
  const cur = await env.STATE.get("state/latest.json"); // KV get -> string
  if (cur) return cur;
  // bootstrap dingin: belum pernah ada snapshot
  const state = await writeSnapshot(env);
  return JSON.stringify(state);
}

/* -------------------------------- router -------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/health") {
      return json({
        ok: true, service: "trico-core", version: "0.1.0",
        now: new Date().toISOString(), cron: "*/15 * * * *",
        bindings: { state_kv: !!env.STATE, admin_key_set: !!env.ADMIN_KEY },
      });
    }

    if (url.pathname === "/api/state") {
      const body = await readLatest(env);
      return new Response(body, {
        headers: { "content-type": "application/json; charset=utf-8", ...CORS, "cache-control": "public, max-age=60" },
      });
    }

    if (url.pathname === "/api/state/index") {
      const cur = await env.STATE.get("state/index.json");
      if (!cur) return json({ index: [], catatan: "belum ada snapshot" });
      return new Response(cur, {
        headers: { "content-type": "application/json; charset=utf-8", ...CORS, "cache-control": "public, max-age=120" },
      });
    }

    if (url.pathname === "/w/jam.txt") {
      const s = JSON.parse(await readLatest(env));
      const L = [];
      L.push(s.wib.gregorian + " · " + s.wib.hijri.text);
      const a = s.kalender.libur_id_next[0];
      L.push(a ? (a.nama + (a.h_minus === 0 ? ": HARI INI" : ": H-" + a.h_minus) + " (" + a.tanggal + ")") : "libur nasional: sumber belum siap");
      const b = s.kalender.libur_dunia_next[0];
      L.push(b ? (b.nama + " [" + b.negara + "]" + (b.h_minus === 0 ? ": HARI INI" : ": H-" + b.h_minus)) : "libur dunia: sumber belum siap");
      const g = s.seismik.indonesia;
      L.push(g ? ("Gempa ID terbaru: M" + g.mag + " — " + g.wilayah) : "Gempa ID: sumber belum siap");
      return text(L.join("\n") + "\n");
    }

    if (url.pathname === "/api/snapshot/now" && request.method === "POST") {
      if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY belum diset di secrets worker" }, { status: 503 });
      if (request.headers.get("x-trico-key") !== env.ADMIN_KEY) return json({ error: "kunci salah" }, { status: 401 });
      const state = await writeSnapshot(env);
      return json({ ok: true, generated_at: state.generated_at, build_ms: state.build_ms });
    }

    return json({ error: "tidak ditemukan", lihat: ["/health", "/api/state", "/w/jam.txt"] }, { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(writeSnapshot(env).catch((e) => console.error("snapshot gagal:", e)));
  },
};
