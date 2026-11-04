// Shared markup helpers. The keyboard, hand and relief exist once here and are used on every screen.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let seed = 12345;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const reseed = (s) => { seed = s; };

// ---- Keyboard data
const F = { lp: 'Backquote Digit1 Tab KeyQ CapsLock KeyA ShiftLeft KeyZ ControlLeft MetaLeft', lr: 'Digit2 KeyW KeyS KeyX', lm: 'Digit3 KeyE KeyD KeyC', li: 'Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB', lt: 'AltLeft', rt: 'Space AltRight', ri: 'Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM', rm: 'Digit8 KeyI KeyK Comma', rr: 'Digit9 KeyO KeyL Period', rp: 'Digit0 Minus Equal Backspace KeyP BracketLeft BracketRight Backslash Semicolon Quote Enter Slash ShiftRight ContextMenu ControlRight' };
export const fingerOf = {};
for (const [f, codes] of Object.entries(F)) for (const c of codes.split(' ')) fingerOf[c] = f;
export const fingerNames = { lp: 'Left pinky', lr: 'Left ring', lm: 'Left middle', li: 'Left index', lt: 'Left thumb', rt: 'Right thumb', ri: 'Right index', rm: 'Right middle', rr: 'Right ring', rp: 'Right pinky' };

const k = (code, base, shift, u) => ({ code, base, shift, u });
const m = (code, label, u, base) => ({ code, label, u, mod: true, base });
export const ROWS = [
  [k('Backquote', '`', '~'), k('Digit1', '1', '!'), k('Digit2', '2', '@'), k('Digit3', '3', '#'), k('Digit4', '4', '$'), k('Digit5', '5', '%'), k('Digit6', '6', '^'), k('Digit7', '7', '&'), k('Digit8', '8', '*'), k('Digit9', '9', '('), k('Digit0', '0', ')'), k('Minus', '-', '_'), k('Equal', '=', '+'), m('Backspace', 'Backspace', 2)],
  [m('Tab', 'Tab', 1.5), ...'qwertyuiop'.split('').map((c) => k(`Key${c.toUpperCase()}`, c, c.toUpperCase())), k('BracketLeft', '[', '{'), k('BracketRight', ']', '}'), k('Backslash', '\\', '|', 1.5)],
  [m('CapsLock', 'Caps', 1.75), ...'asdfghjkl'.split('').map((c) => k(`Key${c.toUpperCase()}`, c, c.toUpperCase())), k('Semicolon', ';', ':'), k('Quote', "'", '"'), m('Enter', 'Enter', 2.25, '\n')],
  [m('ShiftLeft', 'Shift', 2.25), ...'zxcvbnm'.split('').map((c) => k(`Key${c.toUpperCase()}`, c, c.toUpperCase())), k('Comma', ',', '<'), k('Period', '.', '>'), k('Slash', '/', '?'), m('ShiftRight', 'Shift', 2.75)],
  [m('ControlLeft', 'Ctrl', 1.25), m('MetaLeft', 'Win', 1.25), m('AltLeft', 'Alt', 1.25), k('Space', ' ', undefined, 6.25), m('AltRight', 'Alt', 1.25), m('ContextMenu', 'Menu', 2.5), m('ControlRight', 'Ctrl', 1.25)],
];
export const keyPos = {};
ROWS.forEach((r, y) => { let x = 0; r.forEach((key) => { const u = key.u || 1; keyPos[key.code] = { x: x + u / 2, y: y + 0.5 }; x += u; }); });

