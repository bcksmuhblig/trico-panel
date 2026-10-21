/**
 * TRICO-CORE v0.2
 * Perombakan total: sembilan sumber, visual-first, bahasa Indonesia.
 *
 *   - scheduled(): membangkitkan World-State tiap 15 menit, simpan ke KV
 *   - GET /api/state           -> state terbaru
 *   - GET /api/state/index     -> indeks potret (48 jam)
 *   - GET /w/jam.txt           -> teks ringkas kalender (widget)
 *   - GET /health              -> status worker
 *   - POST /api/snapshot/now   -> paksa potret (header: x-trico-key)
 *
 * Prinsip (ADR-001): data usang ditandai apa adanya, tidak ada yang pura-pura segar.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,x-trico-key",
};

const UA = { "User-Agent": "trico-panel/0.2 (panel pribadi)" };

const SRC = {
  bmkg: "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
  usgs: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
  nager_id: "https://date.nager.at/api/v3/NextPublicHolidays/ID",
  nager_world: "https://date.nager.at/api/v3/NextPublicHolidaysWorldwide",
  cuaca: "https://api.open-meteo.com/v1/forecast?latitude=-6.2&longitude=106.82&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m&timezone=Asia%2FJakarta&forecast_days=1",
  sholat_base: "https://api.aladhan.com/v1/timingsByCity/",
  prediksi: "https://gamma-api.polymarket.com/events/keyset?active=true&closed=false&order=volume24hr&ascending=false&limit=40",
  prediksi_cadangan: "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=40",
  berita: "https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id",
};

const BULAN_HIJRI = [
  "Muharam", "Safar", "Rabiulawal", "Rabiulakhir", "Jumadilawal", "Jumadilakhir",
  "Rajab", "Syakban", "Ramadhan", "Syawal", "Zulkaidah", "Zulhijah",
];

const KODE_CUACA = {
  0: "Cerah", 1: "Hampir cerah", 2: "Berawan sebagian", 3: "Berawan",
  45: "Kabut", 48: "Kabut beku",
  51: "Gerimis ringan", 53: "Gerimis", 55: "Gerimis deras",
  61: "Hujan ringan", 63: "Hujan", 65: "Hujan deras",
  66: "Hujan beku", 67: "Hujan beku deras",
  71: "Salju ringan", 73: "Salju", 75: "Salju deras",
  80: "Hujan lokal ringan", 81: "Hujan lokal", 82: "Hujan lokal deras",
  95: "Badai petir", 96: "Badai petir es", 99: "Badai petir es",
};

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

async function ambil(url, ms = 9000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { headers: UA, signal: ctrl.signal, cf: { cacheTtl: 60 } });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, ms: Date.now() - t0, status: res.status };
    const raw = await res.text();
    return { ok: true, ms: Date.now() - t0, status: res.status, raw };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, status: 0 };
  }
}

async function ambilJson(url, ms = 9000) {
  const r = await ambil(url, ms);
  if (!r.ok) return r;
  try { r.data = JSON.parse(r.raw); } catch { r.ok = false; }
  return r;
}

function wibDateStr(d) {
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
    return { text: day + " " + BULAN_HIJRI[monthIdx] + " " + year + "H", day, month: monthIdx + 1, year };
  } catch {
    return { text: "-" };
  }
}

function hMinus(dateStr, todayStr) {
  const a = new Date(todayStr + "T00:00:00Z");
  const b = new Date(dateStr + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function bersihEnt(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}

function parseRss(xml, n, lihat) {
  const out = [];
  const sudah = new Set();
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && out.length < n + lihat) {
    const blk = m[1];
    const tm = blk.match(/<title>([\s\S]*?)<\/title>/);
    if (!tm) continue;
    let t = bersihEnt(tm[1].replace(/<!\[CDATA\[|\]\]>/g, ""));
    const bagian = t.split(" - ");
    const sumber = bagian.length > 1 ? bagian.pop() : "";
    const judul = bagian.join(" - ").trim();
    if (!judul) continue;
    const kunci = judul.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 50);
    if (sudah.has(kunci)) continue;
    sudah.add(kunci);
    const pm = blk.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    out.push({ judul, sumber, waktu: pm ? new Date(pm[1]).toISOString() : null });
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}

/* ------------------------- pembangun world-state ------------------------ */

