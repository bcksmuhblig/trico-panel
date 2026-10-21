/* TRICO PANEL v0.1 — renderer world-state. Tanpa framework, tanpa build. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const INTERVAL_SNAPSHOT = 15 * 60 * 1000; // 15 mnt
  let state = null;
  let lastPoll = 0;

  /* ------------------------------ util -------------------------------- */

  function ago(iso) {
    if (!iso) return "—";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return Math.floor(s) + " dtk lalu";
    if (s < 3600) return Math.floor(s / 60) + " mnt lalu";
    if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
    return Math.floor(s / 86400) + " hari lalu";
  }

  function jamWib() {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZone: "Asia/Jakarta",
    }).format(new Date());
  }

  /* ------------------------------ render ------------------------------ */

  function renderSeismik(s) {
    const g = s.seismik && s.seismik.indonesia;
    if (!g) {
      $("id-mag").textContent = "—";
      $("id-wilayah").textContent = "sumber BMKG belum menjawab (stale terhormat)";
      return;
    }
    $("id-mag").textContent = "M" + g.mag;
    $("id-wilayah").textContent = g.wilayah;
    $("id-waktu").textContent = g.waktu + " · kedalaman " + g.kedalaman;
    const badge = $("id-potensi");
    const pot = (g.potensi || "").toLowerCase();
    if (pot.includes("berpotensi") && !pot.includes("tidak")) {
      badge.textContent = "⚠ " + g.potensi;
      badge.className = "badge danger";
    } else {
      badge.textContent = g.potensi || "tidak berpotensi tsunami";
      badge.className = "badge ok";
    }
  }

  function renderGlobal(s) {
    const g = s.seismik && s.seismik.global;
    if (!g) return;
    $("g-count").textContent = g.count24h_m25;
    $("g-max").textContent = "M" + g.max24h;
    $("g-top3").innerHTML = (g.top3 || [])
      .map((q) => `<li><span class="m">M${q.mag}</span><span>${q.place || ""}</span></li>`)
      .join("");
  }

  function renderKalender(s) {
    $("kal-greg").textContent = s.wib.gregorian;
    $("kal-hijri").textContent = s.wib.hijri.text;
    const items = [
      ...(s.kalender.libur_id_next || []).map((h) => ({ nama: h.nama, h: h.h_minus === 0 ? "HARI INI" : "H-" + h.h_minus })),
      ...(s.kalender.libur_dunia_next || []).map((h) => ({ nama: `${h.nama} · ${h.negara}`, h: h.h_minus === 0 ? "HARI INI" : "H-" + h.h_minus })),
    ];
    $("kal-libur").innerHTML = items.slice(0, 4)
      .map((i) => `<div class="chip"><b>${i.nama}</b><span class="h">${i.h}</span></div>`)
      .join("") || `<div class="chip"><b>sumber libur belum siap</b></div>`;
  }

  function renderSejarah(s) {
    const rows = s.hari_ini_dalam_sejarah || [];
    $("sejarah").innerHTML = rows
      .map((e) => `<li><span class="tahun">${e.tahun}</span><span>${e.teks}</span></li>`)
      .join("") || `<li><span class="tahun">—</span><span>sumber wikipedia belum menjawab</span></li>`;
  }

  function renderSumber(s) {
    const label = { bmkg: "BMKG TEWS (ID)", usgs: "USGS (global)", nager_id: "Nager · libur ID", nager_world: "Nager · dunia", wikipedia: "Wikipedia" };
    $("sources").innerHTML = Object.entries(s.sources || {})
      .map(([k, v]) => {
        const cls = v.ok ? "dot-ok" : "dot-bad";
        return `<li><span class="dot ${cls}"></span>${label[k] || k}<span class="ms">${v.ms} ms · ${v.status}</span></li>`;
      })
      .join("");
    $("foot-gen").textContent = "world-state " + (s.schema || "?") + " · dibuat " + ago(s.generated_at) + " · build " + (s.build_ms || "?") + " ms";
  }

  function renderSnap(s) {
    const gen = new Date(s.generated_at).getTime();
    $("snap-age").textContent = ago(s.generated_at);
    const next = gen + INTERVAL_SNAPSHOT;
    const remain = Math.max(0, next - Date.now());
    $("snap-next").textContent = Math.floor(remain / 60000) + ":" + String(Math.floor((remain % 60000) / 1000)).padStart(2, "0");
    const frac = Math.min(1, Math.max(0, (Date.now() - gen) / INTERVAL_SNAPSHOT));
    $("snap-progress").style.width = (frac * 100).toFixed(1) + "%";
  }

  function render(s) {
    renderSeismik(s);
    renderGlobal(s);
    renderKalender(s);
    renderSejarah(s);
    renderSumber(s);
    renderSnap(s);
    const anyBad = Object.values(s.sources || {}).some((v) => !v.ok);
    $("status-dot").className = "dot " + (anyBad ? "dot-warn" : "dot-ok");
    $("status-dot").title = anyBad ? "sebagian sumber stale" : "semua sumber segar";
  }

  /* ------------------------------ polling ------------------------------ */

  async function poll() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state = await res.json();
      lastPoll = Date.now();
      render(state);
    } catch (e) {
      $("status-dot").className = "dot dot-bad";
      $("status-dot").title = "gagal mengambil state: " + e.message;
    }
  }

  async function pollMobile() {
    const pre = $("mobile-ringkas");
    if (!pre) return;
    try {
      const res = await fetch("/w/jam.txt", { cache: "no-store" });
      pre.textContent = await res.text();
    } catch {
      pre.textContent = "ringkasan belum tersedia.";
    }
  }

  /* ------------------------------ boot -------------------------------- */

  setInterval(() => { $("clock-wib").textContent = jamWib(); }, 1000);
  $("clock-wib").textContent = jamWib();

  poll();
  pollMobile();
  setInterval(poll, 60 * 1000);
  setInterval(pollMobile, 5 * 60 * 1000);
  setInterval(() => { if (state) renderSnap(state); }, 1000);
})();
