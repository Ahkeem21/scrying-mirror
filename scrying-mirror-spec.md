# The Pareidolia Scrying Mirror — Implementation Spec for Fable 5

## Concept

A single-page web app that functions as a digital scrying surface. Layered AI-generated fluid textures (ink, smoke, dark water, gold wisps) are composited with procedural noise and slow perceptual manipulations designed to make the viewer *almost* see shapes — deliberately exploiting pareidolia, the same mechanism traditional scrying (mirror, bowl, flame) has always used. After a timed gazing session, an optional oracle layer sends a snapshot of the surface to Claude, which speaks back what "emerged."

Aesthetic register: quiet, dark, ceremonial. No dashboard energy. The page IS the mirror.

## Tech constraints

- Vanilla HTML/CSS/JS, single page, deployable to GitHub Pages (matches Sigil Forge stack).
- No build step. No frameworks.
- Assets: 4 local MP4 files in `/assets/` (see Asset Manifest).
- Canvas 2D is sufficient; WebGL optional stretch (see Stretch Goals).

## Asset manifest

All 1:1 aspect, ~5s, generated via Higgsfield (Kling 3.0 Turbo). User will download and place as:

| File | Content | Role | Blend |
|---|---|---|---|
| `assets/ink.mp4` | Black ink blooming in dark water | Primary presence layer | `screen`, inverted via CSS filter as needed |
| `assets/smoke.mp4` | Grey smoke tendrils on black | Drifting mid-layer | `screen`, low opacity (0.2–0.4) |
| `assets/surface.mp4` | Dark obsidian/oil-slick rippling surface | Base mirror surface | `normal`, bottom layer |
| `assets/gold.mp4` | Sparse luminous gold wisps | Rare "signal" accent | `screen`, opacity 0 except during signal events |

## Architecture

```
<div id="mirror">            circular masked viewport, vignette
  <video id="surface">       base layer
  <video id="ink">           mix-blend-mode layers
  <video id="smoke">
  <video id="gold">
  <canvas id="grain">        procedural noise + symmetry compositing
  <div id="frame">           ornate border, pure CSS or inline SVG
</div>
<div id="ritual-ui">         minimal controls, fades out during gazing
```

### 1. Seamless-loop illusion (critical)

AI clips do not loop. Solve with **ping-pong playback**:

- On each video's `timeupdate`, when `currentTime >= duration - 0.05`, set `playbackRate` handling: simplest robust approach is two `<video>` elements per asset — one playing forward, one playing a pre-reversed buffer — crossfading. BUT to keep it simple: use single element ping-pong by seeking:
  - Maintain `direction` per layer. When at end, play reversed by stepping `currentTime` backwards via rAF (`video.pause()` then decrement `currentTime` ~0.033/frame). Fluid footage reversed is perceptually identical to forward.
- Additionally, desynchronize layers: start each at a random `currentTime` and give each a slightly different `playbackRate` (0.5–0.8 — slow everything down; slower = more hypnotic and hides artifacts).
- Layer opacity slowly oscillates (independent sine LFOs, periods 20–45s) so no layer's seam is ever visually dominant when it occurs.

### 2. Pareidolia engine

These manipulations run continuously via rAF, all slow (periods 15–60s):

- **Contrast breathing**: CSS `filter: contrast()` on the ink layer oscillating 1.0 → 1.6. High-contrast moments are when shapes "surface."
- **Scale drift**: each video layer transforms `scale(1.05–1.25)` with independent slow drift + slight rotation (±2deg). Prevents the eye from mapping the footage.
- **Symmetry mode (the Rorschach cheat)**: the `grain` canvas periodically samples the composite (drawImage the video layers into an offscreen canvas), mirrors the left half onto the right, and fades this symmetric version in at 15–30% opacity for 8–15s windows, then fades out. Bilateral symmetry is the single strongest face/figure trigger. Make these windows feel like "moments" — slightly more often as a session progresses.
- **Grain**: persistent animated monochrome noise on the canvas at ~6–10% opacity, regenerated every 2–3 frames. Masks compression artifacts and adds scrying-glass texture.
- **Gold signal events**: 1–3 times per session at random, fade the gold layer in over 4s, hold 5s, fade out. This is the "something answered" beat. Never on demand — must feel granted, not triggered.