async function bangunState() {
  const t0 = Date.now();
  const now = new Date();
  const wibStr = wibDateStr(now);
  const nowMs = now.getTime();
  const [mm, dd, yyyy] = [wibStr.slice(5, 7), wibStr.slice(8, 10), wibStr.slice(0, 4)];
  const wikiUrl = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/" + mm + "/" + dd;
  const sholatUrl = SRC.sholat_base + dd + "-" + mm + "-" + yyyy + "?city=Jakarta&country=Indonesia&method=20";

  const [bmkg, usgs, nagerId, nagerWorld, wiki, cuaca, sholat, poly, gnews] = await Promise.all([
    ambilJson(SRC.bmkg), ambilJson(SRC.usgs), ambilJson(SRC.nager_id), ambilJson(SRC.nager_world),
    ambilJson(wikiUrl), ambilJson(SRC.cuaca), ambilJson(sholatUrl), ambilJson(SRC.prediksi), ambil(SRC.berita),
  ]);

  // --- seismik
  const seismik = { indonesia: null, global: null };
  if (bmkg.ok) {
    const g = bmkg.data && bmkg.data.Infogempa && bmkg.data.Infogempa.gempa;
    if (g) {
      seismik.indonesia = {
        mag: g.Magnitude, wilayah: g.Wilayah, kedalaman: g.Kedalaman,
        waktu: (g.Tanggal || "") + " " + (g.Jam || ""), potensi: g.Potensi || "",
        koordinat: g.Coordinates || "",
      };
    }
  }
  if (usgs.ok) {
    const f = (usgs.data && usgs.data.features) || [];
    let max = 0;
    const perJam = new Array(24).fill(0);
    for (const x of f) {
      const p = x.properties || {};
      if ((p.mag || 0) > max) max = p.mag;
      if (p.time) {
        const idx = Math.floor((nowMs - p.time) / 3600000);
        if (idx >= 0 && idx < 24) perJam[23 - idx]++;
      }
    }
    const top3 = f.slice()
      .sort((a, b) => ((b.properties || {}).mag || 0) - ((a.properties || {}).mag || 0))
      .slice(0, 3)
      .map((x) => ({
        mag: x.properties && x.properties.mag,
        place: x.properties && x.properties.place,
        time: x.properties && x.properties.time ? new Date(x.properties.time).toISOString() : null,
      }));
    seismik.global = { jumlah: f.length, maks: max, per_jam: perJam, top3 };
  }

  // --- kalender
  const liburId = (nagerId.ok && Array.isArray(nagerId.data) ? nagerId.data : [])
    .map((h) => ({ nama: h.localName || h.name, tanggal: h.date, h_minus: hMinus(h.date, wibStr) }))
    .filter((h) => h.h_minus != null && h.h_minus >= 0)
    .slice(0, 3);
  const liburWorld = (nagerWorld.ok && Array.isArray(nagerWorld.data) ? nagerWorld.data : [])
    .map((h) => ({ nama: h.name, negara: h.countryCode, tanggal: h.date, h_minus: hMinus(h.date, wibStr) }))
    .filter((h) => h.h_minus != null && h.h_minus >= 0)
    .slice(0, 3);

  // --- sejarah
  let sejarah = [];
  if (wiki.ok && wiki.data && Array.isArray(wiki.data.events)) {
    sejarah = wiki.data.events.slice(0, 3).map((e) => ({
      tahun: e.year,
      teks: typeof e.text === "string" && e.text.length > 170 ? e.text.slice(0, 170) + " ..." : e.text,
    }));
  }

  // --- cuaca Jakarta
  let wx = null;
  if (cuaca.ok && cuaca.data && cuaca.data.current) {
    const c = cuaca.data.current;
    const jamArr = (cuaca.data.hourly && cuaca.data.hourly.time) || [];
    const suhuArr = (cuaca.data.hourly && cuaca.data.hourly.temperature_2m) || [];
    wx = {
      kota: "Jakarta",
      kini: {
        suhu: c.temperature_2m, lembap: c.relative_humidity_2m,
        angin: c.wind_speed_10m, teks: KODE_CUACA[c.weather_code] || "-",
      },
      per_jam: jamArr.slice(0, 24).map((t, i) => ({ jam: String(t).slice(11, 16), suhu: suhuArr[i] })),
    };
  }

  // --- jadwal sholat Jakarta (metode Kemenag)
  let solat = null;
  if (sholat.ok && sholat.data && sholat.data.data && sholat.data.data.timings) {
    const t = sholat.data.data.timings;
    const bersih = (v) => String(v || "").slice(0, 5);
    solat = {
      kota: "Jakarta",
      jadwal: {
        imsak: bersih(t.Imsak), subuh: bersih(t.Fajr), terbit: bersih(t.Sunrise),
        dzuhur: bersih(t.Dhuhr), ashar: bersih(t.Asr), maghrib: bersih(t.Maghrib), isya: bersih(t.Isha),
      },
    };
  }

  // --- pasar prediksi uang nyata, disaring dari olahraga dan pasar mati
  const TAG_OLAHRAGA = [
    "sports", "soccer", "football", "tennis", "nba", "nfl", "mlb", "nhl",
    "mma", "ufc", "boxing", "golf", "cricket", "formula-1", "esports",
    "basketball", "baseball", "hockey", "racing", "champions-league",
    "premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1", "euroleague",
  ];

  function ekstrakPrediksi(events) {
    const hasil = [];
    const pernah = new Set();
    const urut = events.slice().sort((a, b) => (b.volume24hr || 0) - (a.volume24hr || 0));
    for (const ev of urut) {
      let judul = String(ev.title || "").trim();
      if (!judul) continue;
      judul = judul.replace(/ - More Markets$/i, "");
      const basis = judul.toLowerCase();
      if (pernah.has(basis)) continue;
      const tags = (Array.isArray(ev.tags) ? ev.tags : [])
        .map((t) => String((t && (t.slug || t.label)) || "").toLowerCase());
      if (tags.some((t) => TAG_OLAHRAGA.some((o) => t.includes(o)))) continue;
      if (/\bvs\.?\b/i.test(judul)) continue;
      const calon = (Array.isArray(ev.markets) ? ev.markets : [])
        .filter((m) => m && m.closed !== true)
        .sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
      let prob = null;
      for (const mk of calon) {
        try {
          const p = JSON.parse(mk.outcomePrices || "[]");
          const v = parseFloat(p[0]);
          if (p.length && !isNaN(v)) { prob = Math.round(v * 100); break; }
        } catch {}
      }
      if (prob == null || prob < 1 || prob > 99) continue;
      pernah.add(basis);
      hasil.push({ judul, prob, volume: Math.round(ev.volume24hr || 0) });
      if (hasil.length >= 6) break;
    }
    return hasil;
  }

  let prediksi = [];
  if (poly.ok && poly.data) {
    const events = Array.isArray(poly.data) ? poly.data : poly.data.events || [];
    prediksi = ekstrakPrediksi(events);
    if (!prediksi.length) {
      const cad = await ambilJson(SRC.prediksi_cadangan);
      if (cad.ok && cad.data) {
        const events2 = Array.isArray(cad.data) ? cad.data : cad.data.events || [];
        prediksi = ekstrakPrediksi(events2);
      }
    }
  }

  // --- berita utama
  let berita = [];
  if (gnews.ok && gnews.raw) berita = parseRss(gnews.raw, 8, 14);

  return {
    schema: "trico.world-state/0.2",
    generated_at: now.toISOString(),
    build_ms: Date.now() - t0,
    wib: { tanggal: wibStr, gregorian: gregorianId(now), hijri: hijriId(now) },
    seismik,
    berita,
    prediksi,
    cuaca: wx,
    sholat: solat,
    kalender: { libur_id_next: liburId, libur_dunia_next: liburWorld },
    hari_ini_dalam_sejarah: sejarah,
    sources: {
      bmkg: { ok: bmkg.ok, ms: bmkg.ms, status: bmkg.status },
      usgs: { ok: usgs.ok, ms: usgs.ms, status: usgs.status },
      gnews: { ok: gnews.ok, ms: gnews.ms, status: gnews.status },
      polymarket: { ok: poly.ok, ms: poly.ms, status: poly.status },
      open_meteo: { ok: cuaca.ok, ms: cuaca.ms, status: cuaca.status },
      aladhan: { ok: sholat.ok, ms: sholat.ms, status: sholat.status },
      nager: { ok: nagerId.ok && nagerWorld.ok, ms: nagerId.ms + nagerWorld.ms, status: nagerId.status },
      wikipedia: { ok: wiki.ok, ms: wiki.ms, status: wiki.status },
    },
    catatan: "Fase 0.2. Radar GDELT dan agenda pada fase satu, asisten suara pada fase dua.",
  };
}

