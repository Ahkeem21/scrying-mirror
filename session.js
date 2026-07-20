/* session.js — ritual flow, timers, journal, moon phase.
   Threshold → Gazing → The Turn → Reading → Grimoire. */

(function () {
  'use strict';

  /* ── moon phase (from Sigil Forge) ───────────────────────── */

  const SYNODIC_MONTH = 29.530588853;
  const MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
  const MOON_MS_PER_DAY = 1000 * 60 * 60 * 24;

  function moonAge(date) {
    let age = ((date.getTime() - MOON_EPOCH_MS) / MOON_MS_PER_DAY) % SYNODIC_MONTH;
    if (age < 0) age += SYNODIC_MONTH;
    return age;
  }

  function getMoonPhase(date) {
    const age = moonAge(date);
    const w = 1;
    const quarter = SYNODIC_MONTH / 4;
    const half = SYNODIC_MONTH / 2;
    const threeQuarter = (SYNODIC_MONTH * 3) / 4;
    if (age < w || age > SYNODIC_MONTH - w) return { name: 'New Moon', emoji: '\u{1F311}' };
    if (Math.abs(age - quarter) < w) return { name: 'First Quarter', emoji: '\u{1F313}' };
    if (Math.abs(age - half) < w) return { name: 'Full Moon', emoji: '\u{1F315}' };
    if (Math.abs(age - threeQuarter) < w) return { name: 'Last Quarter', emoji: '\u{1F317}' };
    if (age < quarter) return { name: 'Waxing Crescent', emoji: '\u{1F312}' };
    if (age < half) return { name: 'Waxing Gibbous', emoji: '\u{1F314}' };
    if (age < threeQuarter) return { name: 'Waning Gibbous', emoji: '\u{1F316}' };
    return { name: 'Waning Crescent', emoji: '\u{1F318}' };
  }

  /* ── elements ────────────────────────────────────────────── */

  const $ = (id) => document.getElementById(id);
  const mirror = $('mirror');
  const rim = $('rim');
  const rimArc = $('rim-arc');
  const ritualUI = $('ritual-ui');
  const readingUI = $('reading-ui');
  const readingPrompt = $('reading-prompt');
  const oracleLines = $('oracle-lines');
  const seenBox = $('seen');
  const grimoireBtn = $('grimoire-btn');

  const ARC_LEN = 304.7;
  const STORE_KEY = 'scrying-journal';
  const KEY_KEY = 'scrying-oracle-key';

  const session = {
    duration: 90,
    question: '',
    oracle: false,
    shareQuestion: true,
    oracleReading: null,   // string[] once received
    active: false,
    rafId: null,
    turnFired: false,
  };

  /* ── threshold controls ──────────────────────────────────── */

  document.querySelectorAll('.dur').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dur').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      session.duration = parseInt(btn.dataset.secs, 10);
    });
  });

  $('oracle-toggle').addEventListener('change', (e) => {
    $('oracle-config').classList.toggle('hidden', !e.target.checked);
  });

  const savedKey = localStorage.getItem(KEY_KEY);
  if (savedKey) $('oracle-key').value = savedKey;

  $('question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') beginSession();
  });
  $('begin').addEventListener('click', beginSession);

  /* ── gazing ──────────────────────────────────────────────── */

  function beginSession() {
    if (session.active) return;
    session.active = true;
    session.turnFired = false;
    session.oracleReading = null;
    // the question is never sent anywhere unless the user opts in —
    // it lives in this variable and, if kept, the local journal
    session.question = $('question').value.trim();
    session.oracle = $('oracle-toggle').checked;
    session.shareQuestion = $('share-question').checked;

    if (session.oracle) {
      const key = $('oracle-key').value.trim();
      if (key) localStorage.setItem(KEY_KEY, key);
      else session.oracle = false; // no key, stay silent
    }

    ritualUI.classList.add('faded');
    grimoireBtn.classList.add('faded');
    mirror.classList.add('awake');
    rim.classList.add('tracing');
    startCursorHiding();

    Mirror.setPhase('gazing', { duration: session.duration });
    tickProgress();
  }

  function tickProgress() {
    const p = Mirror.getProgress();
    rimArc.style.strokeDashoffset = (ARC_LEN * (1 - p)).toFixed(2);

    // the turn: final 10 seconds — everything slows, symmetry holds
    if (!session.turnFired && p >= 1 - 10 / session.duration) {
      session.turnFired = true;
      Mirror.setPhase('turn');
    }

    if (p >= 1) {
      endSession();
      return;
    }
    session.rafId = requestAnimationFrame(tickProgress);
  }

  /* ── the reading ─────────────────────────────────────────── */

  async function endSession() {
    stopCursorHiding();

    // snapshot before the mirror dims (oracle needs the surface as it was)
    let snapshotData = null;
    if (session.oracle) {
      try { snapshotData = Mirror.snapshot(); } catch (e) { /* fall to silent */ }
    }

    rim.classList.remove('tracing');
    mirror.classList.remove('awake');
    Mirror.setPhase('idle');

    // oracle first — on ANY failure, fall silently into Silent mode
    if (session.oracle && snapshotData) {
      try {
        const key = localStorage.getItem(KEY_KEY) || '';
        const q = session.shareQuestion && session.question ? session.question : null;
        session.oracleReading = await Oracle.consult(snapshotData, q, key);
      } catch (e) {
        session.oracleReading = null; // the mirror never shows an error
      }
    }

    showReading();
  }

  function showReading() {
    readingUI.classList.remove('hidden');
    oracleLines.innerHTML = '';
    seenBox.value = '';

    if (session.oracleReading) {
      readingPrompt.textContent = '';
      oracleLines.classList.remove('hidden');
      session.oracleReading.forEach((line, i) => {
        const el = document.createElement('p');
        el.className = 'line';
        el.textContent = line;
        oracleLines.appendChild(el);
        setTimeout(() => el.classList.add('lit'), 1200 + i * 2200);
      });
      seenBox.setAttribute('aria-label', 'What you saw');
      seenBox.placeholder = '';
    } else {
      readingPrompt.textContent = 'What did you see?';
      oracleLines.classList.add('hidden');
    }

    requestAnimationFrame(() => readingUI.classList.add('revealed'));
    $('keep').onclick = () => closeReading(true);
    $('release').onclick = () => closeReading(false);
  }

  function closeReading(keep) {
    if (keep) {
      const moon = getMoonPhase(new Date());
      const entry = {
        date: new Date().toISOString(),
        moon: moon.name,
        moonEmoji: moon.emoji,
        question: session.question,
        seen: seenBox.value.trim(),
        oracle: session.oracleReading ? session.oracleReading.join('\n') : null,
      };
      const journal = loadJournal();
      journal.unshift(entry);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(journal)); } catch (e) {}
    }

    readingUI.classList.remove('revealed');
    setTimeout(() => {
      readingUI.classList.add('hidden');
      ritualUI.classList.remove('faded');
      grimoireBtn.classList.remove('faded');
      $('question').value = '';
      session.active = false;
    }, 1600);
  }

  /* ── grimoire ────────────────────────────────────────────── */

  function loadJournal() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }

  grimoireBtn.addEventListener('click', () => {
    const entries = $('grimoire-entries');
    entries.innerHTML = '';
    const journal = loadJournal();

    if (!journal.length) {
      const p = document.createElement('p');
      p.id = 'grimoire-empty';
      p.textContent = 'Nothing has been kept.';
      entries.appendChild(p);
    }

    for (const item of journal) {
      const div = document.createElement('div');
      div.className = 'entry';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const date = new Date(item.date);
      const dateSpan = document.createElement('span');
      dateSpan.textContent = date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      const moonSpan = document.createElement('span');
      moonSpan.textContent = `${item.moonEmoji || ''} ${item.moon || ''}`.trim();
      meta.append(dateSpan, moonSpan);
      div.appendChild(meta);

      if (item.question) {
        const q = document.createElement('p');
        q.className = 'q';
        q.textContent = item.question;
        div.appendChild(q);
      }
      if (item.oracle) {
        const a = document.createElement('p');
        a.className = 'a oracle';
        a.textContent = item.oracle;
        div.appendChild(a);
      }
      if (item.seen) {
        const a = document.createElement('p');
        a.className = 'a';
        a.textContent = item.seen;
        div.appendChild(a);
      }
      entries.appendChild(div);
    }

    $('grimoire').classList.remove('hidden');
  });

  $('grimoire-close').addEventListener('click', () => {
    $('grimoire').classList.add('hidden');
  });

  /* ── cursor auto-hide during gazing ──────────────────────── */

  let cursorTimer = null;
  let cursorListenerOn = false;

  function bumpCursor() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 3000);
  }

  function startCursorHiding() {
    if (!cursorListenerOn) {
      window.addEventListener('mousemove', bumpCursor);
      cursorListenerOn = true;
    }
    bumpCursor();
  }

  function stopCursorHiding() {
    if (cursorListenerOn) {
      window.removeEventListener('mousemove', bumpCursor);
      cursorListenerOn = false;
    }
    clearTimeout(cursorTimer);
    document.body.classList.remove('hide-cursor');
  }

  /* ── go ──────────────────────────────────────────────────── */

  Mirror.start();
})();