### 3. Session / ritual flow

1. **Threshold**: page loads to a nearly black screen, faint surface ripple, single line of text: "The mirror is dark. Bring it a question." Input field (the question is never sent anywhere by default — it's for the user's focus; store in a local variable only).
2. **Gazing**: on submit, UI fades out entirely over 3s. Mirror brightens slightly. Session runs 90s default (configurable 60/90/180 via a subtle pre-session selector). A barely-visible progress arc traces the mirror's rim.
3. **The turn**: at session end, layers slow further, contrast drops, symmetry window forced on for the final 10s.
4. **Reading** (two modes):
   - **Silent mode (default)**: text fades in: "What did you see?" with a textarea. Whatever they write is appended to a local journal (localStorage NOTE: if this ships as a Claude artifact use in-memory only; as a GitHub Pages deploy localStorage is fine — this spec targets GitHub Pages).
   - **Oracle mode (opt-in toggle before session)**: snapshot the composite canvas (`toDataURL`, downscale to 512px), send to Claude API with the system framing below, render the reply one line at a time, slow fade-in per line.
5. **Journal**: a small "grimoire" icon opens past sessions: date, moon phase (reuse Sigil Forge moon-phase code), question, what was seen / oracle text.

### 4. Oracle prompt (Claude API call)

```
System: You are the voice of a scrying mirror. You are shown the surface
as it appeared at the end of a gazing session. Speak what emerges: 2–4
short lines, first person plural or impersonal ("we see...", "there is...").
Concrete images, never interpretations or advice. Never mention ink, smoke,
video, or that this is generated. Ambiguity is the point. End without
resolution.
User: [image attachment: canvas snapshot] + "The question held was: {question}" 
      (only include the question if the user opted in to sharing it)
```

- Model: claude-sonnet-4-6, max_tokens 300.
- Handle failure gracefully: on any error, fall back to Silent mode's "What did you see?" — the mirror must never show an error message.

### 5. Visual design

- Palette: near-black (#0a0a0c) page, mirror rim in tarnished bronze/verdigris tones, text in low-contrast warm grey (#9a938a). One accent: the gold of the signal layer.
- Typography: a serif with occult gravity (Cormorant Garamond or EB Garamond via Google Fonts). Letterspaced small caps for UI labels.
- The mirror: circular, `border-radius: 50%`, inner box-shadow vignette (heavy — edges should fall to black), thin double-ring border. Optional inline-SVG ornament at the four cardinal points.
- Motion rules: nothing in the UI moves fast. All transitions ≥ 1.5s. Cursor auto-hides after 3s idle during gazing.
- Sound (stretch): none by default; optional low brown-noise drone via WebAudio oscillator+filter (procedural, no asset needed), toggle off by default.

### 6. File structure

```
/index.html
/style.css
/mirror.js        (layers, loops, pareidolia engine)
/session.js       (ritual flow, timers, journal)
/oracle.js        (snapshot + Claude API, isolated so Silent mode has zero network code)
/assets/*.mp4
```

## Acceptance criteria

- No visible loop seams during a 3-minute session.
- At least one moment per session where a naive viewer reports "almost seeing something."
- Oracle failure is invisible to the user.
- Runs at 60fps on a mid-range laptop; degrade by dropping the grain canvas first.
- Total page weight excluding videos < 100KB.

## Stretch goals (only if time remains)

- WebGL displacement shader warping the composite with slow simplex noise (replaces scale drift).
- Mic input: ambient room volume subtly increases turbulence (the mirror "hears").
- Breathing pacer: rim glow pulses at 6 breaths/min; footage turbulence calms as session proceeds.
