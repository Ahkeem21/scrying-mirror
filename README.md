# The Pareidolia Scrying Mirror

A single-page digital scrying surface. Layered AI-generated fluid textures
(ink, smoke, dark water, gold) are composited with procedural noise, slow
perceptual drift, and periodic bilateral symmetry so the viewer *almost*
sees shapes. After a timed gazing session, an optional oracle sends a
snapshot of the surface to Claude, which speaks back what emerged.

## Run locally

Any static server works, e.g.:

```
npx serve .
```

Opening `index.html` directly via `file://` will not work — browsers block
video seeking and canvas reads without an HTTP origin.

## Deploy (GitHub Pages)

Push the folder to a repo, enable Pages on the branch root. Nothing to build.

Files:

```
index.html
style.css
mirror.js     layers, ping-pong loops, pareidolia engine
session.js    ritual flow, timers, journal, moon phase
oracle.js     snapshot + Claude API (isolated; Silent mode has zero network code)
assets/       surface.mp4  ink.mp4  smoke.mp4  gold.mp4
              (the hf_*.mp4 files are the raw Higgsfield downloads — not
               referenced by the page; safe to delete before deploying)
```

## Oracle mode

Off by default. Toggle "the mirror speaks" before a session and paste an
Anthropic API key (stored only in your browser's localStorage). At session
end a 512px snapshot of the surface is sent to `claude-sonnet-4-6`; the
reply fades in line by line. On any failure the mirror silently falls back
to "What did you see?" — it never shows an error.

The question you type is never sent anywhere unless you check
"let it hear the question".

## Journal

"Keep" after a reading writes an entry (date, moon phase, question, what
was seen / oracle text) to localStorage. The ✦ button opens the grimoire.
