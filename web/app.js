/* TRICO v0.2 · perender world-state. Vanilla, tanpa dependensi. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const POTRET_TIAP = 15 * 60 * 1000;
  let state = null;

  /* ------------------------------ util -------------------------------- */

  function lalu(iso) {
    if (!iso) return "--";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return Math.floor(s) + " dtk lalu";
    if (s < 3600) return Math.floor(s / 60) + " mnt lalu";
    if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
    return Math.floor(s / 86400) + " hari lalu";
  }

  function bagianWib() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "Asia/Jakarta",
    }).formatToParts(new Date());
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
    const h = parseInt(g("hour"), 10) % 24;
    const m = parseInt(g("minute"), 10);
    const s = parseInt(g("second"), 10);
    return { h, m, s, menit: h * 60 + m, detik: h * 3600 + m * 60 + s };
  }

  function jamDetail(tz) {
    return new Intl.DateTimeFormat("en-GB", {
      hourCycle: "h23", hour: "2-digit", minute: "2-digit", timeZone: tz,
    }).format(new Date());
  }

  const KOTA = [
    ["JKT", "Asia/Jakarta"], ["MKH", "Asia/Riyadh"], ["LDN", "Europe/London"],
    ["NYC", "America/New_York"], ["TYO", "Asia/Tokyo"],
  ];

  function menitDari(hhmm) {
    const [h, m] = String(hhmm).split(":").map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  /* --------------------------- svg kecil -------------------------------- */

  function histogram(perJam) {
    if (!perJam || !perJam.length) return "";
    const W = 240, H = 40, n = perJam.length;
    const mx = Math.max.apply(null, perJam.concat([1]));
    const bw = W / n;
    let isi = "";
    perJam.forEach((v, i) => {
      const h = Math.max(1, (v / mx) * (H - 5));
      const cls = v === mx && mx > 0 ? "batang maks" : "batang";
      isi += '<rect x="' + (i * bw + 1).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" class="' + cls + '"/>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hist" preserveAspectRatio="none">' + isi + "</svg>";
  }

  function spark(perJam) {
    if (!perJam || perJam.length < 2) return "";
    const W = 240, H = 52, P = 5;
    const vs = perJam.map((p) => p.suhu).filter((v) => typeof v === "number");
    if (!vs.length) return "";
    const mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    const span = mx - mn || 1;
    const pts = perJam.map((p, i) => {
      const x = P + (i * (W - 2 * P)) / (perJam.length - 1);
      const y = P + (1 - (p.suhu - mn) / span) * (H - 2 * P - 8);
      return [x, y];
    });
    const garis = pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const area = P + "," + (H - P) + " " + garis + " " + (W - P) + "," + (H - P);
    const akhir = pts[pts.length - 1];
    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="spark" preserveAspectRatio="none">' +
      '<polygon class="area" points="' + area + '"/>' +
      '<polyline class="tepi" points="' + garis + '"/>' +
      '<circle class="titik" cx="' + akhir[0].toFixed(1) + '" cy="' + akhir[1].toFixed(1) + '" r="2.4"/>' +
      '<text class="lbl" x="' + P + '" y="' + (P + 7) + '">maks ' + mx + "°</text>" +
      '<text class="lbl" x="' + P + '" y="' + (H - 1) + '">min ' + mn + "°</text>" +
      "</svg>"
    );
  }

  /* ------------------------------ render ------------------------------ */

  function renderSeismik(s) {
    const g = s.seismik && s.seismik.indonesia;
    if (!g) {
      $("s-wilayah").textContent = "sumber BMKG belum menjawab, data usang ditandai apa adanya";
      return;
    }
    $("s-mag").textContent = "M" + g.mag;
    $("s-wilayah").textContent = g.wilayah;
    $("s-waktu").textContent = g.waktu + " · " + (g.koordinat || "");
    $("s-dalam").textContent = "kedalaman " + (g.kedalaman || "-");
    const lenc = $("s-potensi");
    const pot = (g.potensi || "").toLowerCase();
    if (pot.indexOf("berpotensi") >= 0 && pot.indexOf("tidak") < 0) {
      lenc.textContent = "PERINGATAN: " + g.potensi;
      lenc.className = "lencana bahaya";
    } else {
      lenc.textContent = g.potensi || "tidak berpotensi tsunami";
      lenc.className = "lencana ok";
    }
  }

  function renderGlobal(s) {
    const g = s.seismik && s.seismik.global;
    if (!g) return;
    $("g-jumlah").textContent = g.jumlah;
    $("g-maks").textContent = "M" + g.maks;
    $("g-hist").innerHTML = histogram(g.per_jam);
    $("g-top3").innerHTML = (g.top3 || [])
      .map((q) => '<li><span class="m">M' + q.mag + "</span><span>" + esc(q.place) + "</span></li>")
      .join("");
  }

  function renderKalender(s) {
    $("k-greg").textContent = s.wib.gregorian;
    $("k-hijri").textContent = s.wib.hijri.text;
    const items = []
      .concat((s.kalender.libur_id_next || []).map((h) => ({ n: h.nama, hm: h.h_minus })))
      .concat((s.kalender.libur_dunia_next || []).map((h) => ({ n: h.nama + " · " + h.negara, hm: h.h_minus })));
    $("k-libur").innerHTML = items.slice(0, 4)
      .map((i) => {
        const h = i.hm === 0 ? "HARI INI" : "H-" + i.hm;
        return '<div class="chip"><b>' + esc(i.n) + '</b><span class="h">' + h + "</span></div>";
      })
      .join("") || '<div class="chip"><b>sumber libur belum siap</b></div>';
  }

  function renderBerita(s) {
    const rows = s.berita || [];
    $("b-list").innerHTML = rows.length
      ? rows.slice(0, 7).map((b) =>
          '<li><div class="j">' + esc(b.judul) + '</div><div class="m"><span>' +
          esc(b.sumber || "tanpa sumber") + "</span><span>" + lalu(b.waktu) + "</span></div></li>"
        ).join("")
      : '<li class="redup">sumber berita belum menjawab</li>';
  }

  function renderCuaca(s) {
    const c = s.cuaca;
    if (!c || !c.kini) return;
    $("c-suhu").textContent = Math.round(c.kini.suhu) + "°";
    $("c-teks").textContent = c.kini.teks;
    $("c-detail").textContent = "lembap " + c.kini.lembap + "% · angin " + c.kini.angin + " km/j";
    $("c-spark").innerHTML = spark(c.per_jam);
  }

  const URUT_SHOLAT = [
    ["imsak", "imsak"], ["subuh", "subuh"], ["terbit", "terbit"], ["dzuhur", "dzuhur"],
    ["ashar", "ashar"], ["maghrib", "maghrib"], ["isya", "isya"],
  ];

  function renderSholat(s) {
    const j = s.sholat && s.sholat.jadwal;
    if (!j) return;
    const wib = bagianWib();
    const marks = URUT_SHOLAT.map(([k, n]) => ({ k, n, t: j[k], m: menitDari(j[k]) }));
    let next = null;
    for (const mk of marks) if (["subuh", "dzuhur", "ashar", "maghrib", "isya"].includes(mk.k) && mk.m > wib.menit) { next = mk; break; }
    if (!next) next = marks.find((m) => m.k === "subuh");

    $("h-next").textContent = next ? next.n : "--";
    $("h-tl").innerHTML =
      '<div class="tl-track"></div>' +
      '<div class="tl-now" style="left:' + ((wib.detik / 86400) * 100).toFixed(2) + '%"></div>' +
      marks.map((mk) => {
        const kiri = ((mk.m / 1440) * 100).toFixed(2);
        const ikut = next && mk.k === next.k ? " ikut" : "";
        return '<div class="tm punya' + ikut + '" style="left:' + kiri + '%"><i></i><span>' + mk.n + "</span><em>" + mk.t + "</em></div>";
      }).join("");
    $("h-grid").innerHTML = marks.map((mk) => {
      const ikut = next && mk.k === next.k ? " ikut" : "";
      return '<div class="sg' + ikut + '"><span>' + mk.n + "</span><b>" + mk.t + "</b></div>";
    }).join("");
  }

  function hitungMundurSholat(s) {
    const j = s.sholat && s.sholat.jadwal;
    if (!j) return;
    const wib = bagianWib();
    const nama = ["subuh", "dzuhur", "ashar", "maghrib", "isya"];
    let target = null;
    for (const k of nama) { const m = menitDari(j[k]); if (m * 60 > wib.detik) { target = m * 60; break; } }
    if (target == null) target = menitDari(j.subuh) * 60 + 86400;
    let sisa = target - wib.detik;
    if (sisa < 0) sisa += 86400;
    const hh = Math.floor(sisa / 3600), mm = Math.floor((sisa % 3600) / 60), ss = sisa % 60;
    $("h-count").textContent =
      String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  }

  function renderPrediksi(s) {
    const rows = s.prediksi || [];
    $("p-list").innerHTML = rows.length
      ? rows.map((p) =>
          '<div class="pred"><div class="pred-atas"><span class="pred-j">' + esc(p.judul) +
          '</span><span class="pred-p mono">' + p.prob + '%</span></div>' +
          '<div class="pbar"><i style="width:' + p.prob + '%"></i></div></div>'
        ).join("")
      : '<div class="redup kecil">pasar prediksi belum menjawab</div>';
  }

  function renderSumber(s) {
    const label = {
      bmkg: "BMKG seismik", usgs: "USGS dunia", gnews: "Google Berita",
      polymarket: "Polymarket", open_meteo: "Open-Meteo cuaca", aladhan: "Aladhan sholat",
      nager: "Nager libur", wikipedia: "Wikipedia",
    };
    $("u-list").innerHTML = Object.entries(s.sources || {})
      .map(([k, v]) => {
        const cls = v.ok ? "dot ok" : "dot buruk";
        return '<li><span class="' + cls + '"></span>' + (label[k] || k) +
          '<span class="ms">' + v.ms + " md</span></li>";
      })
      .join("");
    $("f-gen").textContent =
      "world-state " + (s.schema || "?") + " · dibuat " + lalu(s.generated_at) + " · proses " + (s.build_ms || "?") + " md";
  }

  function potret(s) {
    const gen = new Date(s.generated_at).getTime();
    $("u-dibuat").textContent = lalu(s.generated_at);
    const sisa = Math.max(0, gen + POTRET_TIAP - Date.now());
    $("u-ikut").textContent = Math.floor(sisa / 60000) + ":" + String(Math.floor((sisa % 60000) / 1000)).padStart(2, "0");
    const frac = Math.min(1, Math.max(0, (Date.now() - gen) / POTRET_TIAP));
    $("u-prog").style.width = (frac * 100).toFixed(1) + "%";
  }

  function renderSejarah(s) {
    const rows = s.hari_ini_dalam_sejarah || [];
    $("j-list").innerHTML = rows.length
      ? rows.map((e) =>
          '<div class="sj"><div class="th">' + esc(e.tahun) + '</div><div class="tx">' + esc(e.teks) + "</div></div>"
        ).join("")
      : '<div class="sj"><div class="th">--</div><div class="tx">sumber wikipedia belum menjawab</div></div>';
  }

  function render(s) {
    renderSeismik(s);
    renderGlobal(s);
    renderKalender(s);
    renderBerita(s);
    renderCuaca(s);
    renderSholat(s);
    renderPrediksi(s);
    renderSumber(s);
    renderSejarah(s);
    potret(s);
    const usang = Object.values(s.sources || {}).some((v) => !v.ok);
    $("dot").className = "dot " + (usang ? "ingat" : "ok");
    $("dot").title = usang ? "sebagian sumber usang" : "semua sumber segar";
  }

  /* ------------------------------ polling ------------------------------ */

  async function poll() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state = await res.json();
      render(state);
    } catch (e) {
      $("dot").className = "dot buruk";
      $("dot").title = "gagal mengambil state: " + e.message;
    }
  }

  async function pollRingkas() {
    const pre = $("ringkas");
    if (!pre) return;
    try {
      const res = await fetch("/w/jam.txt", { cache: "no-store" });
      pre.textContent = await res.text();
    } catch {
      pre.textContent = "ringkasan belum tersedia.";
    }
  }

  /* ------------------------------ boot -------------------------------- */

  function detik() {
    $("jam-lokal").textContent = jamDetail("Asia/Jakarta");
    $("jam-dunia").innerHTML = KOTA.map(([kode, tz]) =>
      '<span class="kota">' + kode + " <b>" + jamDetail(tz) + "</b></span>"
    ).join("");
    if (state) { potret(state); hitungMundurSholat(state); renderSholat(state); }
  }

  $("jam-dunia").innerHTML = KOTA.map(([kode, tz]) =>
    '<span class="kota">' + kode + " <b>" + jamDetail(tz) + "</b></span>"
  ).join("");

  setInterval(detik, 1000);
  detik();
  poll();
  pollRingkas();
  setInterval(poll, 60 * 1000);
  setInterval(pollRingkas, 5 * 60 * 1000);
})();
