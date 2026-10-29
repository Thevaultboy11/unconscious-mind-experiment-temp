/* Results dashboard for the Unconscious Mind priming experiment.
 * Open dashboard.html in Chrome, drop in the result CSV files. Everything runs locally; no data leaves the laptop.
 */
(function () {
  "use strict";

  // ============================================================ constants
  const GROUPS = [
    { key: "beach", label: "Beach prime", short: "Beach", color: "var(--g-beach)" },
    { key: "none", label: "No prime (control)", short: "Control", color: "var(--g-none)" },
    { key: "football", label: "Football prime", short: "Football", color: "var(--g-football)" },
  ];
  const G = Object.fromEntries(GROUPS.map((g) => [g.key, g]));
  const PURPOSE_RE = /prim|sublim|flash|flick|hidden|subconscious|unconscious|beach|football|soccer|summer|picture.*(between|flick)|image.*(between|flick)/i;

  const state = {
    rows: [],          // parsed participants (deduplicated)
    files: [],
    simulated: false,
    filters: { gender: "all", laptop: "all", exNoticed: false, exPerfectRecog: false, exVision: false, exTiming: false, exFast: false, exGuessed: false },
    sort: { key: "id", dir: 1 },
  };

  // ============================================================ helpers
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const variance = (a) => { if (a.length < 2) return NaN; const m = mean(a); return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1); };
  const sd = (a) => Math.sqrt(variance(a));
  const niceMax = (v) => Math.max(4, Math.ceil(v / 4) * 4);
  const pct = (x, d = 0) => (Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "–");
  const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");
  const fp = (p) => (!Number.isFinite(p) ? "–" : p < 0.001 ? "< .001" : p.toFixed(3).replace(/^0/, ""));
  const pEq = (p) => (!Number.isFinite(p) ? "p = –" : p < 0.001 ? "p < .001" : "p = " + fp(p));

  // ============================================================ statistics
  function lnGamma(z) {
    const c = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = 0.99999999999980993;
    for (let i = 0; i < 8; i++) x += c[i] / (z + i + 1);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularized incomplete beta I_x(a,b)
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  function gammaP(a, x) { // regularized lower incomplete gamma
    if (x <= 0) return 0;
    if (x < a + 1) {
      let ap = a, s = 1 / a, del = s;
      for (let n = 0; n < 500; n++) { ap++; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
      return s * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  const tTwoSided = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);
  const fUpper = (F, d1, d2) => (F <= 0 ? 1 : 1 - ibeta((d1 * F) / (d1 * F + d2), d1 / 2, d2 / 2));
  const chiUpper = (x, k) => 1 - gammaP(k / 2, x / 2);
  function tCrit(df, alpha = 0.05) { // two-sided critical value by bisection
    if (!(df > 0)) return NaN;
    let lo = 0, hi = 1000;
    for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (tTwoSided(m, df) > alpha) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function ci95(a) {
    if (a.length < 2) return [NaN, NaN];
    const m = mean(a), h = tCrit(a.length - 1) * sd(a) / Math.sqrt(a.length);
    return [m - h, m + h];
  }
  function welch(a, b) {
    if (a.length < 2 || b.length < 2) return null;
    const va = variance(a), vb = variance(b), se2 = va / a.length + vb / b.length;
    const diff = mean(a) - mean(b);
    if (se2 === 0) return { diff, t: NaN, df: NaN, p: NaN, d: NaN };
    const t = diff / Math.sqrt(se2);
    const df = (se2 * se2) / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
    const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
    return { diff, t, df, p: tTwoSided(Math.abs(t), df), d: sp > 0 ? diff / sp : NaN };
  }
  const oneSided = (r, expectPositive) => (!r || !Number.isFinite(r.p) ? NaN : (r.t > 0) === expectPositive ? r.p / 2 : 1 - r.p / 2);
  function anova(groups) {
    const gs = groups.filter((g) => g.length > 0);
    const all = gs.flat(), N = all.length, k = gs.length;
    if (k < 2 || N - k < 1) return null;
    const gm = mean(all);
    const ssb = sum(gs.map((g) => g.length * (mean(g) - gm) ** 2));
    const ssw = sum(gs.map((g) => sum(g.map((x) => (x - mean(g)) ** 2))));
    const df1 = k - 1, df2 = N - k;
    if (ssw === 0) return { F: NaN, df1, df2, p: NaN, eta2: NaN };
    const F = ssb / df1 / (ssw / df2);
    return { F, df1, df2, p: fUpper(F, df1, df2), eta2: ssb / (ssb + ssw) };
  }
  function kruskal(groups) {
    const gs = groups.filter((g) => g.length > 0);
    if (gs.length < 2) return null;
    const all = [];
    gs.forEach((g, gi) => g.forEach((v) => all.push({ v, gi })));
    all.sort((a, b) => a.v - b.v);
    const N = all.length;
    let i = 0, tieSum = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && all[j + 1].v === all[i].v) j++;
      const r = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) all[k].r = r;
      const t = j - i + 1; tieSum += t ** 3 - t;
      i = j + 1;
    }
    const R = gs.map(() => 0);
    all.forEach((x) => (R[x.gi] += x.r));
    let H = (12 / (N * (N + 1))) * sum(gs.map((g, gi) => (R[gi] ** 2) / g.length)) - 3 * (N + 1);
    const corr = 1 - tieSum / (N ** 3 - N);
    if (corr > 0) H /= corr;
    const df = gs.length - 1;
    return { H, df, p: corr > 0 ? chiUpper(H, df) : NaN };
  }
  function chiSquare(table) { // rows x cols counts
    const R = table.length, C = table[0].length;
    const rs = table.map((r) => sum(r)), cs = table[0].map((_, j) => sum(table.map((r) => r[j]))), N = sum(rs);
    if (!N) return null;
    let x2 = 0;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const e = (rs[i] * cs[j]) / N;
      if (e > 0) x2 += (table[i][j] - e) ** 2 / e;
    }
    const df = (rs.filter((x) => x > 0).length - 1) * (cs.filter((x) => x > 0).length - 1);
    return { x2, df, p: df > 0 ? chiUpper(x2, df) : NaN, N, V: df > 0 ? Math.sqrt(x2 / (N * Math.min(R - 1, C - 1))) : NaN };
  }
  function binomTwoSided(k, n, p = 0.5) {
    if (!n) return NaN;
    const lp = (i) => lnGamma(n + 1) - lnGamma(i + 1) - lnGamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log(1 - p);
    const obs = lp(k);
    let s = 0;
    for (let i = 0; i <= n; i++) { const l = lp(i); if (l <= obs + 1e-9) s += Math.exp(l); }
    return Math.min(1, s);
  }

  // ============================================================ CSV
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] == null ? "" : r[i]])));
  }
  function toCSV(rows) {
    const cols = [];
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
    const e = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.join(",")].concat(rows.map((r) => cols.map((c) => e(r[c])).join(","))).join("\r\n");
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ============================================================ normalise a CSV row into a participant
  function normalise(raw) {
    const trials = [];
    Object.keys(raw).forEach((k) => {
      const m = k.match(/^pair(\d+)_([a-z_]+)$/i);
      if (!m || /^(rt_ms|order|beach_side)$/.test(m[2])) return;
      const id = +m[1];
      const choice = (raw[k] || "").trim();
      if (choice !== "beach" && choice !== "football") return;
      trials.push({
        pairId: id,
        cat: m[2].charAt(0).toUpperCase() + m[2].slice(1),
        choice,
        rt: num(raw[`pair${id}_rt_ms`]),
        order: num(raw[`pair${id}_order`]),
        beachSide: raw[`pair${id}_beach_side`],
      });
    });
    trials.forEach((t) => { t.choseLeft = (t.choice === "beach") === (t.beachSide === "left"); });
    const beach = trials.filter((t) => t.choice === "beach").length;
    const n = trials.length;
    const cond = (raw.condition || "").trim();
    const p = {
      raw, id: raw.participant_id || "?", laptop: raw.laptop || "?", condition: cond,
      started: raw.started_at, duration: num(raw.duration_s),
      age: num(raw.age), gender: raw.gender || "Unknown", nationality: (raw.nationality || "").trim() || "Unknown",
      year: raw.study_year || "Unknown", vision: raw.vision_ok || "Unknown",
      trials, n, beach, pBeach: n ? beach / n : NaN,
      noticed: raw.noticed_images || "Unknown", saw: raw.saw_description || "", purpose: raw.purpose_guess || "",
      recogCorrect: num(raw.recog_correct), recogTrials: num(raw.recog_trials), recogBeach: num(raw.recog_beach_picks),
      hz: num(raw.refresh_hz), primeTarget: num(raw.prime_ms_target), primeMean: num(raw.prime_ms_mean),
      primeMax: num(raw.prime_ms_max), maskMean: num(raw.mask_ms_mean), dropped: num(raw.dropped_frames) || 0, flashes: num(raw.total_flashes),
    };
    p.primed = cond === "beach" ? beach : cond === "football" ? n - beach : null;
    p.medianRT = median(trials.map((t) => t.rt).filter((x) => x != null));
    p.flags = [];
    if (p.noticed === "Yes") p.flags.push("noticed pictures");
    if (cond !== "none" && p.recogTrials && p.recogCorrect === p.recogTrials) p.flags.push("perfect recognition");
    if (p.vision === "No") p.flags.push("vision");
    if ((p.primeTarget && p.primeMean && p.primeMean > p.primeTarget * 1.6) || p.dropped > 3) p.flags.push("timing");
    if (Number.isFinite(p.medianRT) && p.medianRT < 300) p.flags.push("very fast clicks");
    if (PURPOSE_RE.test(p.purpose + " " + p.saw)) p.flags.push("guessed purpose");
    return p;
  }

  function addCSVText(text, fileName) {
    const parsed = parseCSV(text).filter((r) => r.participant_id && r.condition);
    const seen = new Set(state.rows.map((p) => p.id + "|" + p.started));
    let added = 0;
    parsed.forEach((r) => {
      const key = r.participant_id + "|" + r.started_at;
      if (seen.has(key) || r.participant_id === "DEMO") return;
      seen.add(key);
      state.rows.push(normalise(r));
      added++;
    });
    state.files.push({ name: fileName, rows: parsed.length, added });
  }

  async function loadFiles(fileList) {
    if (state.simulated) { state.rows = []; state.files = []; state.simulated = false; }
    for (const file of Array.from(fileList)) {
      if (!/\.csv$/i.test(file.name)) continue;
      addCSVText(await file.text(), file.name);
    }
    render();
  }

  // ============================================================ simulated data (for trying the dashboard)
  function simulate() {
    const C = window.EXPERIMENT_CONFIG;
    const pairs = (C && C.pairs) || [{ id: 1, category: "Footwear" }, { id: 2, category: "Hats" }, { id: 3, category: "Drinks" }, { id: 4, category: "Food" }, { id: 5, category: "Places" }];
    const base = { 1: 0.45, 2: 0.55, 3: 0.6, 4: 0.7, 5: 0.65, 6: 0.5, 7: 0.55, 8: 0.5, 9: 0.5, 10: 0.5 };
    const shift = { beach: 0.12, none: 0, football: -0.1 };
    const genders = ["Female", "Female", "Male", "Male", "Non-binary", "Prefer not to say"];
    const nats = ["Emirati", "Indian", "American", "Pakistani", "Bosnian", "Chinese", "Egyptian", "Kenyan", "Korean", "Brazilian"];
    const rows = [];
    let k = 0;
    ["beach", "none", "football"].forEach((cond) => {
      for (let i = 0; i < 20; i++) {
        k++;
        const r = { participant_id: `SIM-${String(k).padStart(3, "0")}`, laptop: "L" + (1 + (k % 3)), condition: cond,
          started_at: new Date(Date.UTC(2026, 10, 3, 9, k * 4)).toISOString(), duration_s: Math.round(80 + Math.random() * 70),
          age: 18 + Math.floor(Math.random() * 6), gender: genders[Math.floor(Math.random() * genders.length)],
          nationality: nats[Math.floor(Math.random() * nats.length)], study_year: "Year " + (1 + Math.floor(Math.random() * 4)), vision_ok: Math.random() < 0.95 ? "Yes" : "No",
          n_pairs: pairs.length };
        const indiv = (Math.random() - 0.5) * 0.3;
        let beach = 0;
        const order = pairs.map((p) => p.id).sort(() => Math.random() - 0.5);
        pairs.forEach((p) => {
          const pr = Math.min(0.95, Math.max(0.05, (base[p.id] || 0.5) + shift[cond] + indiv));
          const ch = Math.random() < pr ? "beach" : "football";
          if (ch === "beach") beach++;
          r[`pair${p.id}_${p.category.toLowerCase()}`] = ch;
          r[`pair${p.id}_rt_ms`] = Math.round(700 + Math.random() * 1800);
          r[`pair${p.id}_order`] = order.indexOf(p.id) + 1;
          r[`pair${p.id}_beach_side`] = Math.random() < 0.5 ? "left" : "right";
        });
        r.beach_choices = beach; r.football_choices = pairs.length - beach;
        r.primed_choices = cond === "beach" ? beach : cond === "football" ? pairs.length - beach : "NA";
        const nr = Math.random();
        r.noticed_images = nr < 0.12 ? "Yes" : nr < 0.35 ? "Not sure" : "No";
        r.saw_description = r.noticed_images === "Yes" ? ["colours", "some green", "flashes of something", "maybe a bird"][Math.floor(Math.random() * 4)] : "";
        r.purpose_guess = ["attention", "preferences", "reaction time", "memory", "subliminal messages", "how we choose", ""][Math.floor(Math.random() * 7)];
        let rb = 0; for (let t = 0; t < 4; t++) rb += Math.random() < (cond === "beach" ? 0.56 : cond === "football" ? 0.44 : 0.5) ? 1 : 0;
        r.recog_beach_picks = rb; r.recog_correct = cond === "beach" ? rb : cond === "football" ? 4 - rb : "NA"; r.recog_trials = 4;
        const hz = Math.random() < 0.8 ? 60 : 120;
        r.refresh_hz = hz; r.prime_frames = hz === 60 ? 1 : 2; r.prime_ms_target = 17;
        r.prime_ms_mean = Math.random() < 0.95 ? 16.7 : 21.4; r.prime_ms_min = 16.6; r.prime_ms_max = r.prime_ms_mean > 17 ? 33.4 : 16.8;
        r.mask_ms_mean = 83.3; r.dropped_frames = Math.random() < 0.9 ? 0 : 2; r.total_flashes = 78;
        rows.push(r);
      }
    });
    state.rows = rows.map(normalise);
    state.files = [{ name: "simulated data", rows: rows.length, added: rows.length }];
    state.simulated = true;
    render();
  }

  // ============================================================ filtering
  function included(p) {
    const F = state.filters;
    if (F.gender !== "all" && p.gender !== F.gender) return false;
    if (F.laptop !== "all" && p.laptop !== F.laptop) return false;
    return !exclusionReason(p);
  }
  function exclusionReason(p) {
    const F = state.filters;
    if (!G[p.condition]) return "unknown condition";
    if (!p.n) return "no choices";
    if (F.exNoticed && p.flags.includes("noticed pictures")) return "noticed pictures";
    if (F.exPerfectRecog && p.flags.includes("perfect recognition")) return "perfect recognition";
    if (F.exVision && p.flags.includes("vision")) return "vision";
    if (F.exTiming && p.flags.includes("timing")) return "timing";
    if (F.exFast && p.flags.includes("very fast clicks")) return "very fast clicks";
    if (F.exGuessed && p.flags.includes("guessed purpose")) return "guessed purpose";
    return "";
  }

  // ============================================================ SVG charts
  const W = 640;
  function roundTopRect(x, y, w, h, r) {
    if (h <= 0) return "";
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  const tipAttr = (lines) => `data-tip="${esc(lines.join("\n"))}"`;

  // categories × series grouped bar chart
  function barChart({ cats, series, get, yMax = 1, yFmt = (v) => pct(v), H = 260, ref = null, refLabel = "", catLabel = (c) => c, valueLabels = true, w = 640 }) {
    const W = w;
    const m = { t: 18, r: 8, b: 34, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / cats.length, inner = band * 0.78, bw = Math.max(4, (inner - 2 * (series.length - 1)) / series.length);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    s += `<g class="grid">`;
    for (let i = 0; i <= 4; i++) { const v = (yMax * i) / 4; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(yFmt(v))}</text>`; }
    s += `</g>`;
    cats.forEach((c, ci) => {
      const x0 = m.l + ci * band + (band - inner) / 2;
      series.forEach((se, si) => {
        const r = get(c, se) || {};
        const v = r.v;
        const x = x0 + si * (bw + 2);
        if (Number.isFinite(v)) {
          const top = y(Math.max(0, Math.min(v, yMax)));
          s += `<g ${tipAttr(r.tip || [yFmt(v), se.label])}><rect x="${x - 1}" y="${m.t}" width="${bw + 2}" height="${ih}" fill="transparent"/>`;
          s += `<path class="mark" d="${roundTopRect(x, top, bw, m.t + ih - top, 4)}" fill="${se.color}"/></g>`;
          if (r.err) s += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${y(Math.min(yMax, r.err[1]))}" y2="${y(Math.max(0, r.err[0]))}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;
          if (valueLabels && bw >= 22) s += `<text class="val" x="${x + bw / 2}" y="${top - 5}" text-anchor="middle" font-size="11">${esc(r.label != null ? r.label : yFmt(v))}</text>`;
        }
      });
      s += `<text class="lab" x="${m.l + ci * band + band / 2}" y="${H - m.b + 18}" text-anchor="middle">${esc(catLabel(c))}</text>`;
    });
    if (ref != null) s += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${y(ref)}" y2="${y(ref)}"/>`;
    s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
    return s;
  }

  // main hypothesis chart: individual dots + mean + 95% CI per group
  function dotCIChart(byGroup) {
    const H = 320, m = { t: 20, r: 12, b: 40, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / GROUPS.length;
    const y = (v) => m.t + ih - v * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Percent beach choices by group">`;
    s += `<g class="grid">`;
    for (let i = 0; i <= 4; i++) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(i / 4)}" y2="${y(i / 4)}"/><text x="${m.l - 6}" y="${y(i / 4) + 4}" text-anchor="end">${i * 25}%</text>`;
    s += `</g><line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${y(0.5)}" y2="${y(0.5)}"/><text x="${m.l + 4}" y="${y(0.5) - 6}" font-size="11">50% = no preference</text>`;
    GROUPS.forEach((g, gi) => {
      const ps = byGroup[g.key];
      const cx = m.l + gi * band + band / 2;
      // stack dots with equal value side by side
      const buckets = {};
      ps.forEach((p) => { const k = p.pBeach.toFixed(3); (buckets[k] = buckets[k] || []).push(p); });
      Object.values(buckets).forEach((arr) => arr.forEach((p, i) => {
        const off = (i - (arr.length - 1) / 2) * 9;
        const cxx = Math.max(cx - band * 0.42, Math.min(cx + band * 0.42, cx - 34 + off));
        s += `<g ${tipAttr([pct(p.pBeach) + " beach", `${p.id} · ${p.beach}/${p.n} beach choices`])}><circle cx="${cxx}" cy="${y(p.pBeach)}" r="12" fill="transparent"/>`;
        s += `<circle class="mark" cx="${cxx}" cy="${y(p.pBeach)}" r="4" fill="${g.color}" fill-opacity=".55" stroke="var(--surface-1)" stroke-width="1.5"/></g>`;
      }));
      const vals = ps.map((p) => p.pBeach);
      if (vals.length) {
        const mu = mean(vals), ci = ci95(vals), mx = cx + 34;
        if (Number.isFinite(ci[0])) s += `<line x1="${mx}" x2="${mx}" y1="${y(Math.min(1, ci[1]))}" y2="${y(Math.max(0, ci[0]))}" stroke="${g.color}" stroke-width="2"/>` +
          `<line x1="${mx - 7}" x2="${mx + 7}" y1="${y(Math.min(1, ci[1]))}" y2="${y(Math.min(1, ci[1]))}" stroke="${g.color}" stroke-width="2"/>` +
          `<line x1="${mx - 7}" x2="${mx + 7}" y1="${y(Math.max(0, ci[0]))}" y2="${y(Math.max(0, ci[0]))}" stroke="${g.color}" stroke-width="2"/>`;
        s += `<g ${tipAttr([pct(mu, 1) + " mean", `${g.label} · n = ${vals.length}`, Number.isFinite(ci[0]) ? `95% CI ${pct(ci[0], 1)} – ${pct(ci[1], 1)}` : "CI needs n ≥ 2"])}>` +
          `<rect x="${mx - 14}" y="${y(mu) - 14}" width="28" height="28" fill="transparent"/><rect class="mark" x="${mx - 7}" y="${y(mu) - 7}" width="14" height="14" rx="3" fill="${g.color}" stroke="var(--surface-1)" stroke-width="2"/></g>`;
        s += `<text class="val" x="${mx + 12}" y="${y(mu) + 4}" font-size="12">${pct(mu)}</text>`;
      }
      s += `<text class="lab" x="${cx}" y="${H - m.b + 20}" text-anchor="middle">${esc(g.label)} (n=${ps.length})</text>`;
    });
    s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
    return s;
  }

  function lineChart({ xs, series, H = 240, yMax = 1, ref = null, refLabel = "", w = 640 }) {
    const W = w;
    const m = { t: 18, r: 16, b: 34, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (i) => m.l + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img"><g class="grid">`;
    for (let i = 0; i <= 4; i++) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y((yMax * i) / 4)}" y2="${y((yMax * i) / 4)}"/><text x="${m.l - 6}" y="${y((yMax * i) / 4) + 4}" text-anchor="end">${pct((yMax * i) / 4)}</text>`;
    s += `</g>`;
    if (ref != null) s += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${y(ref)}" y2="${y(ref)}"/>`;
    series.forEach((se) => {
      const pts = se.values.map((v, i) => (Number.isFinite(v.v) ? [x(i), y(v.v)] : null)).filter(Boolean);
      if (pts.length > 1) s += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round"/>`;
      se.values.forEach((v, i) => {
        if (!Number.isFinite(v.v)) return;
        s += `<g ${tipAttr([pct(v.v), `${se.label} · position ${xs[i]}`, v.extra || ""])}><circle cx="${x(i)}" cy="${y(v.v)}" r="12" fill="transparent"/><circle class="mark" cx="${x(i)}" cy="${y(v.v)}" r="4.5" fill="${se.color}" stroke="var(--surface-1)" stroke-width="2"/></g>`;
      });
    });
    xs.forEach((lab, i) => (s += `<text class="lab" x="${x(i)}" y="${H - m.b + 18}" text-anchor="middle">${esc(lab)}</text>`));
    s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
    return s;
  }

  const legend = (items, kind = "rect") => `<div class="legend">${items.map((i) => `<span>${kind === "line" ? `<svg width="16" height="10" style="width:16px;display:inline"><line x1="0" x2="16" y1="5" y2="5" stroke="${i.color}" stroke-width="2"/></svg>` : `<i class="swatch" style="background:${i.color}"></i>`}${esc(i.label)}</span>`).join("")}</div>`;
  const card = (span, title, desc, body) => `<section class="card ${span}"><h2>${esc(title)}</h2>${desc ? `<p class="desc">${desc}</p>` : ""}<div class="body">${body}</div></section>`;
  const statusEl = (kind, text) => {
    const icon = kind === "good" ? "✓" : kind === "bad" ? "✕" : "–";
    return `<span class="st ${kind}"><span aria-hidden="true">${icon}</span>${esc(text)}</span>`;
  };

  // ============================================================ analysis
  function analyse(ps) {
    const by = { beach: [], none: [], football: [] };
    ps.forEach((p) => by[p.condition] && by[p.condition].push(p));
    const vals = (k) => by[k].map((p) => p.pBeach);
    const A = {
      by, N: ps.length,
      anova: anova(GROUPS.map((g) => vals(g.key))),
      kw: kruskal(GROUPS.map((g) => vals(g.key))),
      bc: welch(vals("beach"), vals("none")),
      fc: welch(vals("football"), vals("none")),
      bf: welch(vals("beach"), vals("football")),
    };
    A.h1p = oneSided(A.bc, true);
    A.h2p = oneSided(A.fc, false);
    A.h3p = oneSided(A.bf, true);
    // choice-level chi-square (condition x choice)
    A.chi = chiSquare(GROUPS.map((g) => [sum(by[g.key].map((p) => p.beach)), sum(by[g.key].map((p) => p.n - p.beach))]));
    // priming effect in percentage points relative to control
    const cm = mean(vals("none"));
    A.controlMean = cm;
    A.effects = [];
    if (Number.isFinite(cm)) {
      by.beach.forEach((p) => A.effects.push(p.pBeach - cm));
      by.football.forEach((p) => A.effects.push((1 - p.pBeach) - (1 - cm)));
    }
    return A;
  }

  function verdict(p, diff, nA, nB, expectPositive) {
    if (nA < 2 || nB < 2 || !Number.isFinite(p)) return { kind: "warn", text: "Not enough data yet" };
    if (p < 0.05 && (diff > 0) === expectPositive) return { kind: "good", text: "Supported (p < .05)" };
    if ((diff > 0) === expectPositive) return { kind: "warn", text: "Right direction, not significant" };
    return { kind: "bad", text: "Not supported" };
  }

  // ============================================================ render
  function render() {
    const app = $("#app");
    const theme = document.documentElement.getAttribute("data-theme");
    const top = `<header class="top"><div><h1>Unconscious Mind — results dashboard</h1>
      <div class="sub">${state.rows.length ? `${state.rows.length} participant(s) from ${state.files.length} file(s)` : "No data loaded"} · runs locally, nothing is uploaded</div></div>
      <div class="actions">
        <button class="primary" data-act="load">Add CSV files</button>
        <button data-act="sim">Load simulated data</button>
        ${state.rows.length ? `<button data-act="export">Export merged CSV</button><button data-act="clear">Clear</button>` : ""}
        <button data-act="theme">${theme === "dark" ? "Light theme" : "Dark theme"}</button>
      </div></header>`;

    if (!state.rows.length) {
      app.innerHTML = top + `<div class="drop" id="drop"><h2>Drop result CSV files here</h2>
        <p>Select all <code>result_*.csv</code> and <code>all_results_*.csv</code> files from every laptop at once. Duplicates are removed automatically.</p>
        <p class="muted small">Want to see what it looks like first? Load the simulated data (clearly marked, not real).</p>
        <div class="actions"><button class="primary" data-act="load">Choose CSV files</button><button data-act="sim">Load simulated data</button></div></div>`;
      wireDrop($("#drop"));
      return;
    }

    const F = state.filters;
    const genders = [...new Set(state.rows.map((p) => p.gender))].sort();
    const laptops = [...new Set(state.rows.map((p) => p.laptop))].sort();
    const ps = state.rows.filter(included);
    const A = analyse(ps);
    const by = A.by;
    const excludedCount = state.rows.length - ps.length;

    const filters = `<div class="filters">
      <span class="lbl">Filter</span>
      <label>Gender <select data-f="gender"><option value="all">All</option>${genders.map((g) => `<option ${F.gender === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
      <label>Laptop <select data-f="laptop"><option value="all">All</option>${laptops.map((g) => `<option ${F.laptop === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
      <span class="lbl">Exclude</span>
      ${[["exNoticed", "noticed pictures"], ["exPerfectRecog", "perfect recognition"], ["exGuessed", "guessed purpose"], ["exVision", "vision problems"], ["exTiming", "timing problems"], ["exFast", "very fast clicks"]]
        .map(([k, l]) => `<label><input type="checkbox" data-x="${k}" ${F[k] ? "checked" : ""}/> ${l} (${state.rows.filter((p) => p.flags.includes(l === "vision problems" ? "vision" : l === "timing problems" ? "timing" : l)).length})</label>`).join("")}
      <span class="muted small">${ps.length} included · ${excludedCount} excluded</span>
    </div>`;

    // ---------- hypothesis
    const nb = by.beach.length, nn = by.none.length, nf = by.football.length;
    const v1 = verdict(A.h1p, A.bc && A.bc.diff, nb, nn, true);
    const v2 = verdict(A.h2p, A.fc && A.fc.diff, nf, nn, false);
    const v3 = verdict(A.h3p, A.bf && A.bf.diff, nb, nf, true);
    const tline = (r, p1) => (r ? `${r.diff >= 0 ? "+" : ""}${f(r.diff * 100, 1)} pts · t(${f(r.df, 1)}) = ${f(r.t)} · one-sided ${pEq(p1)} · d = ${f(r.d)}` : "needs ≥ 2 per group");
    const hyp = `<section class="card s12">
      <h2>Hypothesis: pictures you can't consciously see shift your preferences</h2>
      <p class="desc">Measure: % of choices that were the beach option, per participant (${ps[0] ? ps[0].n : "?"} pairs each). Prediction: Beach group &gt; Control &gt; Football group.</p>
      <div class="verdicts">
        <div class="verdict"><div class="h">H1</div><div class="t">Beach prime → more beach choices than control</div>${statusEl(v1.kind, v1.text)}<div class="d">${tline(A.bc, A.h1p)}</div></div>
        <div class="verdict"><div class="h">H2</div><div class="t">Football prime → fewer beach choices than control</div>${statusEl(v2.kind, v2.text)}<div class="d">${tline(A.fc, A.h2p)}</div></div>
        <div class="verdict"><div class="h">H3</div><div class="t">Beach group &gt; Football group</div>${statusEl(v3.kind, v3.text)}<div class="d">${tline(A.bf, A.h3p)}</div></div>
      </div>
      <p class="small muted" style="margin:12px 0 0">Overall test (all 3 groups): one-way ANOVA ${A.anova ? `F(${A.anova.df1}, ${A.anova.df2}) = ${f(A.anova.F)}, ${pEq(A.anova.p)}, η² = ${f(A.anova.eta2, 3)}` : "–"}
      · Kruskal–Wallis ${A.kw ? `H(${A.kw.df}) = ${f(A.kw.H)}, ${pEq(A.kw.p)}` : "–"}
      · Choice-level χ² ${A.chi ? `(${A.chi.df}, N = ${A.chi.N} choices) = ${f(A.chi.x2)}, ${pEq(A.chi.p)}, Cramér's V = ${f(A.chi.V, 3)}` : "–"}
      ${Math.min(nb, nn, nf) < 15 ? `<br/><b style="color:var(--warning)">⚠ Fewer than 15 people in at least one group — results can swing a lot. Aim for 20+ per group.</b>` : ""}</p>
    </section>`;

    // ---------- KPIs
    const eff = A.effects;
    const effCI = ci95(eff);
    const kpi = (span, label, value, meta, color) => `<section class="card kpi ${span}"><div class="l">${color ? `<i class="swatch" style="background:${color}"></i>` : ""}${label}</div><div class="v">${value}</div><div class="m">${meta}</div></section>`;
    const kpis = GROUPS.map((g) => {
      const v = by[g.key].map((p) => p.pBeach), ci = ci95(v);
      return kpi("s3", g.label, pct(mean(v), 1), `beach choices · n = ${v.length}${Number.isFinite(ci[0]) ? ` · 95% CI ${pct(ci[0])}–${pct(ci[1])}` : ""}`, g.color);
    }).join("") + kpi("s3", "Average priming effect", Number.isFinite(mean(eff)) ? `${mean(eff) >= 0 ? "+" : ""}${f(mean(eff) * 100, 1)} pts` : "–",
      `toward the primed option vs control · ${Number.isFinite(effCI[0]) ? `95% CI ${f(effCI[0] * 100, 1)} to ${f(effCI[1] * 100, 1)}` : "needs data"}`);

    // ---------- main chart + pairwise table
    const pw = [["Beach vs Control", A.bc, A.h1p, "> 0"], ["Football vs Control", A.fc, A.h2p, "< 0"], ["Beach vs Football", A.bf, A.h3p, "> 0"]];
    const pwTable = `<table><thead><tr><th>Comparison</th><th class="num">Diff</th><th class="num">t</th><th class="num">df</th><th class="num">p 2-sided</th><th class="num">p predicted</th><th class="num">d</th></tr></thead><tbody>
      ${pw.map(([n, r, p1, dir]) => `<tr><td>${n}<div class="muted small">predicted ${dir}</div></td><td class="num">${r ? (r.diff >= 0 ? "+" : "") + f(r.diff * 100, 1) + " pts" : "–"}</td><td class="num">${r ? f(r.t) : "–"}</td><td class="num">${r ? f(r.df, 1) : "–"}</td><td class="num">${r ? fp(r.p) : "–"}</td><td class="num">${fp(p1)}</td><td class="num">${r ? f(r.d) : "–"}</td></tr>`).join("")}
      </tbody></table>
      <p class="small muted">Welch t-tests on each participant's % beach choices. "Predicted" = one-sided p in the direction of the hypothesis. d ≈ 0.2 small, 0.5 medium, 0.8 large.</p>
      <table style="margin-top:10px"><thead><tr><th>Group</th><th class="num">n</th><th class="num">Mean</th><th class="num">SD</th><th class="num">Median</th><th class="num">Avg beach</th></tr></thead><tbody>
      ${GROUPS.map((g) => { const v = by[g.key].map((p) => p.pBeach); return `<tr><td><span class="pill"><i class="swatch" style="background:${g.color}"></i>${g.label}</span></td><td class="num">${v.length}</td><td class="num">${pct(mean(v), 1)}</td><td class="num">${pct(sd(v), 1)}</td><td class="num">${pct(median(v), 0)}</td><td class="num">${f(mean(by[g.key].map((p) => p.beach)), 2)} / ${ps[0] ? ps[0].n : "?"}</td></tr>`; }).join("")}
      </tbody></table>`;

    // ---------- distribution
    const nPairs = Math.max(0, ...ps.map((p) => p.n));
    const distCats = Array.from({ length: nPairs + 1 }, (_, i) => i);
    const distMax = Math.max(1, ...GROUPS.flatMap((g) => distCats.map((c) => by[g.key].filter((p) => p.beach === c).length / Math.max(1, by[g.key].length))));
    const distChart = barChart({
      cats: distCats, series: GROUPS, H: 240, yMax: Math.min(1, Math.ceil(distMax * 10) / 10 || 1), catLabel: (c) => `${c}/${nPairs}`, valueLabels: false,
      get: (c, g) => { const n = by[g.key].length, k = by[g.key].filter((p) => p.beach === c).length; return { v: n ? k / n : NaN, tip: [`${k} people (${pct(n ? k / n : NaN)})`, `${g.label} · chose ${c} of ${nPairs} beach options`] }; },
    });

    // ---------- per pair
    const pairIds = [...new Set(ps.flatMap((p) => p.trials.map((t) => t.pairId)))].sort((a, b) => a - b);
    const pairCat = {};
    ps.forEach((p) => p.trials.forEach((t) => (pairCat[t.pairId] = t.cat)));
    const pairStat = (pid, gk) => { const ts = by[gk].flatMap((p) => p.trials.filter((t) => t.pairId === pid)); const b = ts.filter((t) => t.choice === "beach").length; return { n: ts.length, b, v: ts.length ? b / ts.length : NaN }; };
    const pairChart = barChart({
      cats: pairIds, series: GROUPS, H: 270, catLabel: (c) => pairCat[c], ref: 0.5, refLabel: "50%", valueLabels: false,
      get: (pid, g) => { const s = pairStat(pid, g.key); return { v: s.v, tip: [`${pct(s.v)} chose the beach option`, `${pairCat[pid]} · ${g.label}`, `${s.b} of ${s.n}`] }; },
    });
    const pairTable = `<table><thead><tr><th>Pair</th>${GROUPS.map((g) => `<th class="num">${g.short}</th>`).join("")}<th class="num">Beach − Football</th><th class="num">Overall</th></tr></thead><tbody>
      ${pairIds.map((pid) => { const s = Object.fromEntries(GROUPS.map((g) => [g.key, pairStat(pid, g.key)])); const all = ps.flatMap((p) => p.trials.filter((t) => t.pairId === pid)); const d = s.beach.v - s.football.v;
        return `<tr><td>${esc(pairCat[pid])}</td>${GROUPS.map((g) => `<td class="num">${pct(s[g.key].v)} <span class="muted small">(${s[g.key].b}/${s[g.key].n})</span></td>`).join("")}<td class="num" style="color:${d > 0 ? "var(--good)" : d < 0 ? "var(--critical)" : "inherit"}">${Number.isFinite(d) ? (d >= 0 ? "+" : "") + f(d * 100, 0) + " pts" : "–"}</td><td class="num">${pct(all.filter((t) => t.choice === "beach").length / Math.max(1, all.length))}</td></tr>`; }).join("")}
      </tbody></table><p class="small muted">"Beach − Football" &gt; 0 means that pair moved in the predicted direction. "Overall" shows which pairs are lopsided no matter what (e.g. everyone likes ice cream).</p>`;

    // ---------- order effect & RT & position
    const positions = Array.from({ length: nPairs }, (_, i) => i + 1);
    const orderSeries = ["beach", "football"].map((gk) => ({ label: G[gk].label, color: G[gk].color, values: positions.map((pos) => {
      const ts = by[gk].flatMap((p) => p.trials.filter((t) => t.order === pos));
      const ok = ts.filter((t) => t.choice === gk).length;
      return { v: ts.length ? ok / ts.length : NaN, extra: `${ok} of ${ts.length} matched the prime` };
    }) }));
    const orderChart = lineChart({ xs: positions.map((p) => "#" + p), series: orderSeries, H: 260, w: 460, ref: 0.5, refLabel: "50%" });

    const rtByGroup = Object.fromEntries(GROUPS.map((g) => [g.key, by[g.key].map((p) => p.medianRT).filter(Number.isFinite)]));
    const primedTrials = ps.filter((p) => p.condition !== "none").flatMap((p) => p.trials.map((t) => ({ rt: t.rt, match: t.choice === p.condition })));
    const rtMatch = primedTrials.filter((t) => t.match && t.rt != null).map((t) => t.rt), rtMis = primedTrials.filter((t) => !t.match && t.rt != null).map((t) => t.rt);
    const rtMax = Math.max(500, ...Object.values(rtByGroup).map((v) => mean(v) || 0)) * 1.25;
    const rtChart = barChart({ cats: ["Median decision time"], series: GROUPS, H: 220, w: 400, yMax: Math.ceil(rtMax / 500) * 500, yFmt: (v) => (v / 1000).toFixed(1) + "s",
      get: (c, g) => { const v = rtByGroup[g.key]; return { v: mean(v), label: Number.isFinite(mean(v)) ? Math.round(mean(v)) + " ms" : "", tip: [`${Math.round(mean(v))} ms`, `${g.label} · mean of each person's median`] }; } });

    const allTrials = ps.flatMap((p) => p.trials);
    const leftN = allTrials.filter((t) => t.choseLeft).length;
    const posP = binomTwoSided(leftN, allTrials.length);

    // ---------- awareness
    const noticeOpts = ["No", "Not sure", "Yes"];
    const noticeChart = barChart({ cats: noticeOpts, series: GROUPS, H: 230, w: 400, valueLabels: false,
      get: (c, g) => { const n = by[g.key].length, k = by[g.key].filter((p) => p.noticed === c).length; return { v: n ? k / n : NaN, tip: [`${k} people (${pct(n ? k / n : NaN)})`, `${g.label} answered "${c}"`] }; } });
    const recPs = ps.filter((p) => p.condition !== "none" && Number.isFinite(p.recogCorrect));
    const recK = sum(recPs.map((p) => p.recogCorrect)), recN = sum(recPs.map((p) => p.recogTrials || 0));
    const recP = binomTwoSided(recK, recN);
    const ctrlRec = by.none.filter((p) => Number.isFinite(p.recogBeach));
    const sens = [
      ["Everyone (current filters)", ps],
      ["Without people who noticed pictures", ps.filter((p) => p.noticed !== "Yes")],
      ["Without noticed / not sure", ps.filter((p) => p.noticed === "No")],
      ["Without perfect recognition", ps.filter((p) => !p.flags.includes("perfect recognition"))],
      ["Without people who guessed the purpose", ps.filter((p) => !p.flags.includes("guessed purpose"))],
    ].map(([label, sub]) => { const a = analyse(sub); return `<tr><td>${label}</td><td class="num">${sub.length}</td><td class="num">${a.bc ? (a.bc.diff >= 0 ? "+" : "") + f(a.bc.diff * 100, 1) : "–"}</td><td class="num">${fp(a.h1p)}</td><td class="num">${a.fc ? (a.fc.diff >= 0 ? "+" : "") + f(a.fc.diff * 100, 1) : "–"}</td><td class="num">${fp(a.h2p)}</td><td class="num">${a.anova ? fp(a.anova.p) : "–"}</td></tr>`; }).join("");

    const textRows = ps.filter((p) => p.saw || p.purpose).map((p) => `<tr><td>${esc(p.id)}</td><td><span class="pill"><i class="swatch" style="background:${G[p.condition].color}"></i>${G[p.condition].short}</span></td><td>${esc(p.noticed)}</td><td>${esc(p.saw)}</td><td>${esc(p.purpose)}${p.flags.includes("guessed purpose") ? ' <span class="tag flag">close guess</span>' : ""}</td></tr>`).join("");

    // ---------- demographics
    const gendersIn = [...new Set(ps.map((p) => p.gender))].sort();
    const genderChart = barChart({ cats: gendersIn, series: GROUPS, H: 240, w: 400, yMax: niceMax(Math.max(1, ...gendersIn.flatMap((gd) => GROUPS.map((g) => by[g.key].filter((p) => p.gender === gd).length)))), yFmt: (v) => String(Math.round(v)), catLabel: (c) => (c === "Prefer not to say" ? "No answer" : c),
      get: (c, g) => { const k = by[g.key].filter((p) => p.gender === c).length; return { v: k, label: String(k), tip: [`${k} people`, `${c} · ${g.label}`] }; } });
    const ageBins = [["18–19", 18, 19], ["20–21", 20, 21], ["22–23", 22, 23], ["24–25", 24, 25], ["26–29", 26, 29], ["30+", 30, 200]];
    const ageCounts = ageBins.map(([l, a, b]) => ps.filter((p) => p.age >= a && p.age <= b).length);
    const ageChart = barChart({ cats: ageBins.map((b) => b[0]), series: [{ key: "all", label: "Participants", color: "var(--accent)" }], H: 230, w: 400, yMax: niceMax(Math.max(1, ...ageCounts)), yFmt: (v) => String(Math.round(v)),
      get: (c) => { const k = ageCounts[ageBins.findIndex((b) => b[0] === c)]; return { v: k, label: String(k), tip: [`${k} people`, `Age ${c}`] }; } });
    const ages = ps.map((p) => p.age).filter(Number.isFinite);
    const natCounts = {};
    ps.forEach((p) => (natCounts[p.nationality] = (natCounts[p.nationality] || 0) + 1));
    const natList = Object.entries(natCounts).sort((a, b) => b[1] - a[1]);
    const yearCounts = {};
    ps.forEach((p) => (yearCounts[p.year] = (yearCounts[p.year] || 0) + 1));
    const genderBalance = chiSquare(gendersIn.map((gd) => GROUPS.map((g) => by[g.key].filter((p) => p.gender === gd).length)));
    const byGenderRows = gendersIn.map((gd) => `<tr><td>${esc(gd)}</td>${GROUPS.map((g) => { const v = by[g.key].filter((p) => p.gender === gd).map((p) => p.pBeach); return `<td class="num">${v.length ? pct(mean(v)) : "–"} <span class="muted small">(n=${v.length})</span></td>`; }).join("")}</tr>`).join("");

    // ---------- data quality
    const hzCounts = {};
    ps.forEach((p) => { const k = Number.isFinite(p.hz) ? Math.round(p.hz) + " Hz" : "?"; hzCounts[k] = (hzCounts[k] || 0) + 1; });
    const primeMeans = ps.map((p) => p.primeMean).filter(Number.isFinite);
    const durations = ps.map((p) => p.duration).filter(Number.isFinite);
    const flagged = state.rows.filter((p) => p.flags.length);

    // ---------- participant table
    const cols = [
      ["id", "ID", (p) => p.id], ["condition", "Group", (p) => p.condition], ["pBeach", "% beach", (p) => p.pBeach], ["primed", "Matched prime", (p) => p.primed ?? -1],
      ["noticed", "Noticed", (p) => p.noticed], ["recog", "Recognition", (p) => p.recogCorrect ?? -1], ["gender", "Gender", (p) => p.gender], ["age", "Age", (p) => p.age ?? 0],
      ["nationality", "Nationality", (p) => p.nationality], ["rt", "Median RT", (p) => p.medianRT || 0], ["hz", "Hz", (p) => p.hz || 0], ["prime", "Prime ms", (p) => p.primeMean || 0],
      ["dur", "Duration", (p) => p.duration || 0], ["flags", "Flags", (p) => p.flags.length],
    ];
    const sc = cols.find((c) => c[0] === state.sort.key) || cols[0];
    const sorted = state.rows.slice().sort((a, b) => { const x = sc[2](a), y = sc[2](b); return (x > y ? 1 : x < y ? -1 : 0) * state.sort.dir; });
    const ptable = `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th class="sort ${["pBeach", "primed", "recog", "age", "rt", "hz", "prime", "dur"].includes(c[0]) ? "num" : ""}" data-sort="${c[0]}">${c[1]}${state.sort.key === c[0] ? (state.sort.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}<th>Choices (in order shown)</th></tr></thead><tbody>
      ${sorted.map((p) => { const inc = included(p); const g = G[p.condition];
        const seq = p.trials.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => `<span title="${esc(t.cat)}" style="color:${G[t.choice].color};font-weight:700">${t.choice === "beach" ? "B" : "F"}</span>`).join(" ");
        return `<tr class="${inc ? "" : "excluded"}"><td>${esc(p.id)}</td><td>${g ? `<span class="pill"><i class="swatch" style="background:${g.color}"></i>${g.short}</span>` : esc(p.condition)}</td><td class="num">${pct(p.pBeach)}</td><td class="num">${p.primed != null ? `${p.primed}/${p.n}` : "–"}</td><td>${esc(p.noticed)}</td><td class="num">${p.recogTrials && p.condition !== "none" ? `${p.recogCorrect}/${p.recogTrials}` : "–"}</td><td>${esc(p.gender)}</td><td class="num">${p.age ?? "–"}</td><td>${esc(p.nationality)}</td><td class="num">${Number.isFinite(p.medianRT) ? Math.round(p.medianRT) : "–"}</td><td class="num">${p.hz ? Math.round(p.hz) : "–"}</td><td class="num">${f(p.primeMean, 1)}</td><td class="num">${p.duration ?? "–"}s</td><td>${p.flags.map((x) => `<span class="tag flag">${esc(x)}</span>`).join("")}${inc ? "" : `<span class="tag">excluded: ${esc(exclusionReason(p) || "filter")}</span>`}</td><td>${seq}</td></tr>`; }).join("")}
      </tbody></table></div>`;

    // ---------- report paragraph
    const report = buildReport(A, ps, { recK, recN, recP, leftN, nTrials: allTrials.length, posP, ages });

    app.innerHTML = top + (state.simulated ? `<div class="banner">⚠ SIMULATED DATA — made up to show how the dashboard works. Do not use these numbers. Click "Add CSV files" to load real results.</div>` : "") + filters +
      `<div class="grid">` + hyp + kpis +
      card("s7", "% beach choices per participant", "Each dot is one person. Square = group mean, whiskers = 95% confidence interval. If priming works, orange sits above blue, and green sits below blue.", legend(GROUPS) + dotCIChart(by)) +
      card("s5", "Group comparisons", "", pwTable) +
      card("s6", "How many beach options did people pick?", "Share of each group that picked 0, 1, 2 … beach options.", legend(GROUPS) + distChart) +
      card("s6", "Priming effect size", "Each primed person's shift toward their primed option, compared with the control group average (percentage points).", effectStrip(A)) +
      `<h3 class="section">Which pairs moved?</h3>` +
      card("s7", "% choosing the beach option, per pair", "Hover a bar for counts. Dashed line = 50%.", legend(GROUPS) + pairChart) +
      card("s5", "Pair table", "", pairTable) +
      `<h3 class="section">Was it really subliminal?</h3>` +
      card("s4", "\"Did you notice any pictures?\"", "If a primed group says Yes much more than control, the pictures were visible.", legend(GROUPS) + noticeChart) +
      card("s4", "Recognition test", "After the task, primed people had to pick which of two pictures was hidden. Chance = 50%.",
        `<div class="kpi" style="margin:4px 0 12px"><div class="v">${pct(recN ? recK / recN : NaN, 1)}</div><div class="m">${recK} of ${recN} correct · binomial vs 50%: ${pEq(recP)}</div></div>
        <p class="small">${!recN ? "No data yet." : recP < 0.05 && recK / recN > 0.5 ? `<b style="color:var(--warning)">⚠ Above chance — some pictures may have been consciously seen. Check the sensitivity table.</b>` : "✓ Not above chance — consistent with the pictures being subliminal."}</p>
        <p class="small muted">Control group picked the beach picture in ${pct(sum(ctrlRec.map((p) => p.recogBeach)) / Math.max(1, sum(ctrlRec.map((p) => p.recogTrials || 0))), 1)} of trials (they saw neither, so this is the guessing baseline).</p>
        <table><thead><tr><th>Score</th>${["beach", "football"].map((k) => `<th class="num">${G[k].short}</th>`).join("")}</tr></thead><tbody>${[0, 1, 2, 3, 4].map((sc) => `<tr><td>${sc}/4</td>${["beach", "football"].map((k) => `<td class="num">${by[k].filter((p) => p.recogCorrect === sc).length}</td>`).join("")}</tr>`).join("")}</tbody></table>`) +
      card("s4", "Robustness check", "Does the result hold when we remove people who might have been aware?",
        `<table><thead><tr><th>Who is included</th><th class="num">n</th><th class="num">H1 diff</th><th class="num">H1 p</th><th class="num">H2 diff</th><th class="num">H2 p</th><th class="num">ANOVA p</th></tr></thead><tbody>${sens}</tbody></table><p class="small muted">Diff in percentage points vs control; p one-sided in the predicted direction.</p>`) +
      card("s12", "What people said they saw and what they thought the study was about", "Answers that mention priming, flashes, beach or football are tagged — consider excluding them (filter above).",
        textRows ? `<div class="scroll" style="max-height:320px"><table><thead><tr><th>ID</th><th>Group</th><th>Noticed</th><th>What they saw</th><th>Guess about the study</th></tr></thead><tbody>${textRows}</tbody></table></div>` : `<p class="muted">No written answers.</p>`) +
      `<h3 class="section">Behaviour</h3>` +
      card("s5", "Matching the prime by trial position", "Did the effect fade over the 5 choices? % of choices matching the prime at each position.", legend(orderSeries.map((s) => ({ label: s.label, color: s.color })), "line") + orderChart) +
      card("s4", "Decision time", "Faster or slower choices per group (mean of each person's median).", legend(GROUPS) + rtChart +
        `<p class="small">Primed people: choices that matched the prime took <b>${Number.isFinite(median(rtMatch)) ? Math.round(median(rtMatch)) : "–"} ms</b> (median) vs <b>${Number.isFinite(median(rtMis)) ? Math.round(median(rtMis)) : "–"} ms</b> when they didn't.</p>`) +
      card("s3", "Left / right bias", "Pictures were placed randomly. People shouldn't prefer a side.",
        `<div class="kpi"><div class="v">${pct(allTrials.length ? leftN / allTrials.length : NaN, 1)}</div><div class="m">of choices were the left picture · ${leftN}/${allTrials.length} · binomial ${pEq(posP)}</div></div>
         <p class="small">${posP < 0.05 ? '<b style="color:var(--warning)">⚠ Side bias detected</b> — randomised placement still protects the main result.' : "✓ No side bias."}</p>`) +
      `<h3 class="section">Participants</h3>` +
      card("s4", "Gender by group", genderBalance && Number.isFinite(genderBalance.p) ? `Balance check χ²(${genderBalance.df}) = ${f(genderBalance.x2)}, ${pEq(genderBalance.p)} — ${genderBalance.p < 0.05 ? "groups differ in gender mix" : "groups are similar"}.` : "", legend(GROUPS) + genderChart) +
      card("s4", "Age", `Mean ${f(mean(ages), 1)} (SD ${f(sd(ages), 1)}), range ${ages.length ? Math.min(...ages) + "–" + Math.max(...ages) : "–"}.`, ageChart) +
      card("s4", "Nationality & year", `${natList.length} nationalities.`,
        `<div class="scroll" style="max-height:230px"><table><thead><tr><th>Nationality</th><th class="num">n</th><th class="num">%</th></tr></thead><tbody>${natList.map(([n, k]) => `<tr><td>${esc(n)}</td><td class="num">${k}</td><td class="num">${pct(k / ps.length)}</td></tr>`).join("")}</tbody></table></div>
        <p class="small" style="margin-top:10px">${Object.entries(yearCounts).sort().map(([y, k]) => `<span class="tag">${esc(y)}: ${k}</span>`).join(" ")}</p>`) +
      card("s6", "Effect by gender", "% beach choices per group, split by gender (small n — exploratory only).",
        `<table><thead><tr><th>Gender</th>${GROUPS.map((g) => `<th class="num">${g.short}</th>`).join("")}</tr></thead><tbody>${byGenderRows}</tbody></table>`) +
      card("s6", "Data quality", "Was the flicker shown correctly on every laptop?",
        `<table><tbody>
          <tr><td>Screen refresh rates</td><td>${Object.entries(hzCounts).map(([k, v]) => `<span class="tag">${k}: ${v}</span>`).join(" ")}</td></tr>
          <tr><td>Hidden picture duration</td><td>mean ${f(mean(primeMeans), 1)} ms · range ${primeMeans.length ? f(Math.min(...primeMeans), 1) + "–" + f(Math.max(...primeMeans), 1) : "–"} ms (target ${ps[0] && ps[0].primeTarget ? ps[0].primeTarget : "?"} ms)</td></tr>
          <tr><td>Dropped frames</td><td>${sum(ps.map((p) => p.dropped))} total · ${ps.filter((p) => p.dropped > 0).length} participant(s) affected</td></tr>
          <tr><td>Session length</td><td>median ${f(median(durations), 0)} s</td></tr>
          <tr><td>Flagged participants</td><td>${flagged.length} of ${state.rows.length}</td></tr>
          <tr><td>Files loaded</td><td class="small">${state.files.map((x) => `${esc(x.name)} (${x.added} new)`).join(", ")}</td></tr>
        </tbody></table>`) +
      card("s12", "All participants", "Click a column to sort. Greyed rows are excluded by the current filters. B/F = beach/football choice, coloured by option.", ptable) +
      card("s12", "Findings paragraph for the lab report", "Auto-written from the current filters. Check it, then paste into your Findings section.",
        `<div class="report" id="report">${esc(report)}</div><div class="actions" style="margin-top:10px"><button data-act="copy">Copy text</button></div>`) +
      `</div>`;
  }

  function effectStrip(A) {
    const e = A.effects;
    if (!e.length) return `<p class="muted">Needs control-group data and at least one primed participant.</p>`;
    const m = mean(e), ci = ci95(e);
    const H = 180, ml = 40, mr = 20, iw = W - ml - mr, lo = -1, hi = 1;
    const x = (v) => ml + ((v - lo) / (hi - lo)) * iw;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img"><g class="grid">`;
    [-1, -0.5, 0, 0.5, 1].forEach((v) => (s += `<line x1="${x(v)}" x2="${x(v)}" y1="14" y2="${H - 30}"/><text x="${x(v)}" y="${H - 12}" text-anchor="middle">${v > 0 ? "+" : ""}${v * 100}</text>`));
    s += `</g><line x1="${x(0)}" x2="${x(0)}" y1="10" y2="${H - 30}" stroke="var(--text-muted)" stroke-width="1.5"/>`;
    const buckets = {};
    const people = [...A.by.beach.map((p) => ["beach", p]), ...A.by.football.map((p) => ["football", p])];
    people.forEach(([gk, p], i) => {
      const v = e[i], k = v.toFixed(2);
      buckets[k] = (buckets[k] || 0) + 1;
      const cy = 96 - Math.min(7, buckets[k] - 1) * 9;
      s += `<g ${tipAttr([(v >= 0 ? "+" : "") + f(v * 100, 1) + " pts toward prime", `${p.id} · ${G[gk].label}`])}><circle cx="${x(v)}" cy="${cy}" r="11" fill="transparent"/><circle class="mark" cx="${x(v)}" cy="${cy}" r="4" fill="${G[gk].color}" fill-opacity=".6" stroke="var(--surface-1)" stroke-width="1.5"/></g>`;
    });
    if (Number.isFinite(ci[0])) s += `<line x1="${x(Math.max(lo, ci[0]))}" x2="${x(Math.min(hi, ci[1]))}" y1="114" y2="114" stroke="var(--text-primary)" stroke-width="2"/>`;
    s += `<g ${tipAttr([(m >= 0 ? "+" : "") + f(m * 100, 1) + " pts mean", Number.isFinite(ci[0]) ? `95% CI ${f(ci[0] * 100, 1)} to ${f(ci[1] * 100, 1)}` : ""])}><rect x="${x(m) - 12}" y="102" width="24" height="24" fill="transparent"/><rect class="mark" x="${x(m) - 7}" y="107" width="14" height="14" rx="3" fill="var(--text-primary)"/></g>`;
    s += `<text class="val" x="${x(m)}" y="140" text-anchor="middle" font-size="12">${m >= 0 ? "+" : ""}${f(m * 100, 1)} pts</text>`;
    s += `<text x="${ml}" y="10" font-size="11">← away from prime</text><text x="${W - mr}" y="10" text-anchor="end" font-size="11">toward prime →</text></svg>`;
    return legend([G.beach, G.football]) + s + `<p class="small muted">Black square = average shift with 95% CI. If the CI line doesn't cross 0, the priming effect is reliable.</p>`;
  }

  function buildReport(A, ps, x) {
    const by = A.by;
    const n = (k) => by[k].length;
    const m = (k) => mean(by[k].map((p) => p.pBeach));
    const s = (k) => sd(by[k].map((p) => p.pBeach));
    const pairs = ps[0] ? ps[0].n : "?";
    const female = ps.filter((p) => p.gender === "Female").length, male = ps.filter((p) => p.gender === "Male").length;
    const nats = new Set(ps.map((p) => p.nationality)).size;
    const noticedYes = ps.filter((p) => p.noticed === "Yes").length;
    let t = `${ps.length} participants were included (beach prime n = ${n("beach")}, football prime n = ${n("football")}, no prime n = ${n("none")}; ${female} female, ${male} male; age M = ${f(mean(x.ages), 1)}, SD = ${f(sd(x.ages), 1)}; ${nats} nationalities). `;
    t += `Each participant made ${pairs} forced choices between a beach-related and a football-related option.\n\n`;
    t += `The beach-primed group chose the beach option on ${pct(m("beach"), 1)} of trials (SD = ${pct(s("beach"), 1)}), compared with ${pct(m("none"), 1)} (SD = ${pct(s("none"), 1)}) in the no-prime control group and ${pct(m("football"), 1)} (SD = ${pct(s("football"), 1)}) in the football-primed group. `;
    if (A.anova) t += `A one-way ANOVA ${A.anova.p < 0.05 ? "showed a significant" : "did not show a significant"} effect of prime condition, F(${A.anova.df1}, ${A.anova.df2}) = ${f(A.anova.F)}, ${pEq(A.anova.p)}, η² = ${f(A.anova.eta2, 3)}. `;
    if (A.bc) t += `Compared with control, the beach-primed group made ${A.bc.diff >= 0 ? "more" : "fewer"} beach choices (difference = ${f(A.bc.diff * 100, 1)} percentage points, Welch t(${f(A.bc.df, 1)}) = ${f(A.bc.t)}, one-sided ${pEq(A.h1p)}, d = ${f(A.bc.d)}), so H1 was ${A.h1p < 0.05 && A.bc.diff > 0 ? "supported" : "not supported"}. `;
    if (A.fc) t += `The football-primed group made ${A.fc.diff <= 0 ? "fewer" : "more"} beach choices than control (difference = ${f(A.fc.diff * 100, 1)} points, t(${f(A.fc.df, 1)}) = ${f(A.fc.t)}, one-sided ${pEq(A.h2p)}, d = ${f(A.fc.d)}), so H2 was ${A.h2p < 0.05 && A.fc.diff < 0 ? "supported" : "not supported"}.\n\n`;
    t += `Awareness: ${noticedYes} of ${ps.length} participants (${pct(noticedYes / Math.max(1, ps.length))}) reported noticing pictures in the flicker. `;
    if (x.recN) t += `In the recognition test, primed participants identified the hidden picture on ${pct(x.recK / x.recN, 1)} of trials (${x.recK}/${x.recN}; chance = 50%, binomial ${pEq(x.recP)}), ${x.recP < 0.05 && x.recK / x.recN > 0.5 ? "suggesting that some primes were consciously perceived." : "consistent with the primes being presented below conscious awareness."} `;
    t += `Choices were not biased toward one screen side (${pct(x.leftN / Math.max(1, x.nTrials), 1)} left, binomial ${pEq(x.posP)}).`;
    return t;
  }

  // ============================================================ events
  function wireDrop(el) {
    if (!el) return;
    ["dragenter", "dragover"].forEach((e) => el.addEventListener(e, (ev) => { ev.preventDefault(); el.classList.add("over"); }));
    ["dragleave", "drop"].forEach((e) => el.addEventListener(e, (ev) => { ev.preventDefault(); el.classList.remove("over"); }));
    el.addEventListener("drop", (ev) => loadFiles(ev.dataTransfer.files));
  }
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });

  $("#file").addEventListener("change", (e) => { loadFiles(e.target.files); e.target.value = ""; });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) {
      const a = b.getAttribute("data-act");
      if (a === "load") $("#file").click();
      if (a === "sim") simulate();
      if (a === "clear") { state.rows = []; state.files = []; state.simulated = false; render(); }
      if (a === "export") download(`merged_results_${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + toCSV(state.rows.map((p) => Object.assign({}, p.raw, { included: included(p) ? "yes" : "no", flags: p.flags.join("; ") }))));
      if (a === "theme") {
        const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", t);
        try { localStorage.setItem("um_dash_theme", t); } catch (err) {}
        render();
      }
      if (a === "copy") {
        const txt = $("#report").textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => (b.textContent = "Copied ✓"), () => {
          const r = document.createRange(); r.selectNodeContents($("#report")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected — press Ctrl+C";
        });
      }
      return;
    }
    const th = e.target.closest("th[data-sort]");
    if (th) {
      const k = th.getAttribute("data-sort");
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
      render();
    }
  });
  document.addEventListener("change", (e) => {
    const fsel = e.target.closest("[data-f]");
    if (fsel) { state.filters[fsel.getAttribute("data-f")] = fsel.value; render(); return; }
    const x = e.target.closest("[data-x]");
    if (x) { state.filters[x.getAttribute("data-x")] = x.checked; render(); }
  });

  // tooltip (textContent only — CSV text is untrusted)
  const tip = $("#tip");
  function showTip(el, cx, cy) {
    const lines = (el.getAttribute("data-tip") || "").split("\n").filter(Boolean);
    tip.replaceChildren(...lines.map((l, i) => { const d = document.createElement("div"); d.className = i === 0 ? "tv" : "tl"; d.textContent = l; return d; }));
    tip.style.display = "block";
    const r = tip.getBoundingClientRect();
    let x = cx + 14, y = cy + 14;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 14;
    if (y + r.height > innerHeight - 8) y = cy - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) showTip(el, e.clientX, e.clientY); else tip.style.display = "none";
  });
  document.addEventListener("scroll", () => (tip.style.display = "none"), true);

  try { const t = localStorage.getItem("um_dash_theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
  render();
})();
