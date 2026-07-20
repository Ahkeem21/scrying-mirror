/* mirror.js — layers, seamless-loop illusion, pareidolia engine.
   Exposes window.Mirror: { start, setPhase, snapshot, scheduleSignals } */

(function () {
  'use strict';

  const TAU = Math.PI * 2;

  /* ── layer state ─────────────────────────────────────────── */

  // Each layer ping-pongs: plays forward normally, then is scrubbed
  // backward via rAF. Reversed fluid footage reads as forward motion,
  // so the seam disappears.
  function makeLayer(id, opts) {
    return {
      el: document.getElementById(id),
      dir: 1,                       // 1 forward, -1 scrubbing back
      rate: opts.rate,              // playbackRate (slow = hypnotic)
      baseOpacity: opts.baseOpacity,
      opacityLFO: {                 // slow sine so no seam is ever dominant
        amp: opts.lfoAmp,
        period: opts.lfoPeriod,     // seconds
        phase: Math.random() * TAU,
      },
      scaleDrift: {
        base: 1.12 + Math.random() * 0.08,  // 1.12–1.20; min stays ≥1.08 so a
        amp: 0.04,                          // rotated frame never shows its edge
        period: 30 + Math.random() * 30,
        phase: Math.random() * TAU,
      },
      rotDrift: {
        amp: 2,                     // ±2deg
        period: 40 + Math.random() * 20,
        phase: Math.random() * TAU,
      },
      ready: false,
    };
  }

  const layers = {
    surface: makeLayer('surface', { rate: 0.6,  baseOpacity: 1.0,  lfoAmp: 0.0,  lfoPeriod: 30 }),
    ink:     makeLayer('ink',     { rate: 0.55, baseOpacity: 0.55, lfoAmp: 0.18, lfoPeriod: 33 }),
    smoke:   makeLayer('smoke',   { rate: 0.5,  baseOpacity: 0.28, lfoAmp: 0.1,  lfoPeriod: 45 }),
    gold:    makeLayer('gold',    { rate: 0.5,  baseOpacity: 0.0,  lfoAmp: 0.0,  lfoPeriod: 20 }),
  };

  const grainCanvas = document.getElementById('grain');
  const grainCtx = grainCanvas.getContext('2d');

  // small noise tile, regenerated every few frames, drawn scaled up
  const noiseTile = document.createElement('canvas');
  noiseTile.width = noiseTile.height = 128;
  const noiseCtx = noiseTile.getContext('2d');
  const noiseData = noiseCtx.createImageData(128, 128);

  // offscreen composite used for symmetry mode + oracle snapshot
  const comp = document.createElement('canvas');
  comp.width = comp.height = 512;
  const compCtx = comp.getContext('2d');

  /* ── engine state ────────────────────────────────────────── */

  const state = {
    phase: 'idle',            // idle | gazing | turn
    slowFactor: 1,            // eased multiplier: turn drags everything down
    contrastScale: 1,         // eased: turn drops contrast breathing
    symmetry: { alpha: 0, target: 0, forced: false, nextWindow: 8 + Math.random() * 10, windowEnd: 0 },
    gold: { alpha: 0, events: [] },   // events: [{start, dur}] in session-relative seconds
    sessionStart: 0,
    sessionDur: 90,
    progress: 0,
    grainEnabled: true,
    fpsSamples: [],
  };

  /* ── ping-pong playback ──────────────────────────────────── */

  function pingPong(layer, dt) {
    const v = layer.el;
    if (!layer.ready || !v.duration) return;

    const eps = 0.06;
    if (layer.dir === 1) {
      if (v.currentTime >= v.duration - eps) {
        layer.dir = -1;
        v.pause();
      } else if (v.paused) {
        v.playbackRate = layer.rate * state.slowFactor;
        v.play().catch(() => {});
      } else {
        v.playbackRate = layer.rate * state.slowFactor;
      }
    } else {
      // scrub backward — decrement currentTime manually
      const t = v.currentTime - layer.rate * state.slowFactor * dt;
      if (t <= eps) {
        layer.dir = 1;
        v.currentTime = eps;
        v.playbackRate = layer.rate * state.slowFactor;
        v.play().catch(() => {});
      } else {
        v.currentTime = t;
      }
    }
  }

  /* ── per-frame styling: opacity LFO, drift, contrast breath ─ */

  function lfo(o, t) {
    return Math.sin(t * TAU / o.period + o.phase);
  }

  function styleLayer(name, layer, t) {
    const el = layer.el;

    // opacity
    let op = layer.baseOpacity + layer.opacityLFO.amp * lfo(layer.opacityLFO, t);
    if (name === 'gold') op = state.gold.alpha * (0.75 + 0.25 * lfo(layer.opacityLFO, t));
    el.style.opacity = Math.max(0, Math.min(1, op)).toFixed(3);

    // scale + rotation drift so the eye can't map the footage
    const s = layer.scaleDrift.base + layer.scaleDrift.amp * lfo(layer.scaleDrift, t);
    const r = layer.rotDrift.amp * lfo(layer.rotDrift, t);
    el.style.transform = `scale(${s.toFixed(4)}) rotate(${r.toFixed(3)}deg)`;

    // contrast breathing on ink — high-contrast moments are when shapes surface
    if (name === 'ink') {
      const breath = 1.3 + 0.3 * lfo({ period: 21, phase: 0.7 }, t); // 1.0–1.6
      const c = 1 + (breath - 1) * state.contrastScale;
      el.style.filter = `contrast(${c.toFixed(3)})`;
    }
  }

  /* ── symmetry mode (the Rorschach cheat) ─────────────────── */

  function drawComposite() {
    const w = comp.width, h = comp.height;
    compCtx.globalCompositeOperation = 'source-over';
    compCtx.globalAlpha = 1;
    compCtx.fillStyle = '#000';
    compCtx.fillRect(0, 0, w, h);
    try {
      compCtx.drawImage(layers.surface.el, 0, 0, w, h);
      compCtx.globalCompositeOperation = 'screen';
      compCtx.globalAlpha = parseFloat(layers.ink.el.style.opacity || 0.5);
      compCtx.drawImage(layers.ink.el, 0, 0, w, h);
      compCtx.globalAlpha = parseFloat(layers.smoke.el.style.opacity || 0.3);
      compCtx.drawImage(layers.smoke.el, 0, 0, w, h);
      if (state.gold.alpha > 0.01) {
        compCtx.globalAlpha = state.gold.alpha;
        compCtx.drawImage(layers.gold.el, 0, 0, w, h);
      }
    } catch (e) { /* video not ready yet */ }
    compCtx.globalCompositeOperation = 'source-over';
    compCtx.globalAlpha = 1;
  }

  function mirrorComposite() {
    // fold the left half onto the right — bilateral symmetry is the
    // strongest face/figure trigger there is
    const w = comp.width, h = comp.height;
    compCtx.save();
    compCtx.translate(w, 0);
    compCtx.scale(-1, 1);
    compCtx.drawImage(comp, 0, 0, w / 2, h, 0, 0, w / 2, h);
    compCtx.restore();
  }

  function updateSymmetry(t, dt) {
    const sym = state.symmetry;

    if (sym.forced) {
      sym.target = 0.3;
    } else if (state.phase === 'gazing') {
      const sessionT = (performance.now() - state.sessionStart) / 1000;
      if (sym.target === 0 && sessionT >= sym.nextWindow) {
        // open a window: 8–15s at 15–30% opacity
        sym.target = 0.15 + Math.random() * 0.15;
        sym.windowEnd = sessionT + 8 + Math.random() * 7;
      } else if (sym.target > 0 && sessionT >= sym.windowEnd) {
        sym.target = 0;
        // windows come slightly more often as the session progresses
        const gap = 18 - 10 * state.progress + Math.random() * 8;
        sym.nextWindow = sessionT + gap;
      }
    } else {
      sym.target = 0;
    }

    // slow fade toward target
    const speed = dt / 4; // ~4s ramp
    sym.alpha += (sym.target - sym.alpha) * Math.min(1, speed);
    if (sym.alpha < 0.005 && sym.target === 0) sym.alpha = 0;
  }

  /* ── gold signal events — granted, never triggered ───────── */

  function updateGold() {
    if (state.phase !== 'gazing' && state.phase !== 'turn') { state.gold.alpha = 0; return; }
    const sessionT = (performance.now() - state.sessionStart) / 1000;
    let a = 0;
    for (const ev of state.gold.events) {
      const local = sessionT - ev.start;
      if (local < 0 || local > 13) continue;
      if (local < 4) a = Math.max(a, local / 4);            // fade in 4s
      else if (local < 9) a = Math.max(a, 1);               // hold 5s
      else a = Math.max(a, 1 - (local - 9) / 4);            // fade out 4s
    }
    state.gold.alpha = a * 0.65;
  }

  /* ── grain ───────────────────────────────────────────────── */

  let grainFrame = 0;

  function regenNoise() {
    const d = noiseData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    noiseCtx.putImageData(noiseData, 0, 0);
  }

  function renderGrainCanvas(t) {
    const w = grainCanvas.width, h = grainCanvas.height;
    grainCtx.clearRect(0, 0, w, h);

    if (state.symmetry.alpha > 0.005) {
      drawComposite();
      mirrorComposite();
      grainCtx.globalAlpha = state.symmetry.alpha;
      grainCtx.drawImage(comp, 0, 0, w, h);
    }

    if (state.grainEnabled) {
      grainFrame++;
      if (grainFrame % 3 === 0) regenNoise();
      grainCtx.globalAlpha = 0.07 + 0.02 * Math.sin(t * 0.9);
      grainCtx.globalCompositeOperation = 'overlay';
      grainCtx.drawImage(noiseTile, 0, 0, w, h);
      grainCtx.globalCompositeOperation = 'source-over';
    }
    grainCtx.globalAlpha = 1;
  }

  /* ── main loop ───────────────────────────────────────────── */

  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = now / 1000;

    // ease global modifiers toward phase targets
    const slowTarget = state.phase === 'turn' ? 0.45 : 1;
    const contrastTarget = state.phase === 'turn' ? 0.3 : 1;
    state.slowFactor += (slowTarget - state.slowFactor) * Math.min(1, dt / 2.5);
    state.contrastScale += (contrastTarget - state.contrastScale) * Math.min(1, dt / 2.5);

    if (state.phase === 'gazing' || state.phase === 'turn') {
      state.progress = Math.min(1, (now - state.sessionStart) / (state.sessionDur * 1000));
    }

    for (const name in layers) {
      pingPong(layers[name], dt);
      styleLayer(name, layers[name], t);
    }

    updateGold();
    updateSymmetry(t, dt);
    renderGrainCanvas(t);

    // degrade gracefully: sustained low fps → drop the grain first
    if (state.grainEnabled) {
      state.fpsSamples.push(dt);
      if (state.fpsSamples.length >= 120) {
        const avg = state.fpsSamples.reduce((a, b) => a + b, 0) / state.fpsSamples.length;
        if (avg > 1 / 40) state.grainEnabled = false;
        state.fpsSamples.length = 0;
      }
    }

    requestAnimationFrame(frame);
  }

  /* ── sizing ──────────────────────────────────────────────── */

  function resize() {
    const mirror = document.getElementById('mirror');
    const rect = mirror.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    grainCanvas.width = Math.round(rect.width * dpr * 0.5);   // half-res is plenty under grain+blur
    grainCanvas.height = Math.round(rect.height * dpr * 0.5);
  }

  window.addEventListener('resize', resize);

  /* ── public API ──────────────────────────────────────────── */

  window.Mirror = {
    start() {
      resize();
      for (const name in layers) {
        const layer = layers[name];
        const v = layer.el;
        const arm = () => {
          layer.ready = true;
          // desynchronize: random start point per layer
          v.currentTime = Math.random() * Math.max(0.1, v.duration - 0.2);
          v.playbackRate = layer.rate;
          v.play().catch(() => {});
        };
        if (v.readyState >= 2) arm();
        else v.addEventListener('loadeddata', arm, { once: true });
      }
      requestAnimationFrame(frame);
    },

    setPhase(phase, opts = {}) {
      state.phase = phase;
      if (phase === 'gazing') {
        state.sessionStart = performance.now();
        state.sessionDur = opts.duration || 90;
        state.progress = 0;
        state.symmetry.forced = false;
        state.symmetry.target = 0;
        state.symmetry.nextWindow = 8 + Math.random() * 10;
        this.scheduleSignals(state.sessionDur);
      } else if (phase === 'turn') {
        state.symmetry.forced = true;
      } else {
        state.symmetry.forced = false;
      }
    },

    scheduleSignals(duration) {
      // 1–3 gold events per session, at random moments, never in the
      // first 15s or the final turn
      const n = 1 + Math.floor(Math.random() * 3);
      const usable = Math.max(20, duration - 25);
      const events = [];
      for (let i = 0; i < n; i++) {
        events.push({ start: 15 + Math.random() * (usable - 15) });
      }
      state.gold.events = events;
    },

    getProgress() { return state.progress; },

    snapshot() {
      drawComposite();
      if (state.symmetry.alpha > 0.1) mirrorComposite();
      return comp.toDataURL('image/jpeg', 0.8).split(',')[1];
    },
  };
})();
