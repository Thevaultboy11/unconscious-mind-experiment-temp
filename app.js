/* Unconscious Mind — subliminal priming experiment.
 * Runs from file:// with no install: React + htm are loaded from ./lib (no build step, no internet).
 * The flicker itself is drawn on a <canvas> by counting screen refreshes (requestAnimationFrame),
 * not with setTimeout, so durations are whole frames (60 Hz: 1 frame = 16.7 ms).
 */
(function () {
  "use strict";
  const { useState, useEffect, useRef } = React;
  const html = htm.bind(React.createElement);
  const C = window.EXPERIMENT_CONFIG;
  const BG = "#808080";
  const STORE_KEY = "um_results_v1";

  // ---------------------------------------------------------------- utilities
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : "");

  // items x reps, shuffled, never the same item twice in a row
  function sequenceNoRepeat(items, reps) {
    let seq = [];
    for (let r = 0; r < reps; r++) seq = seq.concat(items);
    for (let attempt = 0; attempt < 50; attempt++) {
      seq = shuffle(seq);
      if (seq.every((x, i) => i === 0 || x !== seq[i - 1])) return seq;
    }
    return seq;
  }
  function pickNoRepeat(pool, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let x;
      do { x = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && x === out[out.length - 1]);
      out.push(x);
    }
    return out;
  }

  function toCSV(rows) {
    const cols = [];
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
    const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.join(",")].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(","))).join("\r\n");
  }
  function download(name, text) {
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------------------------------------------------------------- images
  const IMG = {}; // path -> decoded HTMLImageElement
  function allImagePaths() {
    const p = [];
    ["beach", "football"].forEach((cat) => C.primes[cat].forEach((f) => p.push(`stimuli/${cat}/${f}`)));
    C.pairs.forEach((pr) => { p.push(`stimuli/choices/${pr.beach}`); p.push(`stimuli/choices/${pr.football}`); });
    for (let i = 1; i <= C.maskCount; i++) p.push(`stimuli/masks/m${i}.jpg`);
    return p;
  }
  async function preloadAll(onProgress) {
    const paths = allImagePaths();
    let done = 0;
    const missing = [];
    await Promise.all(paths.map(async (src) => {
      const img = new Image();
      img.src = src;
      try { await img.decode(); IMG[src] = img; } catch (e) { missing.push(src); }
      done++;
      onProgress(done, paths.length);
    }));
    return missing;
  }

  // ---------------------------------------------------------------- flash engine
  function measureFrameMs(n) {
    return new Promise((resolve) => {
      const ts = [];
      function f(t) {
        ts.push(t);
        if (ts.length < n) requestAnimationFrame(f);
        else {
          const d = [];
          for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
          d.sort((a, b) => a - b);
          resolve(d[Math.floor(d.length / 2)]);
        }
      }
      requestAnimationFrame(f);
    });
  }

  function makeDrawer(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    const ctx = canvas.getContext("2d", { alpha: false });
    const W = canvas.width, H = canvas.height;
    const size = Math.round(Math.min(C.timing.stimulusPx * dpr, 0.7 * Math.min(W, H)));
    const x = Math.round((W - size) / 2), y = Math.round((H - size) / 2);
    return function draw(step) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      if (step.img) ctx.drawImage(step.img, x, y, size, size);
      if (step.role === "fix") {
        const a = Math.round(14 * dpr), w = Math.max(2, Math.round(3 * dpr));
        ctx.fillStyle = "#111";
        ctx.fillRect(W / 2 - a, H / 2 - w / 2, 2 * a, w);
        ctx.fillRect(W / 2 - w / 2, H / 2 - a, w, 2 * a);
      }
    };
  }

  // Shows each step for exactly step.frames screen refreshes. Returns real onset times.
  function runSteps(draw, steps, frameMs) {
    return new Promise((resolve) => {
      const frameToStep = [];
      steps.forEach((s, i) => { for (let k = 0; k < s.frames; k++) frameToStep.push(i); });
      const onsets = new Array(steps.length).fill(null);
      let fi = -1, last = -1, lastTs = null, dropped = 0;
      function tick(ts) {
        if (lastTs !== null && ts - lastTs > 1.5 * frameMs) dropped += Math.round((ts - lastTs) / frameMs) - 1;
        lastTs = ts;
        fi++;
        if (fi >= frameToStep.length) { resolve({ onsets, endTs: ts, dropped }); return; }
        const si = frameToStep[fi];
        if (si !== last) { draw(steps[si]); onsets[si] = ts; last = si; }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  // condition: "beach" | "football" | "none"; primes are images or null (gray frame)
  function buildSteps(primeList, fixMs, fr) {
    const masks = [];
    for (let i = 1; i <= C.maskCount; i++) masks.push(IMG[`stimuli/masks/m${i}.jpg`]);
    const maskSeq = pickNoRepeat(masks, primeList.length + 1);
    const steps = [{ role: "fix", frames: Math.max(1, Math.round(fixMs / fr.frameMs)) }];
    steps.push({ role: "mask", img: maskSeq[0], frames: fr.maskFrames });
    primeList.forEach((p, i) => {
      steps.push({ role: "prime", img: p ? p.img : null, name: p ? p.name : "gray", frames: fr.primeFrames });
      steps.push({ role: "mask", img: maskSeq[i + 1], frames: fr.maskFrames });
    });
    steps.push({ role: "end", frames: 1 });
    return steps;
  }

  function primeObjects(condition) {
    if (condition === "none") return C.primes.beach.map(() => null); // same count, gray frames
    return C.primes[condition].map((f) => ({ name: f, img: IMG[`stimuli/${condition}/${f}`] }));
  }

  // ---------------------------------------------------------------- UI pieces
  function Withdraw({ onWithdraw }) {
    return html`<button className="withdraw" onClick=${onWithdraw}>Withdraw</button>`;
  }

  function Page({ children, onWithdraw, wide }) {
    return html`<div className="page"><div className=${"card" + (wide ? " wide" : "")}>${children}</div>
      ${onWithdraw && html`<${Withdraw} onWithdraw=${onWithdraw} />`}</div>`;
  }

  // ---- Experimenter setup
  function Setup({ ready, loadMsg, missing, frameInfo, onStart }) {
    const [laptop, setLaptop] = useState(store.get("um_laptop", ""));
    const [cond, setCond] = useState("auto");
    const [demo, setDemo] = useState(false);
    const [saved, setSaved] = useState(store.get(STORE_KEY, []));
    const isChrome = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);

    function start() {
      store.set("um_laptop", laptop.trim());
      onStart({ laptop: laptop.trim() || "L?", condChoice: cond, demo });
    }
    function downloadAll() {
      if (!saved.length) return;
      download(`all_results_${laptop || "laptop"}_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(saved));
    }
    function clearAll() {
      if (!saved.length) return;
      if (!confirm(`Delete ${saved.length} saved result(s) from this laptop? Download them first!`)) return;
      if (!confirm("Really delete? This cannot be undone.")) return;
      store.set(STORE_KEY, []);
      setSaved([]);
    }
    const counts = { beach: 0, football: 0, none: 0 };
    saved.forEach((r) => { if (counts[r.condition] != null) counts[r.condition]++; });

    return html`<div className="page setup"><div className="card wide">
      <p className="eyebrow">Experimenter setup — participants should not see this screen</p>
      <h1>Unconscious Mind: priming experiment</h1>

      <div className="grid2">
        <label>Laptop name <small>(e.g. L1, L2 — becomes part of each participant ID)</small>
          <input value=${laptop} onInput=${(e) => setLaptop(e.target.value)} placeholder="L1" /></label>
        <label>Condition for next participant
          <select value=${cond} onChange=${(e) => setCond(e.target.value)}>
            <option value="auto">Automatic (balanced random) — use this</option>
            ${Object.entries(C.conditions).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}
          </select></label>
      </div>
      <label className="check"><input type="checkbox" checked=${demo} onChange=${(e) => setDemo(e.target.checked)} />
        Demo mode — pictures shown slowly so you can see them; nothing is saved. For testing and screenshots only.</label>

      <div className="status">
        <div>Images: ${ready ? html`<b className="ok">all ${allImagePaths().length} loaded</b>` : loadMsg}</div>
        ${missing.length > 0 && html`<div className="bad">Missing files: ${missing.join(", ")}</div>`}
        <div>Screen: ${frameInfo ? html`<b>${Math.round(1000 / frameInfo.frameMs)} Hz</b> → each hidden picture = ${frameInfo.primeFrames} frame(s) ≈ ${r1(frameInfo.primeFrames * frameInfo.frameMs)} ms, mask ≈ ${r1(frameInfo.maskFrames * frameInfo.frameMs)} ms` : "measuring…"}</div>
        ${!isChrome && html`<div className="bad">Please use Google Chrome — timing is tested there.</div>`}
        <div className="hint">Before each session: laptop plugged in, brightness up, notifications off, other apps closed.</div>
      </div>

      <button className="primary big" disabled=${!ready || missing.length > 0} onClick=${start}>Start participant (full screen) →</button>

      <hr />
      <h2>Saved results on this laptop: ${saved.length}</h2>
      <p className="muted">Beach ${counts.beach} · Football ${counts.football} · No prime ${counts.none}</p>
      <div className="row">
        <button onClick=${downloadAll} disabled=${!saved.length}>Download all results (CSV)</button>
        <button className="danger" onClick=${clearAll} disabled=${!saved.length}>Clear saved results</button>
      </div>
      <p className="muted small">Each participant's file also downloads automatically at the end. This button is the backup.</p>
      <p><a href="dashboard.html" style=${{ color: "var(--accent)" }}>Open the results dashboard →</a></p>
    </div></div>`;
  }

  // ---- Consent
  function Consent({ onAgree, onWithdraw }) {
    const [ok, setOk] = useState(false);
    const [noEpi, setNoEpi] = useState(false);
    return html`<${Page} onWithdraw=${onWithdraw}>
      <h1>Before we start</h1>
      <p>This is a short study for the <b>${C.courseName}</b> class. Please read the points below.</p>
      <ul className="consent">
        <li>Taking part is completely <b>voluntary</b>.</li>
        <li>It is <b>anonymous</b> — we do not record your name, email or anything that identifies you. Nothing is filmed or audio-recorded.</li>
        <li>You can <b>stop at any time</b> without giving a reason: click <i>Withdraw</i> in the corner or press <b>Esc</b>. Nothing will be saved.</li>
        <li>The data will <b>only be used for the ${C.courseName} class</b> project.</li>
        <li>It takes about <b>2 minutes</b>.</li>
        <li>The screen will <b>flicker quickly</b> for short periods. Do not take part if you have photosensitive epilepsy or have ever had a seizure triggered by flashing lights.</li>
      </ul>
      <label className="check"><input type="checkbox" checked=${noEpi} onChange=${(e) => setNoEpi(e.target.checked)} />
        I do not have photosensitive epilepsy / seizures triggered by flashing lights.</label>
      <label className="check"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} />
        I am 18 or older, I understand the points above, and I agree to take part.</label>
      <button className="primary" disabled=${!(ok && noEpi)} onClick=${onAgree}>I agree — continue</button>
    <//>`;
  }

  // ---- Demographics
  function Demographics({ onDone, onWithdraw }) {
    const [d, setD] = useState({ age: "", gender: "", nationality: "", study_year: "", vision: "" });
    const set = (k) => (e) => setD(Object.assign({}, d, { [k]: e.target.value }));
    const age = parseInt(d.age, 10);
    const valid = age >= 18 && age < 100 && d.gender && d.nationality.trim() && d.study_year && d.vision;
    return html`<${Page} onWithdraw=${onWithdraw}>
      <h1>A few questions about you</h1>
      <p className="muted">Used only to describe the group of participants.</p>
      <div className="form">
        <label>Age <input type="number" min="18" max="99" value=${d.age} onInput=${set("age")} /></label>
        <label>Gender
          <select value=${d.gender} onChange=${set("gender")}>
            <option value="">Choose…</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
          </select></label>
        <label>Nationality <input value=${d.nationality} onInput=${set("nationality")} placeholder="e.g. Emirati" /></label>
        <label>Year of study
          <select value=${d.study_year} onChange=${set("study_year")}>
            <option value="">Choose…</option><option>Year 1</option><option>Year 2</option><option>Year 3</option><option>Year 4</option><option>Graduate</option><option>Not a student</option>
          </select></label>
        <label>Normal or corrected-to-normal vision (glasses/contacts are fine)?
          <select value=${d.vision} onChange=${set("vision")}>
            <option value="">Choose…</option><option>Yes</option><option>No</option>
          </select></label>
      </div>
      <button className="primary" disabled=${!valid} onClick=${() => onDone(d)}>Continue</button>
    <//>`;
  }

  // ---- Instructions
  function Instructions({ onGo, onWithdraw }) {
    return html`<${Page} onWithdraw=${onWithdraw}>
      <h1>What you'll do</h1>
      <ol className="steps">
        <li>A <b>+</b> appears in the middle of the screen. <b>Keep your eyes on it.</b></li>
        <li>The screen will <b>flicker for a few seconds</b>. Just keep looking at the centre.</li>
        <li>Then you'll see <b>two pictures</b>. <b>Click the one you like more.</b> Go with your first feeling — there are no right or wrong answers.</li>
        <li>There is a short flicker before each pair. There are ${C.pairs.length} pairs.</li>
      </ol>
      <p className="muted">Sit comfortably, at a normal distance from the screen.</p>
      <button className="primary big" onClick=${onGo}>I'm ready</button>
    <//>`;
  }

  // ---- Flicker stage
  function Flash({ steps, frameInfo, needMeasure, onDone }) {
    const ref = useRef(null);
    useEffect(() => {
      let alive = true;
      (async () => {
        const draw = makeDrawer(ref.current);
        let fr = frameInfo;
        if (needMeasure) {
          draw({ role: "fix" });
          const frameMs = await measureFrameMs(90);
          fr = Object.assign({}, fr, deriveFrames(frameMs, fr.demo));
        }
        const s = steps(fr);
        const res = await runSteps(draw, s, fr.frameMs);
        if (!alive) return;
        const primeDur = [], maskDur = [];
        s.forEach((st, i) => {
          const next = i + 1 < s.length ? res.onsets[i + 1] : res.endTs;
          const d = next - res.onsets[i];
          if (st.role === "prime") primeDur.push(d);
          if (st.role === "mask") maskDur.push(d);
        });
        onDone({ fr, primeDur, maskDur, dropped: res.dropped, shown: s.filter((x) => x.role === "prime").map((x) => x.name) });
      })();
      return () => { alive = false; };
    }, []);
    return html`<canvas ref=${ref} className="stage"></canvas>`;
  }

  function deriveFrames(frameMs, demo) {
    const pm = demo ? C.timing.demoPrimeMs : C.timing.primeMs;
    const mm = demo ? C.timing.demoMaskMs : C.timing.maskMs;
    return { frameMs, primeFrames: Math.max(1, Math.round(pm / frameMs)), maskFrames: Math.max(1, Math.round(mm / frameMs)), demo };
  }

  // ---- Choice
  function Choice({ trial, onChoose }) {
    const t0 = useRef(null);
    const [locked, setLocked] = useState(false);
    useEffect(() => { requestAnimationFrame(() => { t0.current = performance.now(); }); }, []);
    const pick = (side) => {
      if (locked || t0.current == null) return;
      setLocked(true);
      onChoose(side, Math.round(performance.now() - t0.current));
    };
    const L = trial.leftIsBeach ? trial.pair.beach : trial.pair.football;
    const R = trial.leftIsBeach ? trial.pair.football : trial.pair.beach;
    return html`<div className="choice">
      <p className="question">Which one do you like more?</p>
      <div className="pair">
        <button className="opt" onClick=${() => pick("left")}><img src=${"stimuli/choices/" + L} alt="" draggable="false" /></button>
        <button className="opt" onClick=${() => pick("right")}><img src=${"stimuli/choices/" + R} alt="" draggable="false" /></button>
      </div>
      <p className="muted small">${trial.index + 1} / ${C.pairs.length}</p>
    </div>`;
  }

  // ---- Awareness questions
  function Awareness({ onDone, onWithdraw }) {
    const [a, setA] = useState({ noticed_images: "", saw_description: "", purpose_guess: "" });
    const set = (k) => (e) => setA(Object.assign({}, a, { [k]: e.target.value }));
    return html`<${Page} onWithdraw=${onWithdraw}>
      <h1>Almost done</h1>
      <div className="form">
        <div className="q">During the flickering, did you notice any pictures?
          <div className="radios">
            ${["Yes", "No", "Not sure"].map((v) => html`<label className="radio"><input type="radio" name="n" value=${v} checked=${a.noticed_images === v} onChange=${set("noticed_images")} /> ${v}</label>`)}
          </div></div>
        ${a.noticed_images && a.noticed_images !== "No" && html`<label>What did you see? (anything — colours, objects…)
          <textarea rows="2" value=${a.saw_description} onInput=${set("saw_description")}></textarea></label>`}
        <label>What do you think this study was testing? (a guess is fine)
          <textarea rows="2" value=${a.purpose_guess} onInput=${set("purpose_guess")}></textarea></label>
      </div>
      <button className="primary" disabled=${!a.noticed_images} onClick=${() => onDone(a)}>Continue</button>
    <//>`;
  }

  function Recognition({ trials, onDone, onWithdraw }) {
    const [i, setI] = useState(-1);
    const answers = useRef([]);
    if (i < 0) return html`<${Page} onWithdraw=${onWithdraw}>
      <h1>Last part</h1>
      <p>Some pictures may have been hidden inside the flicker. You'll see ${trials.length} pairs of pictures.
      For each pair, <b>click the one you think was hidden in the flicker</b>. If you have no idea, just guess.</p>
      <button className="primary" onClick=${() => setI(0)}>Start</button>
    <//>`;
    const t = trials[i];
    const L = t.leftIsBeach ? `stimuli/beach/${t.beach}` : `stimuli/football/${t.football}`;
    const R = t.leftIsBeach ? `stimuli/football/${t.football}` : `stimuli/beach/${t.beach}`;
    const pick = (side) => {
      const pickedBeach = (side === "left") === t.leftIsBeach;
      answers.current.push(Object.assign({}, t, { picked: pickedBeach ? "beach" : "football" }));
      if (i + 1 < trials.length) setI(i + 1); else onDone(answers.current);
    };
    return html`<div className="choice" key=${i}>
      <p className="question">Which one was hidden in the flicker?</p>
      <div className="pair">
        <button className="opt" onClick=${() => pick("left")}><img src=${L} alt="" draggable="false" /></button>
        <button className="opt" onClick=${() => pick("right")}><img src=${R} alt="" draggable="false" /></button>
      </div>
      <p className="muted small">${i + 1} / ${trials.length}</p>
    </div>`;
  }

  function Done({ demo, pid, onNext }) {
    return html`<${Page}>
      <h1>Thank you!</h1>
      <p><b>What this study was about:</b> the flicker contained pictures shown for about ${C.timing.primeMs} milliseconds (1/60 of a second) —
      too fast to notice. Depending on the group, they were linked to <i>the beach</i>, to <i>football</i>, or there were no pictures at all.
      We are testing whether pictures you don't consciously see can still nudge which options you prefer.</p>
      <p><b>Please don't tell other students about this</b> until the study is finished — it would affect their results.</p>
      <p className="muted small">${demo ? "Demo mode — nothing was saved." : `Saved as ${pid}.`}</p>
      <div className="exp-only"><button onClick=${onNext}>Experimenter: next participant →</button></div>
    <//>`;
  }

  function Withdrawn({ onBack }) {
    return html`<${Page}>
      <h1>You have withdrawn</h1>
      <p>Nothing from this session was saved. Thank you for your time.</p>
      <div className="exp-only"><button onClick=${onBack}>Back to start</button></div>
    <//>`;
  }

  // ---------------------------------------------------------------- main app
  function nextCondition(choice) {
    if (choice !== "auto") return choice;
    let q = store.get("um_cond_queue", []);
    if (!q.length) q = shuffle(["beach", "football", "none"]); // balanced blocks of 3
    const c = q.shift();
    store.set("um_cond_queue", q);
    return c;
  }
  function nextParticipantId(laptop) {
    const n = store.get("um_counter", 0) + 1;
    store.set("um_counter", n);
    return `${laptop}-${String(n).padStart(3, "0")}`;
  }

  function App() {
    const [screen, setScreen] = useState("setup");
    const [ready, setReady] = useState(false);
    const [loadMsg, setLoadMsg] = useState("loading…");
    const [missing, setMissing] = useState([]);
    const [setupFrame, setSetupFrame] = useState(null);
    const [trialIdx, setTrialIdx] = useState(0);
    const S = useRef(null); // current session data

    useEffect(() => {
      preloadAll((d, n) => setLoadMsg(`loading ${d}/${n}…`)).then((m) => { setMissing(m); setReady(true); });
      measureFrameMs(60).then((ms) => setSetupFrame(deriveFrames(ms, false)));
    }, []);

    // Esc = withdraw (anywhere after setup, before the end).
    // In full screen Chrome swallows Esc to leave full screen, so leaving full screen
    // ourselves-not-intended during the task also counts as withdrawing.
    const screenRef = useRef(screen);
    screenRef.current = screen;
    const intentionalExit = useRef(false);
    useEffect(() => {
      const active = () => !["setup", "done", "withdrawn"].includes(screenRef.current);
      const onKey = (e) => { if (e.key === "Escape" && active()) withdraw(); };
      const onFs = () => {
        if (document.fullscreenElement) return;
        if (intentionalExit.current) { intentionalExit.current = false; return; }
        if (active()) withdraw();
      };
      window.addEventListener("keydown", onKey);
      document.addEventListener("fullscreenchange", onFs);
      return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); };
    }, []);

    function exitFullscreen() {
      try { if (document.fullscreenElement) { intentionalExit.current = true; document.exitFullscreen(); } } catch (e) {}
    }
    function withdraw() { S.current = null; exitFullscreen(); setScreen("withdrawn"); }
    function backToSetup() { exitFullscreen(); setScreen("setup"); }

    function start({ laptop, condChoice, demo }) {
      try { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      const condition = nextCondition(condChoice);
      const photos = (cat) => C.primes[cat].filter((f) => f.endsWith(".jpg"));
      const rb = shuffle(photos("beach")).slice(0, C.recognitionTrials);
      const rf = shuffle(photos("football")).slice(0, C.recognitionTrials);
      S.current = {
        demo, laptop, condition,
        pid: demo ? "DEMO" : null,
        startedAt: new Date(),
        trials: shuffle(C.pairs).map((pair, index) => ({ pair, index, leftIsBeach: Math.random() < 0.5 })),
        recogTrials: rb.map((b, k) => ({ beach: b, football: rf[k], leftIsBeach: Math.random() < 0.5 })),
        frameInfo: null, primeDur: [], maskDur: [], dropped: 0, flashes: 0,
        demog: null, awareness: null, recog: null,
      };
      setTrialIdx(0);
      setScreen("consent");
    }

    function recordFlash(r) {
      const s = S.current;
      if (!s) return;
      s.frameInfo = r.fr;
      s.primeDur = s.primeDur.concat(r.primeDur);
      s.maskDur = s.maskDur.concat(r.maskDur);
      s.dropped += r.dropped;
      s.flashes += r.primeDur.length;
    }

    function finish(recog) {
      const s = S.current;
      s.recog = recog;
      if (!s.demo) {
        s.pid = nextParticipantId(s.laptop);
        const row = buildRow(s);
        const all = store.get(STORE_KEY, []);
        all.push(row);
        store.set(STORE_KEY, all);
        download(`result_${s.pid}.csv`, toCSV([row]));
      }
      exitFullscreen();
      setScreen("done");
    }

    const s = S.current;
    const condPrimes = () => primeObjects(s.condition);

    if (screen === "setup") return html`<${Setup} ready=${ready} loadMsg=${loadMsg} missing=${missing} frameInfo=${setupFrame} onStart=${start} />`;
    if (screen === "withdrawn") return html`<${Withdrawn} onBack=${backToSetup} />`;
    if (screen === "done") return html`<${Done} demo=${s && s.demo} pid=${s && s.pid} onNext=${backToSetup} />`;
    if (screen === "consent") return html`<${Consent} onAgree=${() => setScreen("demog")} onWithdraw=${withdraw} />`;
    if (screen === "demog") return html`<${Demographics} onDone=${(d) => { s.demog = d; setScreen("instr"); }} onWithdraw=${withdraw} />`;
    if (screen === "instr") return html`<${Instructions} onGo=${() => setScreen("main")} onWithdraw=${withdraw} />`;

    if (screen === "main") return html`<${Flash} key="main" needMeasure=${true} frameInfo=${{ demo: s.demo }}
      steps=${(fr) => buildSteps(sequenceNoRepeat(condPrimes(), C.timing.mainRepetitions), C.timing.fixationMs, fr)}
      onDone=${(r) => { recordFlash(r); setScreen("reprime"); }} />`;

    if (screen === "reprime") return html`<${Flash} key=${"re" + trialIdx} needMeasure=${false} frameInfo=${s.frameInfo}
      steps=${(fr) => buildSteps(shuffle(condPrimes()).slice(0, C.timing.reprimeFlashes), C.timing.reprimeFixationMs, fr)}
      onDone=${(r) => { recordFlash(r); setScreen("choice"); }} />`;

    if (screen === "choice") return html`<${Choice} key=${"c" + trialIdx} trial=${s.trials[trialIdx]} onChoose=${(side, rt) => {
        const t = s.trials[trialIdx];
        t.choice = (side === "left") === t.leftIsBeach ? "beach" : "football";
        t.rt = rt;
        if (trialIdx + 1 < s.trials.length) { setTrialIdx(trialIdx + 1); setScreen("reprime"); }
        else { exitFullscreen(); setScreen("aware"); }
      }} />`;

    if (screen === "aware") return html`<${Awareness} onDone=${(a) => { s.awareness = a; setScreen("recog"); }} onWithdraw=${withdraw} />`;
    if (screen === "recog") return html`<${Recognition} trials=${s.recogTrials} onDone=${finish} onWithdraw=${withdraw} />`;
    return null;
  }

  // ---------------------------------------------------------------- data row (one per participant)
  function buildRow(s) {
    const fr = s.frameInfo || {};
    const row = {
      participant_id: s.pid,
      laptop: s.laptop,
      condition: s.condition,
      started_at: s.startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_s: Math.round((Date.now() - s.startedAt.getTime()) / 1000),
      age: s.demog.age, gender: s.demog.gender, nationality: s.demog.nationality.trim(),
      study_year: s.demog.study_year, vision_ok: s.demog.vision,
    };
    let beach = 0, football = 0;
    const byId = {};
    s.trials.forEach((t) => { byId[t.pair.id] = t; if (t.choice === "beach") beach++; else football++; });
    C.pairs.forEach((p) => {
      const t = byId[p.id];
      row[`pair${p.id}_${p.category.toLowerCase()}`] = t.choice;
      row[`pair${p.id}_rt_ms`] = t.rt;
      row[`pair${p.id}_order`] = t.index + 1;
      row[`pair${p.id}_beach_side`] = t.leftIsBeach ? "left" : "right";
    });
    row.n_pairs = C.pairs.length;
    row.beach_choices = beach;
    row.football_choices = football;
    row.primed_choices = s.condition === "beach" ? beach : s.condition === "football" ? football : "NA";
    row.noticed_images = s.awareness.noticed_images;
    row.saw_description = s.awareness.saw_description;
    row.purpose_guess = s.awareness.purpose_guess;
    const recBeach = s.recog.filter((r) => r.picked === "beach").length;
    row.recog_beach_picks = recBeach;
    row.recog_correct = s.condition === "beach" ? recBeach : s.condition === "football" ? s.recog.length - recBeach : "NA";
    row.recog_trials = s.recog.length;
    row.refresh_hz = r1(1000 / fr.frameMs);
    row.prime_frames = fr.primeFrames;
    row.prime_ms_target = C.timing.primeMs;
    row.prime_ms_mean = r1(mean(s.primeDur));
    row.prime_ms_min = r1(Math.min.apply(null, s.primeDur));
    row.prime_ms_max = r1(Math.max.apply(null, s.primeDur));
    row.mask_ms_mean = r1(mean(s.maskDur));
    row.dropped_frames = s.dropped;
    row.total_flashes = s.flashes;
    row.screen = `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`;
    row.browser = navigator.userAgent;
    return row;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
})();