// Sample skill data. E, S, P, ; and X are the weak keys on every screen.
export const keyMs = { KeyA: 171, KeyB: 158, KeyC: 150, KeyD: 132, KeyE: 212, KeyF: 118, KeyG: 141, KeyH: 124, KeyI: 138, KeyJ: 112, KeyK: 121, KeyL: 133, KeyM: 149, KeyN: 128, KeyO: 143, KeyP: 205, KeyQ: 189, KeyR: 147, KeyS: 188, KeyT: 129, KeyU: 136, KeyV: 162, KeyW: 166, KeyX: 171, KeyY: 158, KeyZ: 184, Semicolon: 240, Comma: 152, Period: 148, Slash: 196, Quote: 201, Space: 96, BracketLeft: 262, BracketRight: 248, Minus: 214, Equal: 226, Digit1: 231, Digit2: 219, Digit3: 208, Digit4: 214, Digit5: 243, Digit6: 251, Digit7: 229, Digit8: 216, Digit9: 224, Digit0: 233, Backquote: 281, Backslash: 257, Enter: 164, Tab: 193 };
export const keyErr = { KeyE: 6.1, KeyS: 5.4, KeyP: 4.2, Semicolon: 7.8, KeyX: 3.9, KeyA: 2.8, KeyZ: 3.6, KeyQ: 3.1, KeyB: 2.4, KeyV: 2.2, BracketLeft: 8.4, BracketRight: 7.1, Digit5: 6.2, Digit6: 6.8, Backquote: 9.2, Quote: 4.4 };
export const msStep = (v) => (v < 125 ? 0 : v < 145 ? 1 : v < 165 ? 2 : v < 190 ? 3 : v < 220 ? 4 : 5);
export const errStep = (v = 1.2) => (v < 1.5 ? 0 : v < 2.5 ? 1 : v < 3.5 ? 2 : v < 4.5 ? 3 : v < 6.5 ? 4 : 5);
const fingerMs = {};
const fingerErr = {};
for (const [f, codes] of Object.entries(F)) {
  const list = codes.split(' ').filter((c) => keyMs[c]);
  if (!list.length) continue;
  fingerMs[f] = Math.round(list.reduce((a, c) => a + keyMs[c], 0) / list.length);
  fingerErr[f] = +(list.reduce((a, c) => a + (keyErr[c] ?? 1.2), 0) / list.length).toFixed(1);
}
export const fingerAvg = fingerMs;
export const fingerErrAvg = fingerErr;

export function keyboard({ next = null, targets = ['KeyE', 'KeyA', 'KeyS'], heat = false, locked = [], cls = '', hidden = true } = {}) {
  const isLetter = (x) => /^[a-z]$/.test(x.base || '');
  const rows = ROWS.map((r) => `<div class="kbd__row">${r.map((x) => {
    const c = ['key'];
    if (x.mod) c.push('key--mod');
    if (x.code === 'KeyF' || x.code === 'KeyJ') c.push('key--home');
    if (targets.includes(x.code)) c.push('key--target');
    if (locked.includes(x.code)) c.push('key--locked');
    if (next !== null && x.base === next) c.push('is-next');
    const a = [`data-code="${x.code}"`, `data-f="${fingerOf[x.code]}"`];
    if (x.base !== undefined) a.push(`data-base="${x.base === '\n' ? '&#10;' : esc(x.base)}"`);
    if (x.shift) a.push(`data-shift="${esc(x.shift)}"`);
    if (x.shift && !isLetter(x)) a.push(`data-alt="${esc(x.shift)}"`);
    if (x.u && x.u !== 1) a.push(`style="--u:${x.u}"`);
    let extra = '';
    const label = x.mod ? x.label : x.code === 'Space' ? '' : isLetter(x) ? x.base.toUpperCase() : x.base;
    if (heat && keyMs[x.code]) {
      const name = x.code === 'Space' ? 'Space' : label;
      const err = (keyErr[x.code] ?? 1.2).toFixed(1);
      a.push(`data-h="${msStep(keyMs[x.code])}" data-hs="${msStep(keyMs[x.code])}" data-he="${errStep(keyErr[x.code])}" data-hf="${msStep(fingerMs[fingerOf[x.code]])}" data-hfe="${errStep(fingerErr[fingerOf[x.code]])}" data-tip="${esc(name)}: ${keyMs[x.code]} ms, ${err}% errors"`);
      extra = `<small class="key__v key__v--s">${keyMs[x.code]}</small><small class="key__v key__v--e">${err}</small>`;
    }
    return `<span class="${c.join(' ')}" ${a.join(' ')}><span class="key__l">${esc(label)}</span>${extra}</span>`;
  }).join('')}</div>`).join('\n');
  return `<div class="kbd ${cls}"${hidden ? ' aria-hidden="true"' : ''}>${rows}</div>`;
}

