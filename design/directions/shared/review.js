// Mockup behaviour only: review controls and a small typing demo so the direction
// can be felt with real keystrokes. This is not application code.
(() => {
  const root = document.documentElement;
  const page = document.querySelector('.page');
  const params = new URLSearchParams(location.search);
  const names = { lp: 'Левый мизинец', lr: 'Левый безымянный', lm: 'Левый средний', li: 'Левый указательный', lt: 'Левый большой', rt: 'Правый большой', ri: 'Правый указательный', rm: 'Правый средний', rr: 'Правый безымянный', rp: 'Правый мизинец' };

  const keys = [...document.querySelectorAll('.key')];
  const keyMap = new Map();
  for (const k of keys) {
    if (k.dataset.base) keyMap.set(k.dataset.base, { key: k, shift: false });
    if (k.dataset.shift) keyMap.set(k.dataset.shift, { key: k, shift: true });
  }
  const byCode = (code) => keys.find((k) => k.dataset.code === code);
  const labels = { l: document.querySelector('.hand--l .hand__label'), r: document.querySelector('.hand--r .hand__label') };

  function hint(ch) {
    keys.forEach((k) => k.classList.remove('is-next', 'is-mod'));
    document.querySelectorAll('.f').forEach((f) => f.classList.remove('is-on'));
    labels.l.textContent = '';
    labels.r.textContent = '';
    const hit = keyMap.get(ch);
    if (!hit) return;
    hit.key.classList.add('is-next');
    const finger = hit.key.dataset.f;
    const on = (f, suffix = '') => {
      document.querySelector(`.f[data-f="${f}"]`)?.classList.add('is-on');
      labels[f[0]].textContent = names[f] + suffix;
    };
    on(finger);
    if (hit.shift) {
      const left = finger[0] === 'l';
      byCode(left ? 'ShiftRight' : 'ShiftLeft')?.classList.add('is-mod');
      on(left ? 'rp' : 'lp', ', Shift');
    }
  }

  // Typing demo over the visible stream
  const statWpm = document.querySelector('[data-stat="wpm"]');
  const statAcc = document.querySelector('[data-stat="acc"]');
  const statTime = document.querySelector('[data-stat="time"]');
  const ticks = document.querySelector('.ticks');
  const cells = [...document.querySelectorAll('.cells i')];

  const streams = {};
  for (const w of document.querySelectorAll('.window')) {
    const chars = [...w.querySelectorAll('.c')];
    streams[w.dataset.mode] = { win: w, stream: w.querySelector('.stream'), chars, i: Math.max(0, chars.findIndex((c) => c.classList.contains('cur'))) };
  }
  let mode = 'text';
  let started = 0;
  let good = 0;
  let bad = 0;
  let lastAt = 0;
  const cur = () => streams[mode];
  const expected = (el) => el.dataset.ch ?? el.textContent;

  function follow() {
    const s = cur();
    const el = s.chars[s.i];
    if (!el) return;
    const lh = el.offsetHeight ? parseFloat(getComputedStyle(s.win).lineHeight) : 0;
    const top = el.offsetTop - s.stream.offsetTop;
    const line = Math.round(top / lh);
    const anchor = mode === 'code' ? 4 : 1;
    s.stream.style.transform = `translateY(${-Math.max(0, line - anchor) * lh}px)`;
  }
  function focusChar() {
    const s = cur();
    const el = s.chars[s.i];
    if (el) {
      el.classList.remove('done', 'err', 'fixed');
      el.classList.add('cur');
      hint(expected(el));
    }
    follow();
  }
  function tick(isErr, now) {
    if (!ticks) return;
    const gap = lastAt ? now - lastAt : 180;
    const t = document.createElement('i');
    t.style.setProperty('--h', Math.min(1, gap / 420).toFixed(2));
    if (isErr) t.className = 'e';
    ticks.appendChild(t);
    ticks.firstElementChild?.remove();
  }
  function markCells() {
    if (!cells.length || mode !== 'text') return;
    const s = cur();
    const at = s.i;
    for (const c of cells) {
      const end = Number(c.dataset.end);
      const start = Number(c.dataset.start);
      c.className = at > end ? (s.chars.slice(start, end + 1).some((x) => x.classList.contains('err')) ? 'e' : 'd') : at >= start ? 'n' : '';
    }
  }
  function flash(cls, keyEl) {
    if (!keyEl) return;
    keyEl.classList.add(cls);
    setTimeout(() => keyEl.classList.remove(cls), 140);
  }
  function stats() {
    if (!started) return;
    const mins = (performance.now() - started) / 60000;
    if (statWpm && mins > 0.03) statWpm.textContent = String(Math.round(good / 5 / mins));
    if (statAcc && good + bad) statAcc.textContent = `${Math.round((good / (good + bad)) * 100)}%`;
    const sec = Math.floor((performance.now() - started) / 1000);
    if (statTime) statTime.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  addEventListener('keydown', (e) => {
    if (root.dataset.embed !== undefined || scrollY > 200) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('.review')) return;
    const s = cur();
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (s.i === 0) return;
      s.chars[s.i].classList.remove('cur');
      s.i -= 1;
      while (s.i > 0 && s.chars[s.i].classList.contains('ind')) s.i -= 1;
      if (s.chars[s.i].classList.contains('err')) s.chars[s.i].dataset.was = '1';
      focusChar();
      markCells();
      return;
    }
    const typed = e.key === 'Enter' ? '\n' : e.key;
    if (typed.length !== 1) {
      if (e.key === 'Tab') e.preventDefault();
      return;
    }
    e.preventDefault();
    const el = s.chars[s.i];
    if (!el) return;
    const now = performance.now();
    if (!started) {
      started = now;
      setInterval(stats, 500);
    }
    const pressed = keyMap.get(typed)?.key ?? (e.code ? byCode(e.code) : null);
    el.classList.remove('cur');
    if (typed === expected(el)) {
      good += 1;
      el.classList.add(el.dataset.was ? 'fixed' : 'done');
      flash('is-down', pressed);
      tick(false, now);
    } else {
      bad += 1;
      el.classList.add('err');
      el.dataset.typed = typed === ' ' ? '␣' : typed === '\n' ? '↵' : typed;
      flash('is-wrong', pressed);
      tick(true, now);
    }
    lastAt = now;
    s.i += 1;
    while (s.chars[s.i]?.classList.contains('ind') && s.chars[s.i - 1]?.classList.contains('nl')) {
      while (s.chars[s.i]?.classList.contains('ind')) {
        s.chars[s.i].classList.add('done');
        s.i += 1;
      }
    }
    focusChar();
    markCells();
    stats();
  });

  // Review controls
  function setTheme(t) {
    root.dataset.theme = t;
    document.querySelectorAll('[data-set-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setTheme === t)));
    requestAnimationFrame(follow);
  }
  function setMode(m) {
    mode = m;
    for (const [k, s] of Object.entries(streams)) s.win.hidden = k !== m;
    document.querySelectorAll('[data-set-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setMode === m)));
    const sig = document.querySelector('.ticks, .cells');
    if (sig) sig.hidden = m === 'code';
    focusChar();
  }
  function setVision(v) {
    if (page) page.style.filter = v === 'none' ? '' : `url(#cvd-${v})`;
  }
  document.querySelectorAll('[data-set-theme]').forEach((b) => b.addEventListener('click', () => { setTheme(b.dataset.setTheme); b.blur(); }));
  document.querySelectorAll('[data-set-mode]').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.setMode); b.blur(); }));
  const vision = document.querySelector('[data-set-vision]');
  vision?.addEventListener('change', () => { setVision(vision.value); vision.blur(); });

  if (params.get('theme')) setTheme(params.get('theme'));
  else setTheme(root.dataset.theme);
  setMode(params.get('mode') === 'code' ? 'code' : 'text');
  if (params.get('vision') && vision) { vision.value = params.get('vision'); setVision(vision.value); }
  if (params.get('view') === 'passport') document.querySelector('.app').hidden = true;
  document.fonts?.ready.then(follow);
  markCells();
})();