async function tulisPotret(env) {
  const state = await bangunState();
  const body = JSON.stringify(state);
  const iso = state.generated_at;
  const kunci = "state/" + iso.slice(0, 10) + "/" + iso.slice(11, 16).replace(":", "-") + ".json";

  await env.STATE.put("state/latest.json", body);
  await env.STATE.put(kunci, body, { expirationTtl: 7 * 24 * 3600 });

  let idx = [];
  try {
    const cur = await env.STATE.get("state/index.json");
    if (cur) {
      idx = JSON.parse(cur);
      if (!Array.isArray(idx)) idx = [];
    }
  } catch {}
  idx.unshift(kunci);
  idx = idx.slice(0, 192);
  await env.STATE.put("state/index.json", JSON.stringify(idx));

  return state;
}

async function bacaTerbaru(env) {
  const cur = await env.STATE.get("state/latest.json");
  if (cur) return cur;
  const state = await tulisPotret(env);
  return JSON.stringify(state);
}

/* ------------------------------- widget -------------------------------- */

function menitKe(hhmm) {
  const [h, m] = String(hhmm).split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

function jadwalBerikut(jadwal, sekarangWibMenit) {
  const urut = ["subuh", "dzuhur", "ashar", "maghrib", "isya"];
  for (const n of urut) {
    if (menitKe(jadwal[n]) > sekarangWibMenit) return { nama: n, jam: jadwal[n] };
  }
  return { nama: "subuh", jam: jadwal.subuh, besok: true };
}

/* -------------------------------- router -------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/health") {
      return json({
        ok: true, layanan: "trico-core", versi: "0.2.0",
        kini: new Date().toISOString(), jadwal: "*/15 * * * *",
        binding: { state_kv: !!env.STATE, admin_key: !!env.ADMIN_KEY },
      });
    }

    if (url.pathname === "/api/state") {
      const body = await bacaTerbaru(env);
      return new Response(body, {
        headers: { "content-type": "application/json; charset=utf-8", ...CORS, "cache-control": "public, max-age=60" },
      });
    }

    if (url.pathname === "/api/state/index") {
      const cur = await env.STATE.get("state/index.json");
      if (!cur) return json({ index: [], catatan: "belum ada potret" });
      return new Response(cur, {
        headers: { "content-type": "application/json; charset=utf-8", ...CORS, "cache-control": "public, max-age=120" },
      });
    }

    if (url.pathname === "/w/jam.txt") {
      const s = JSON.parse(await bacaTerbaru(env));
      const L = [];
      L.push(s.wib.gregorian + " · " + s.wib.hijri.text);
      if (s.sholat) {
        const bagian = new Intl.DateTimeFormat("en-GB", {
          hourCycle: "h23", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
        }).formatToParts(new Date());
        const ambil = (t) => { const p = bagian.find((x) => x.type === t); return p ? p.value : "00"; };
        const menitSkrg = (parseInt(ambil("hour"), 10) % 24) * 60 + parseInt(ambil("minute"), 10);
        const nx = jadwalBerikut(s.sholat.jadwal, menitSkrg);
        L.push("Sholat berikutnya: " + nx.nama + " " + nx.jam + (nx.besok ? " (besok)" : ""));
      }
      const a = s.kalender.libur_id_next[0];
      L.push(a ? (a.nama + (a.h_minus === 0 ? ": HARI INI" : ": H-" + a.h_minus) + " (" + a.tanggal + ")") : "libur nasional: sumber belum siap");
      const b = s.kalender.libur_dunia_next[0];
      L.push(b ? (b.nama + " [" + b.negara + "]" + (b.h_minus === 0 ? ": HARI INI" : ": H-" + b.h_minus)) : "libur dunia: sumber belum siap");
      const g = s.seismik.indonesia;
      L.push(g ? ("Gempa terbaru: M" + g.mag + " · " + g.wilayah) : "gempa: sumber belum siap");
      return text(L.join("\n") + "\n");
    }

    if (url.pathname === "/api/snapshot/now" && request.method === "POST") {
      if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY belum diset" }, { status: 503 });
      if (request.headers.get("x-trico-key") !== env.ADMIN_KEY) return json({ error: "kunci salah" }, { status: 401 });
      const state = await tulisPotret(env);
      return json({ ok: true, dibuat: state.generated_at, build_ms: state.build_ms });
    }

    return json({ error: "tidak ditemukan" }, { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tulisPotret(env).catch((e) => console.error("potret gagal:", e)));
  },
};