const LEN = { lp: 0.62, lr: 0.86, lm: 1, li: 0.9, lt: 0.46, rt: 0.46, ri: 0.9, rm: 1, rr: 0.86, rp: 0.62 };
export const hand = (side, list, active, label) => `<div class="hand hand--${side}"><div class="hand__fingers">${list.map((f) => `<i class="f${f === active ? ' is-on' : ''}" data-f="${f}" style="--l:${LEN[f]}"></i>`).join('')}</div><div class="hand__label">${label}</div></div>`;
export const LEFT = ['lp', 'lr', 'lm', 'li', 'lt'];
export const RIGHT = ['rt', 'ri', 'rm', 'rr', 'rp'];

// ---- Relief: contours of a height field traced by marching squares, in keyboard units.
// With preserveAspectRatio "slice" and a box one key pitch per unit high, hills sit under their keys.
export const WEAK = [['KeyE', 1], ['KeyS', 0.8], ['KeyA', 0.5], ['KeyP', 0.85], ['Semicolon', 0.72], ['KeyX', 0.45], ['Digit6', 0.45], ['Slash', 0.38], ['BracketLeft', 0.42]];
export function relief({ weak = WEAK, W = 30, H = 5.6, OY = 0.3, seedValue = 7, cls = '', density = 7 } = {}) {
  const OX = (W - 15) / 2;
  const NX = Math.round(W * density); const NY = Math.round(H * density);
  let s = seedValue;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const G = 40; const lat = [];
  for (let j = 0; j <= G; j += 1) { lat[j] = []; for (let i = 0; i <= G; i += 1) lat[j][i] = r(); }
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x) % G; const yi = Math.floor(y) % G;
    const fx = sm(x - Math.floor(x)); const fy = sm(y - Math.floor(y));
    const a = lat[yi][xi]; const b = lat[yi][xi + 1]; const c = lat[yi + 1][xi]; const d = lat[yi + 1][xi + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const hills = weak.map(([code, a]) => [keyPos[code].x + OX, keyPos[code].y + OY, a]);
  const f = (x, y) => {
    let v = (noise(x * 0.16 + 3, y * 0.26 + 5) * 0.62 + noise(x * 0.42 + 9, y * 0.62 + 2) * 0.2) * 1.05;
    for (const [hx, hy, a] of hills) v += a * Math.exp(-(((x - hx) ** 2) + (((y - hy) * 1.35) ** 2)) / 1.25);
    return v;
  };
  const grid = [];
  for (let j = 0; j <= NY; j += 1) { grid[j] = []; for (let i = 0; i <= NX; i += 1) grid[j][i] = f((i / NX) * W, (j / NY) * H); }
  const VW = 1000; const VH = (1000 * H) / W;
  const sx = VW / NX; const sy = VH / NY;
  const paths = { thin: '', bold: '' };
  let li = 0;
  for (let lv = 0.22; lv < 2; lv += 0.1) {
    let d = '';
    for (let j = 0; j < NY; j += 1) for (let i = 0; i < NX; i += 1) {
      const a = grid[j][i]; const b = grid[j][i + 1]; const c = grid[j + 1][i + 1]; const e = grid[j + 1][i];
      const t = (p, q) => (lv - p) / (q - p);
      const pts = [];
      if ((a < lv) !== (b < lv)) pts.push([(i + t(a, b)) * sx, j * sy]);
      if ((b < lv) !== (c < lv)) pts.push([(i + 1) * sx, (j + t(b, c)) * sy]);
      if ((e < lv) !== (c < lv)) pts.push([(i + t(e, c)) * sx, (j + 1) * sy]);
      if ((a < lv) !== (e < lv)) pts.push([i * sx, (j + t(a, e)) * sy]);
      if (pts.length >= 2) d += `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
      if (pts.length === 4) d += `M${pts[2][0].toFixed(1)} ${pts[2][1].toFixed(1)}L${pts[3][0].toFixed(1)} ${pts[3][1].toFixed(1)}`;
    }
    if (li % 5 === 4) paths.bold += d; else paths.thin += d;
    li += 1;
  }
  return `<svg class="relief ${cls}" viewBox="0 0 ${VW} ${VH.toFixed(0)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="relief__thin" d="${paths.thin}"/><path class="relief__bold" d="${paths.bold}"/></svg>`;
}

// One tiny contour mark for achievements: one ring per tier, so a tier never depends on colour.
export function tierMark(tier, hidden = false) {
  const rings = hidden ? 1 : tier;
  let d = '';
  for (let i = 0; i < rings; i += 1) {
    const R = 21 - i * 5; let path = '';
    for (let a = 0; a <= 24; a += 1) {
      const th = (a / 24) * Math.PI * 2;
      const rr = R + Math.sin(th * 3 + i * 1.7) * 1.1 + Math.cos(th * 2 + i) * 0.8;
      path += `${a ? 'L' : 'M'}${(24 + rr * Math.cos(th)).toFixed(1)} ${(24 + rr * Math.sin(th)).toFixed(1)}`;
    }
    d += `<path d="${path}Z"/>`;
  }
  return `<svg class="tier${hidden ? ' tier--hidden' : ''}" viewBox="0 0 48 48" aria-hidden="true">${d}${hidden ? '<text x="24" y="30" text-anchor="middle">?</text>' : ''}</svg>`;
}

// ---- Text streams
export function textStream(text, { cursor = 0, errs = {}, fixed = [], targets = /ea|ss/g, missed = [] } = {}) {
  const tgt = new Set();
  if (targets) for (const mm of text.matchAll(targets)) { tgt.add(mm.index); tgt.add(mm.index + 1); }
  let html = ''; let inWord = false;
  [...text].forEach((ch, i) => {
    const c = ['c']; let extra = '';
    if (i < cursor) {
      if (errs[i]) { c.push('err'); extra = ` data-typed="${esc(errs[i])}"`; }
      else if (fixed.includes(i)) c.push('fixed');
      else if (missed.includes(i)) c.push('miss');
      else c.push('done');
    } else if (i === cursor) c.push('cur');
    else if (tgt.has(i)) c.push('tgt');
    const span = `<span class="${c.join(' ')}"${extra}>${esc(ch)}</span>`;
    if (ch === ' ') { if (inWord) { html += '</span>'; inWord = false; } html += span; }
    else { if (!inWord) { html += '<span class="w">'; inWord = true; } html += span; }
  });
  if (inWord) html += '</span>';
  return html;
}

export function codeStream(code, cursor, errs = {}) {
  let html = ''; let i = 0;
  const lines = code.split('\n');
  lines.forEach((line, n) => {
    const indent = line.length - line.trimStart().length;
    [...line].forEach((ch, j) => {
      const c = ['c']; let extra = '';
      if (j < indent) c.push('ind');
      else if (/[^A-Za-z0-9\s]/.test(ch)) c.push('sym');
      if (i < cursor) {
        if (errs[i]) { c.push('err'); extra = ` data-typed="${esc(errs[i])}"`; } else c.push('done');
      } else if (i === cursor) c.push('cur');
      html += `<span class="${c.join(' ')}"${extra}>${esc(ch)}</span>`;
      i += 1;
    });
    if (n < lines.length - 1) {
      const c = ['c', 'nl'];
      if (i < cursor) c.push('done');
      html += `<span class="${c.join(' ')}" data-ch="&#10;">↵</span>\n`;
      i += 1;
    }
  });
  return html;
}

// ---- Page frame
const CVD = `<svg width="0" height="0" class="cvd-defs" aria-hidden="true"><defs>
<filter id="cvd-protan"><feColorMatrix values="0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0"/></filter>
<filter id="cvd-deutan"><feColorMatrix values="0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0"/></filter>
<filter id="cvd-tritan"><feColorMatrix values="1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0"/></filter>
<filter id="cvd-achroma"><feColorMatrix type="saturate" values="0"/></filter>
</defs></svg>`;

export function page({ title, description, body, typing = false, plain = false, variants = null, reloadVariants = false, data = false, gam = false, note = '' }) {
  const rows = [
    variants ? `<div class="review__row"><label for="rv-variant">State</label><select id="rv-variant" data-set-variant${reloadVariants ? ' data-reload' : ''}>${variants.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select></div>` : '',
    '<div class="review__row"><span>Theme</span><span class="review__seg"><button type="button" data-set-theme="light">Light</button><button type="button" data-set-theme="dark">Dark</button></span></div>',
    data ? '<div class="review__row"><label for="rv-data">Data</label><select id="rv-data" data-set-data><option value="full">Full</option><option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option></select></div>' : '',
    gam ? '<div class="review__row"><span>Gamification</span><span class="review__seg"><button type="button" data-set-gam="on">On</button><button type="button" data-set-gam="off">Clean</button></span></div>' : '',
    typing ? `<div class="review__row"><label for="rv-kbd">Keyboard</label><select id="rv-kbd" data-set-kbd><option value="on">On, finger hint</option><option value="error">Only on error</option><option value="off">Off</option></select></div>
    <div class="review__row"><span>Reward</span><span class="review__seg"><button type="button" data-reward="xp">XP</button><button type="button" data-reward="quest">Quest</button><button type="button" data-reward="level">Level</button></span></div>` : '',
    '<div class="review__row"><label for="rv-vision">Vision</label><select id="rv-vision" data-set-vision><option value="none">Typical</option><option value="protan">Protanopia</option><option value="deutan">Deuteranopia</option><option value="tritan">Tritanopia</option><option value="achroma">No colour</option></select></div>',
  ].join('\n    ');
  return `<!doctype html>
<html lang="en" data-theme="light"${plain ? ' data-kbd="off"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<script>(function(){var d=document.documentElement,p=new URLSearchParams(location.search),t=p.get('theme');if(!t){try{t=localStorage.getItem('keymind-mock-theme')}catch(e){}}if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t)d.dataset.theme=t;if(p.get('embed'))d.dataset.embed='1';if(p.get('data'))d.dataset.data=p.get('data');if(p.get('gam'))d.dataset.gam=p.get('gam');if(p.get('kbd'))d.dataset.kbd=p.get('kbd');})();</script>
<link rel="stylesheet" href="assets/screens.css">
</head>
<body>
${CVD}
<div class="page">
${body}
</div>
<details class="review">
  <summary>Mockup</summary>
  <div class="review__body">
    ${rows}
    <p>${note ? `${note} ` : ''}Figures are sample data.</p>
    <a href="index.html">All screens</a>
  </div>
</details>
<script src="assets/review.js"></script>
</body>
</html>
`;
}

// ---- App shell
const NAV = [['home', 'home.html', 'Home'], ['stats', 'statistics.html', 'Statistics'], ['brain', 'brain.html', 'Brain'], ['progress', 'achievements.html', 'Progress'], ['settings', 'settings.html', 'Settings']];
export function shell(active, content, { nav = NAV.map(([id]) => id), gam = true } = {}) {
  return `<div class="shell">
<header class="top">
  <a class="wordmark" href="home.html" aria-label="Keymind home">Keymind</a>
  <nav class="nav" aria-label="Main">${NAV.filter(([id]) => nav.includes(id)).map(([id, href, label]) => `<a class="nav__item${id === 'progress' ? ' gam' : ''}" href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  ${gam ? `<div class="top__right gam">
    <a class="top__stat" href="achievements.html"><span>Level</span> <b><span data-show="full loading error">14</span><span data-show="empty">1</span></b></a>
    <a class="top__stat" href="quests.html"><span>Streak</span> <b><span data-show="full loading error">23</span><span data-show="empty">0</span></b></a>
  </div>` : ''}
</header>
<main class="content">
${content}
</main>
</div>`;
}

export const progressTabs = (active) => `<nav class="tabs" aria-label="Progress">${[['achievements', 'Achievements'], ['quests', 'Quests'], ['events', 'Events'], ['challenges', 'Challenges']].map(([id, label]) => `<a class="tab" href="${id}.html"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;

// ---- Data states: every region that loads data draws all four.
const sk = (rows = 3) => `<div class="sk" aria-hidden="true">${Array.from({ length: rows }, (_, i) => `<i style="--w:${[92, 74, 84, 60, 78][i % 5]}%"></i>`).join('')}</div>`;
export function region({ full, rows = 3, loading, empty, error }) {
  const box = (cls, [head, text, action]) => `<div class="state state--${cls}"><p class="state__h">${head}</p><p>${text}</p>${action ? `<div class="state__a">${action}</div>` : ''}</div>`;
  return `<div class="region">
<div data-when="full">${full}</div>
<div data-when="loading" aria-busy="true"><span class="visually-hidden">Loading</span>${loading || sk(rows)}</div>
<div data-when="empty">${typeof empty === 'string' ? empty : box('empty', empty)}</div>
<div data-when="error">${typeof error === 'string' ? error : box('error', error)}</div>
</div>`;
}

export const sec = (title, inner, more = '', cls = '') => `<section class="sec ${cls}"><header class="sec__h"><h2>${title}</h2>${more}</header>${inner}</section>`;
export const meter = ({ label, value, max, text, tick, cls = '', state = '' }) => `<div class="meter ${cls}${state ? ` is-${state}` : ''}"><div class="meter__head"><span>${label}</span><b>${text}</b></div><div class="meter__bar" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}" aria-label="${esc(label)}"><i style="--v:${(value / max).toFixed(3)}"></i>${tick ? `<u style="--t:${(tick / max).toFixed(3)}"></u>` : ''}</div></div>`;
export const gram = (g) => `<span class="gram">${esc(g)}</span>`;

// ---- Variants: one mockup page holds several states, picked in the Mockup control or with ?variant=.
// The first name in a page's list is the default, so it is the one that shows before the script runs.
export const variantsOf = (list) => {
  const first = list[0][0];
  return (names, html, inline = false) => {
    const tag = inline ? 'span' : 'div';
    return `<${tag} class="v" data-v="${names}"${names.split(' ').includes(first) ? '' : ' hidden'}>${html}</${tag}>`;
  };
};

// ---- Typed text on the stage: the session line, the text, and the slot that holds messages.
// The slot keeps its height whether or not it says anything, so a message never moves the text.
export const runBar = (v, label) => `<div class="run" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><i style="--v:${v}"></i></div>`;
export const typedStage = ({ stream, run = '', source = '', notice = '', level = '', cls = '', lines = 0 }) => `${run}<div class="window ${cls}"${lines ? ` style="--lines:${lines}"` : ''}><div class="stream">${stream}</div></div>
    <div class="slot"><p class="notice" role="status" data-level="${level}">${notice}</p>${source ? `<p class="source">${source}</p>` : ''}</div>`;

// ---- Typing screen: one frame for every mode, only the stage changes.
export function typingScreen({ title, left, right = '', stage, next, finger = 'li', targets, deckCls = '', appCls = '', stats = true, time = '02:14', limit = null, wpm = 58, acc = '97%', restart = true, end = 'session-summary.html' }) {
  const label = fingerNames[finger];
  const leftHand = LEFT.includes(finger) ? finger : null;
  const rightHand = RIGHT.includes(finger) ? finger : null;
  return `<main class="app ${appCls}">
  <h1 class="visually-hidden">${esc(title)}</h1>
  <header class="bar">
    <div class="bar__group">${left}</div>
    <div class="bar__group">${right}${stats ? `<span class="stat"><b data-stat="time"${limit ? ` data-limit="${limit}"` : ''}>${time}</b>${limit ? ' left' : ''}</span><span class="stat"><b data-stat="wpm">${wpm}</b> WPM</span><span class="stat"><b data-stat="acc">${acc}</b> accuracy</span>` : ''}<span>Esc to pause</span></div>
  </header>
  <section class="stage" aria-label="Text to type">${stage}</section>
  <section class="deck ${deckCls}" aria-label="On-screen keyboard">
    ${relief()}
    <svg class="ripple" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="14"/><circle cx="50" cy="50" r="24"/><circle cx="50" cy="50" r="36"/></svg>
    ${hand('l', LEFT, leftHand, leftHand ? label : '')}
    <div class="kbdwrap">${keyboard({ next, targets })}</div>
    ${hand('r', RIGHT, rightHand, rightHand ? label : '')}
    <div class="rewards" aria-live="polite"></div>
  </section>
  <dialog class="pause" aria-label="Paused">
    <h2>Paused</h2>
    <p data-reason="esc">The session clock is stopped. Nothing is lost.</p>
    <p data-reason="blur" hidden>Another window took the focus, so the clock stopped. Nothing is lost.</p>
    <div class="row">
      <button type="button" class="btn btn--primary" data-resume>Resume</button>
      ${restart ? '<a class="btn" href="" data-restart>Restart</a>' : ''}
      <a class="btn btn--quiet" href="${end}">End session</a>
    </div>
  </dialog>
</main>`;
}
