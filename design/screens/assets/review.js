// Mockup behaviour only: review controls, a small typing demo, reward demo, chart hover.
// This is not application code.
(() => {
  const root = document.documentElement;
  const page = document.querySelector('.page');
  const params = new URLSearchParams(location.search);
  const names = { lp: 'Left pinky', lr: 'Left ring', lm: 'Left middle', li: 'Left index', lt: 'Left thumb', rt: 'Right thumb', ri: 'Right index', rm: 'Right middle', rr: 'Right ring', rp: 'Right pinky' };

  // ---- Review strip
  const setTheme = (t) => {
    root.dataset.theme = t;
    try { localStorage.setItem('keymind-mock-theme', t); } catch (e) { /* preference only */ }
    document.querySelectorAll('[data-set-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setTheme === t)));
    syncFrames(t);
  };
  function syncFrames(t) {
    document.querySelectorAll('iframe[data-src]').forEach((f) => { f.src = `${f.dataset.src}?embed=1&theme=${t}`; });
  }
  document.querySelectorAll('[data-set-theme]').forEach((b) => b.addEventListener('click', () => { setTheme(b.dataset.setTheme); b.blur(); }));
  const setGam = (v) => {
    root.dataset.gam = v;
    document.querySelectorAll('[data-set-gam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setGam === v)));
  };
  document.querySelectorAll('[data-set-gam]').forEach((b) => b.addEventListener('click', () => { setGam(b.dataset.setGam); b.blur(); }));
  const dataSel = document.querySelector('[data-set-data]');
  if (dataSel) {
    if (root.dataset.data) dataSel.value = root.dataset.data;
    dataSel.addEventListener('change', () => { root.dataset.data = dataSel.value; dataSel.blur(); });
  }
  const visionSel = document.querySelector('[data-set-vision]');
  const setVision = (v) => { if (page) page.style.filter = v === 'none' ? '' : `url(#cvd-${v})`; };
  visionSel?.addEventListener('change', () => { setVision(visionSel.value); visionSel.blur(); });
  if (params.get('vision') && visionSel) { visionSel.value = params.get('vision'); setVision(visionSel.value); }
  const kbdSel = document.querySelector('[data-set-kbd]');
  if (kbdSel) {
    if (root.dataset.kbd) kbdSel.value = root.dataset.kbd;
    kbdSel.addEventListener('change', () => { root.dataset.kbd = kbdSel.value; kbdSel.blur(); });
  }
  setTheme(root.dataset.theme || 'light');
  setGam(root.dataset.gam || 'on');

  // ---- Heat views: one data-h per cell, recomputed from the chosen view and metric
  function applyHeat(t) {
    if (t.matches('.heat')) {
      const fingers = t.dataset.view === 'fingers';
      const speed = t.dataset.metric === 'speed';
      t.querySelectorAll('.key[data-hs]').forEach((k) => {
        k.dataset.h = fingers ? (speed ? k.dataset.hf : k.dataset.hfe) : (speed ? k.dataset.hs : k.dataset.he);
      });
    }
    if (t.matches('.mx')) {
      const speed = t.dataset.metric === 'speed';
      t.querySelectorAll('i[data-s]:not([data-s="x"])').forEach((c) => { c.dataset.h = speed ? c.dataset.s : c.dataset.e; });
    }
  }

  // ---- Segmented controls that swap a data attribute on a target
  document.querySelectorAll('[data-seg-target]').forEach((seg) => {
    const target = document.querySelector(seg.dataset.segTarget);
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      target.setAttribute(`data-${seg.dataset.segAttr}`, b.dataset.value);
      applyHeat(target);
    }));
  });

  // ---- Settings page behaviour: plain toggles, switch labels, dependent controls
  document.querySelectorAll('.seg[data-toggle] button').forEach((btn) => btn.addEventListener('click', () => {
    btn.closest('.seg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
  }));
  const syncDep = (input) => {
    const on = input.type === 'checkbox' ? input.checked : true;
    document.querySelectorAll(`[data-dep="${input.id}"]`).forEach((row) => {
      row.querySelectorAll('input, select, button').forEach((c) => { c.disabled = !on; });
    });
  };
  document.querySelectorAll('.switch input').forEach((input) => {
    const label = input.closest('.switch').querySelector('.switch__state');
    const sync = () => {
      if (label) label.textContent = input.checked ? 'On' : 'Off';
      if (input.id) syncDep(input);
      if (input.id === 's-gam') setGam(input.checked ? 'on' : 'off');
    };
    input.addEventListener('change', sync);
    if (input.id) syncDep(input);
  });

  // ---- Shared tooltip for heat cells and keys
  let tip = null;
  const showTip = (text, x, y) => {
    if (!tip) { tip = document.createElement('div'); tip.id = 'tip'; document.body.appendChild(tip); }
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(innerWidth - w - 8, x + 12)}px`;
    tip.style.top = `${Math.max(8, y - 34)}px`;
  };
  const hideTip = () => { if (tip) tip.hidden = true; };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) showTip(el.dataset.tip, e.clientX, e.clientY);
    else if (!e.target.closest?.('.chart')) hideTip();
  });

  // ---- Line charts: crosshair and one tooltip, by pointer and by keyboard
  document.querySelectorAll('.chart[data-points]').forEach((chart) => {
    const data = JSON.parse(chart.dataset.points);
    const svg = chart.querySelector('svg');
    const x = chart.querySelector('.x');
    const [x0, x1] = data.range;
    let at = data.labels.length - 1;
    const show = (i, cx, cy) => {
      at = Math.max(0, Math.min(data.labels.length - 1, i));
      const px = x0 + (at / (data.labels.length - 1)) * (x1 - x0);
      x.setAttribute('x1', px); x.setAttribute('x2', px);
      chart.classList.add('is-on');
      const lines = data.series.map((s) => `${s.values[at]}${data.unit}  ${s.name}`);
      const box = svg.getBoundingClientRect();
      const scale = box.width / svg.viewBox.baseVal.width;
      showTip(`${data.labels[at]}\n${lines.join('\n')}`, cx ?? box.left + px * scale, cy ?? box.top + 20);
    };
    svg.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect();
      const scale = box.width / svg.viewBox.baseVal.width;
      const vx = (e.clientX - box.left) / scale;
      show(Math.round(((vx - x0) / (x1 - x0)) * (data.labels.length - 1)), e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { chart.classList.remove('is-on'); hideTip(); });
    chart.addEventListener('focus', () => show(at));
    chart.addEventListener('blur', () => { chart.classList.remove('is-on'); hideTip(); });
    chart.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
    });
  });

  // ---- Typing demo
  const win = document.querySelector('.window');
  if (!win) return;
  const keys = [...document.querySelectorAll('.deck .key')];
  const keyMap = new Map();
  for (const k of keys) {
    if (k.dataset.base !== undefined) keyMap.set(k.dataset.base, { key: k, shift: false });
    if (k.dataset.shift) keyMap.set(k.dataset.shift, { key: k, shift: true });
  }
  const byCode = (code) => keys.find((k) => k.dataset.code === code);
  const labels = { l: document.querySelector('.hand--l .hand__label'), r: document.querySelector('.hand--r .hand__label') };
  const deck = document.querySelector('.deck');
  function hint(ch) {
    keys.forEach((k) => k.classList.remove('is-next', 'is-mod'));
    document.querySelectorAll('.f').forEach((f) => f.classList.remove('is-on'));
    if (labels.l) labels.l.textContent = '';
    if (labels.r) labels.r.textContent = '';
    const hit = keyMap.get(ch);
    if (!hit) return;
    hit.key.classList.add('is-next');
    const finger = hit.key.dataset.f;
    const on = (f, suffix = '') => {
      document.querySelector(`.f[data-f="${f}"]`)?.classList.add('is-on');
      if (labels[f[0]]) labels[f[0]].textContent = names[f] + suffix;
    };
    on(finger);
    if (hit.shift) {
      const left = finger[0] === 'l';
      byCode(left ? 'ShiftRight' : 'ShiftLeft')?.classList.add('is-mod');
      on(left ? 'rp' : 'lp', ', Shift');
    }
  }
  const stream = win.querySelector('.stream');
  const chars = [...win.querySelectorAll('.c')];
  let i = Math.max(0, chars.findIndex((c) => c.classList.contains('cur')));
  const statWpm = document.querySelector('[data-stat="wpm"]');
  const statAcc = document.querySelector('[data-stat="acc"]');
  const statTime = document.querySelector('[data-stat="time"]');
  let started = 0; let good = 0; let bad = 0;
  const expected = (el) => el.dataset.ch ?? el.textContent;
  const isCode = win.classList.contains('window--code');
  function follow() {
    const el = chars[i];
    if (!el || !stream) return;
    const lh = parseFloat(getComputedStyle(win).lineHeight);
    if (!lh) return;
    const line = Math.round((el.offsetTop - stream.offsetTop) / lh);
    stream.style.transform = `translateY(${-Math.max(0, line - (isCode ? 4 : 1)) * lh}px)`;
  }
  function focusChar() {
    const el = chars[i];
    if (el) { el.classList.remove('done', 'err', 'fixed'); el.classList.add('cur'); hint(expected(el)); }
    follow();
  }
  const flash = (cls, keyEl) => {
    if (!keyEl) return;
    keyEl.classList.add(cls);
    setTimeout(() => keyEl.classList.remove(cls), 140);
  };
  function stats() {
    if (!started) return;
    const mins = (performance.now() - started) / 60000;
    if (statWpm && mins > 0.03) statWpm.textContent = String(Math.round(good / 5 / mins));
    if (statAcc && good + bad) statAcc.textContent = `${Math.round((good / (good + bad)) * 100)}%`;
    const sec = Math.floor((performance.now() - started) / 1000);
    if (statTime) statTime.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }
  const pauseDlg = document.querySelector('.pause');
  pauseDlg?.querySelector('[data-resume]')?.addEventListener('click', () => pauseDlg.close());

  addEventListener('keydown', (e) => {
    if (root.dataset.embed !== undefined) return;
    if (e.key === 'Escape' && pauseDlg) {
      if (!pauseDlg.open) { e.preventDefault(); pauseDlg.showModal(); }
      return;
    }
    if (pauseDlg?.open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('.review')) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (i === 0) return;
      chars[i]?.classList.remove('cur');
      i -= 1;
      while (i > 0 && chars[i].classList.contains('ind')) i -= 1;
      if (chars[i].classList.contains('err')) chars[i].dataset.was = '1';
      focusChar();
      return;
    }
    const typed = e.key === 'Enter' ? '\n' : e.key;
    if (typed.length !== 1) { if (e.key === 'Tab') e.preventDefault(); return; }
    e.preventDefault();
    const el = chars[i];
    if (!el) return;
    const now = performance.now();
    if (!started) { started = now; setInterval(stats, 500); }
    const pressed = keyMap.get(typed)?.key ?? (e.code ? byCode(e.code) : null);
    el.classList.remove('cur');
    if (typed === expected(el)) {
      good += 1;
      el.classList.add(el.dataset.was ? 'fixed' : 'done');
      flash('is-down', pressed);
    } else {
      bad += 1;
      el.classList.add('err');
      el.dataset.typed = typed === ' ' ? '␣' : typed === '\n' ? '↵' : typed;
      flash('is-wrong', pressed);
      if (root.dataset.kbd === 'error' && deck) {
        deck.classList.add('is-showing');
        setTimeout(() => deck.classList.remove('is-showing'), 1600);
      }
    }
    i += 1;
    while (chars[i]?.classList.contains('ind') && chars[i - 1]?.classList.contains('nl')) {
      while (chars[i]?.classList.contains('ind')) { chars[i].classList.add('done'); i += 1; }
    }
    focusChar();
    stats();
  });

  // ---- Rewards: stay in the deck band, never take focus, never shift the layout
  const rewards = document.querySelector('.rewards');
  const REWARDS = {
    xp: { cls: '', html: '<b>+12 XP</b><span>Clean run on ea</span>' },
    quest: { cls: 'reward--right', html: '<b>Quest done</b><span>Bring ss under 190 ms</span>' },
    level: { cls: 'reward--level', html: '<b>Level 15</b><span>The summary has the details</span>', ripple: true },
  };
  document.querySelectorAll('[data-reward]').forEach((b) => b.addEventListener('click', () => {
    b.blur();
    const r = REWARDS[b.dataset.reward];
    if (!rewards || !r) return;
    const el = document.createElement('div');
    el.className = `reward ${r.cls}`;
    el.innerHTML = r.html;
    rewards.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    if (r.ripple && deck) {
      deck.classList.remove('is-ripple');
      void deck.offsetWidth;
      deck.classList.add('is-ripple');
      setTimeout(() => deck.classList.remove('is-ripple'), 1300);
    }
  }));

  document.fonts?.ready.then(follow);
  follow();
})();
