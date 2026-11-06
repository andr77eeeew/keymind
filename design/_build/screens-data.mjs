// Home, session summary, statistics and the brain panel.
import { esc, fingerAvg, fingerErrAvg, fingerNames, gram, keyboard, keyErr, keyMedian, keyMs, medianOf, meter, msStep, errStep, page, region, relief, reseed, rnd, sec, shell, variantsOf } from './lib.mjs';
import { mapPin } from './screens-typing.mjs';
import { quickRows } from './screens-session.mjs';

// ---- Line chart: one axis, 2px line, last point marked and labelled
// Without min and max the range follows the app (src/stats/trends.ts): whole fives a little wider than the
// data, and three labels on the axis, the ends and one round number between them.
export function trendRange(values, ceiling) {
  const low = Math.min(...values); const high = Math.max(...values);
  const pad = Math.max((high - low) * 0.15, 1);
  let min = Math.max(0, Math.floor((low - pad) / 5) * 5);
  let max = Math.ceil((high + pad) / 5) * 5;
  if (ceiling !== undefined) max = Math.min(ceiling, max);
  if (max <= min) max = min + 5;
  const step = max - min >= 10 ? 5 : 1;
  return { min, max, ticks: [min, Math.round((min + max) / 2 / step) * step, max] };
}
export function lineChart({ title, unit = '', series, labels, min, max, ticks, ceiling, legend = false, w = 420, h = 170 }) {
  if (min === undefined) ({ min, max, ticks } = trendRange(series.flatMap((s) => s.values), ceiling));
  // B leaves air between the lowest value label and the first date, which sit at the same corner.
  const L = 34; const R = 40; const T = 10; const B = 30;
  const px = (i) => L + (i / (labels.length - 1)) * (w - L - R);
  const py = (v) => T + (1 - (v - min) / (max - min)) * (h - T - B);
  const grid = ticks.map((t) => `<line class="grid-l" x1="${L}" x2="${w - R}" y1="${py(t)}" y2="${py(t)}"/><text x="${L - 6}" y="${py(t) + 4}" text-anchor="end">${t}</text>`).join('');
  const lines = series.map((s, n) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join('');
    const last = s.values[s.values.length - 1];
    return `<path class="ln s${n + 1}" d="${d}"/><circle class="d${n + 1}" cx="${px(labels.length - 1)}" cy="${py(last)}" r="4"/><text class="end" x="${px(labels.length - 1) + 8}" y="${py(last) + 4}">${Math.round(last)}</text>`;
  }).join('');
  const data = esc(JSON.stringify({ labels, unit: unit ? ` ${unit}` : '', range: [L, w - R], series: series.map((s) => ({ name: s.name, values: s.values })) }));
  const table = `<details class="tv"><summary>View as table</summary><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Date</th>${series.map((s) => `<th class="n">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${labels.map((l, i) => `<tr><td>${l}</td>${series.map((s) => `<td class="n">${s.values[i]}${unit}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  const key = legend ? `<div class="row" style="margin-bottom:var(--space-2xs)">${series.map((s, n) => `<span class="keyline"><i class="k${n + 1}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<figure class="chart" tabindex="0" role="img" aria-label="${esc(title)}, use arrow keys to read values" data-points="${data}">
    <figcaption class="chart__t">${title}</figcaption>${key}
    <svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${grid}<text x="${L}" y="${h - 4}">${labels[0]}</text><text x="${w - R}" y="${h - 4}" text-anchor="end">${labels[labels.length - 1]}</text><line class="x" y1="${T}" y2="${h - B}"/>${lines}</svg>
    ${table}
  </figure>`;
}

// One day has no line to draw. The value stands as a figure, in the space the chart takes, with its date.
// The words hold for a first day ever and for a period with one day of typing in it.
export const oneDay = ({ title, value, unit, date }) => `<figure class="chart chart--one">
    <figcaption class="chart__t">${title}</figcaption>
    <div class="chart__one"><p class="figure"><b>${value}</b><span>${unit} on ${date}</span></p><p class="sec__note">The only day with typing in this period. A line needs two.</p></div>
  </figure>`;

const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 6 + i)); return `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`; });
// Sample trend: a noisy line from start to end, ending on the value the summary reports.
function walk(start, end, noise, s, dec = 0) {
  reseed(s * 99991);
  return days.map((_, i) => {
    const line = start + ((end - start) * i) / (days.length - 1);
    return +(i === days.length - 1 ? end : line + (rnd() - 0.5) * noise).toFixed(dec);
  });
}

const SESSIONS = [
  ['Today, 12:04', 'Adaptive', '10:02', 58, '97%', 'ea −24 ms'],
  ['Yesterday, 18:40', 'Code', '14:20', 41, '94%', '{ −31 ms'],
  ['Yesterday, 12:01', 'Adaptive', '10:00', 56, '96%', 'ss −9 ms'],
  ['Nov 2, 20:15', 'Music', '03:48', 52, '93%', 'none'],
  ['Nov 2, 12:10', 'Words', '05:00', 61, '98%', 'none'],
];
const sessionTable = (rows = SESSIONS) => `<table class="tbl tbl--rows"><thead><tr><th>When</th><th>Mode</th><th class="n">Time</th><th class="n">WPM</th><th class="n">Accuracy</th><th>Target gain</th></tr></thead><tbody>${rows.map(([a, b, c, d, e, f]) => `<tr><td><a class="link" href="session-summary.html">${a}</a></td><td>${b}</td><td class="n">${c}</td><td class="n">${d}</td><td class="n">${e}</td><td>${f}</td></tr>`).join('')}</tbody></table>`;

// ---- Home
const home = page({
  title: 'Keymind: home',
  description: 'Dashboard: next session on the skill relief, level, goals, quests, event and recent sessions.',
  data: true,
  gam: true,
  body: shell('home', `<div class="grid">
  <section class="sheet next s8 cleanwide">
    <div class="next__h">
      <h1><span data-show="full">Next session works on ${gram('ea')} and ${gram('ss')}</span><span data-show="empty">Your first session</span><span data-show="loading error">Your next session</span></h1>
      <a class="link" href="brain.html">Why this session</a>
    </div>
    ${region({
      full: `<div class="map">
        ${relief({ seedValue: 7 })}
        ${keyboard({ targets: ['KeyE', 'KeyA', 'KeyS'], cls: 'kbd--map' })}
        ${mapPin(4, 1.5, '<b>ea</b> 188 ms')}
        ${mapPin(2.75, 2.5, '<b>ss</b> 196 ms')}
      </div>`,
      loading: '<div class="sk"><i style="--w:100%;height:190px"></i></div>',
      empty: ['No relief yet', 'A one-minute test draws your first map.', '<a class="btn" href="onboarding-test.html">Take the starting test</a>'],
      error: ['The statistics could not be read', 'Your journal is safe. Rebuild the statistics from it and the map comes back.', '<button class="btn" type="button">Rebuild from the journal</button>'],
    })}
    <div class="next__a">
      <a class="btn btn--primary" href="typing-words.html">Start session</a>
    </div>
    ${quickRows([['Words', '25 words from the 1,000 most common', 'plain-words.html', 'session-setup.html'], ['Texts', 'Walden, continues at 36%', 'plain-text.html', 'session-setup.html?variant=file-list'], ['Zen', 'No setup and no figures', 'typing-zen.html', '']])}
  </section>
  <aside class="s4 stack gam">
    <section class="sec"><header class="sec__h"><h2><span data-show="full loading error">Level 14</span><span data-show="empty">Level 1</span></h2><a class="link" href="achievements.html">Achievements</a></header>
      <div data-show="full loading error">${meter({ label: 'XP to level 15', value: 2340, max: 3000, text: '2,340 of 3,000' })}</div><div data-show="empty">${meter({ label: 'XP to level 2', value: 0, max: 500, text: '0 of 500' })}</div>
    </section>
    <section class="sec"><header class="sec__h"><h2>Streak</h2><span class="tnum"><span data-show="full loading error">23 days</span><span data-show="empty">0 days</span></span></header>
      <p class="muted" style="font-size:var(--text-sm)"><span data-show="full loading error">One freeze left. It saves a missed day.</span><span data-show="empty">Your first session starts it.</span></p>
    </section>
    <section class="sec"><header class="sec__h"><h2>Goals</h2><a class="link" href="quests.html">Edit</a></header>
      <div class="stack" style="gap:var(--space-sm)">
        <div data-show="full loading error">${meter({ label: 'Today', value: 12, max: 20, text: '12 of 20 min' })}</div><div data-show="empty">${meter({ label: 'Today', value: 0, max: 15, text: '0 of 15 min' })}</div>
        <div data-show="full loading error">${meter({ label: 'This week', value: 3, max: 5, text: '3 of 5 sessions' })}</div><div data-show="empty">${meter({ label: 'This week', value: 0, max: 5, text: '0 of 5 sessions' })}</div>
      </div>
    </section>
  </aside>
  ${sec('Quests', region({
    full: `<ul class="rows">
      <li class="quest"><span class="quest__t">Bring ss under 190 ms</span><span class="tag tag--accent">From the brain</span>${meter({ label: 'Now 196 ms', value: 8, max: 15, text: '8 of 15 ms' })}</li>
      <li class="quest"><span class="quest__t">Type 10 minutes at 96% or better</span><span class="tag">Daily</span>${meter({ label: 'Progress', value: 7, max: 10, text: '7 of 10 min' })}</li>
      <li class="quest"><span class="quest__t">Three code sessions</span><span class="tag">Weekly</span>${meter({ label: 'Progress', value: 1, max: 3, text: '1 of 3' })}</li>
    </ul>`,
    empty: ['No quests right now', 'New daily quests appear tomorrow.', ''],
    error: ['Quests could not be loaded', 'A rule file has an error. Practice still counts.', '<a class="btn" href="settings.html#data">Open data settings</a>'],
  }), '<a class="link" href="quests.html">All quests</a>', 's4 gam')}
  ${sec('Event', region({
    full: `<div class="event"><h3>Symbol week</h3><p class="muted">Nov 2 to 8. Brackets and Shift pairs earn double XP.</p>
      ${meter({ label: 'Symbols typed', value: 840, max: 2000, text: '840 of 2,000' })}
      <a class="btn btn--sm" href="events.html" style="justify-self:start">Open event</a></div>`,
    empty: ['No event this week', 'Dates live in local files, so events run offline.', ''],
    error: ['The event could not be read', 'Its content file has an error.', ''],
  }), '', 's3 gam')}
  ${sec('Recent sessions', region({
    full: sessionTable(SESSIONS.slice(0, 4)),
    rows: 5,
    empty: ['No sessions yet', 'Your first session shows up here.', '<a class="btn" href="typing-words.html">Start session</a>'],
    error: ['Sessions could not be loaded', 'Your journal is safe. Rebuild the statistics from it.', '<button class="btn" type="button">Rebuild from the journal</button>'],
  }), '<a class="link" href="statistics-later.html">Statistics</a>', 's5 cleanwide')}
</div>`),
});

// ---- Session summary
const beforeWeak = [['KeyE', 1], ['KeyS', 0.85], ['KeyA', 0.55], ['KeyP', 0.85], ['Semicolon', 0.72], ['KeyX', 0.45], ['Digit6', 0.45], ['Slash', 0.38], ['BracketLeft', 0.42]];
const afterWeak = [['KeyE', 0.7], ['KeyS', 0.72], ['KeyA', 0.42], ['KeyP', 0.85], ['Semicolon', 0.72], ['KeyX', 0.45], ['Digit6', 0.45], ['Slash', 0.38], ['BracketLeft', 0.42]];
const summary = page({
  title: 'Session summary',
  description: 'What changed on the targeted transitions, then the speed, accuracy, XP, goals and a tip.',
  gam: true,
  data: true,
  body: shell('home', `<div class="levelup gam" role="status"><b>Level 15</b><a class="btn btn--sm" href="achievements.html">See what opened</a></div>
<div class="page-head"><h1>You moved ${gram('ea')} by 24 ms</h1><p>Adaptive session, today at 12:04</p></div>
<div class="grid">
  <div class="s7 stack" style="gap:var(--space-lg)">
    ${sec('Targeted transitions', `<table class="tbl"><thead><tr><th>Transition</th><th class="n">Before</th><th class="n">After</th><th class="n">Change</th><th class="n">Errors</th></tr></thead><tbody>
      <tr><td>${gram('ea')}</td><td class="n">212 ms</td><td class="n">188 ms</td><td class="n"><b class="delta">−24 ms</b></td><td class="n">6.1% to 3.8%</td></tr>
      <tr><td>${gram('ss')}</td><td class="n">205 ms</td><td class="n">196 ms</td><td class="n"><b class="delta">−9 ms</b></td><td class="n">5.4% to 5.1%</td></tr>
    </tbody></table>`)}
    ${sec('Your relief', `<div class="ba">
      <figure><figcaption>Before</figcaption><div class="map">${relief({ weak: beforeWeak })}${keyboard({ targets: ['KeyE', 'KeyA', 'KeyS'] })}</div></figure>
      <figure><figcaption>After</figcaption><div class="map">${relief({ weak: afterWeak })}${keyboard({ targets: ['KeyE', 'KeyA', 'KeyS'] })}</div></figure>
    </div>`)}
    ${sec('Tip', `<p style="font-size:var(--text-sm)">Your left ring finger is 22 ms slower than your left index. Try the S and X drill.</p><p class="muted" style="font-size:var(--text-xs)">Based on 412 presses across your last 5 sessions.</p>`, '<a class="link" href="settings.html#progress">Tips settings</a>')}
  </div>
  <div class="s5 stack" style="gap:var(--space-lg)">
    ${sec('Session', `<div class="figures">
      <div class="figure"><b>58</b><span>WPM</span></div><div class="figure"><b>97%</b><span>Accuracy</span></div>
      <div class="figure"><b>72%</b><span>Rhythm evenness</span></div><div class="figure"><b>10:02</b><span>Time</span></div>
    </div>`)}
    ${sec('XP', `<table class="tbl"><tbody>
      <tr><td>10 min of practice</td><td class="n">100</td></tr>
      <tr><td>Accuracy 97%</td><td class="n">× 0.97</td></tr>
      <tr><td>Gain on weak transitions</td><td class="n">+31</td></tr>
      <tr><td><b>Earned</b></td><td class="n"><b>128 XP</b></td></tr>
    </tbody></table>`, '', 'gam')}
    ${sec('Errors', `<div class="bars">
      <div><span>Substitution</span><i class="bar-h" style="--v:.72"></i><b>13</b></div>
      <div><span>Omission</span><i class="bar-h" style="--v:.28"></i><b>5</b></div>
      <div><span>Transposition</span><i class="bar-h" style="--v:.17"></i><b>3</b></div>
    </div>`)}
    ${sec('Goals', `<div class="stack" style="gap:var(--space-sm)">
      ${meter({ label: 'Today', value: 22, max: 20, text: '22 of 20 min', state: 'done' })}
      ${meter({ label: 'Quest: bring ss under 190 ms', value: 9, max: 15, text: '9 of 15 ms' })}
    </div>`, '', 'gam')}
  </div>
</div>
<div class="row">
  <a class="btn btn--primary" href="typing-words.html">Next session</a>
  <a class="btn" href="home.html">Back to home</a>
</div>`),
});

// ---- Statistics
// `statistics` is what the app shows now (ADR-0009). `statistics-later` keeps what needs data from later
// stages: recovery, streak, errors by type, fatigue, cells in focus and the gain on targets.
const legend = (lo, hi) => `<span class="legend"><span>${lo}</span><span class="legend__ramp">${[0, 1, 2, 3, 4, 5].map((i) => `<i data-h="${i}"></i>`).join('')}</span><span>${hi}</span></span>`;
const fingerOrder = ['lp', 'lr', 'lm', 'li', 'lt', 'rt', 'ri', 'rm', 'rr', 'rp'];
const short = { lp: 'Pinky', lr: 'Ring', lm: 'Mid', li: 'Index', lt: 'Thumb', rt: 'Thumb', ri: 'Index', rm: 'Mid', rr: 'Ring', rp: 'Pinky' };
const fingersChart = () => {
  const present = fingerOrder.filter((f) => fingerAvg[f]);
  const top = Math.max(...present.map((f) => fingerAvg[f]));
  return `<div class="fingers">${present.map((f) => `<div data-tip="${fingerNames[f]}: ${fingerAvg[f]} ms, ${fingerErrAvg[f]}% errors"><i class="c-bar" data-h="${msStep(fingerAvg[f], keyMedian)}" style="--v:${(fingerAvg[f] / top).toFixed(2)}"></i><b>${fingerAvg[f]}</b><span>${short[f]}</span></div>`).join('')}</div><div class="fingers__hands"><span>Left hand</span><span>Right hand</span></div>`;
};
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
// Transitions are measured against their own median, as keys are against theirs.
function matrix(focus) {
  reseed(77);
  const rare = /^(q[^u]|[jqxz][jqxz]|[vw]x|x[vwk]|k[qz]|z[fgkx]|[bcfgjkmpvwxz][qxz]|j[bcdfgklmnpstvw])/;
  const cells = [];
  LETTERS.forEach((a) => LETTERS.forEach((b) => {
    const g = a + b;
    if (rare.test(g)) { cells.push({ g }); return; }
    const base = (keyMs[`Key${a.toUpperCase()}`] + keyMs[`Key${b.toUpperCase()}`]) / 2;
    const same = a === b ? 18 : 0;
    const ms = Math.round(base + same + (rnd() - 0.5) * 34);
    const err = +(((keyErr[`Key${a.toUpperCase()}`] ?? 1.2) + (keyErr[`Key${b.toUpperCase()}`] ?? 1.2)) / 2 + rnd() * 1.1).toFixed(1);
    cells.push({ g, ms: g === 'ea' ? 188 : g === 'ss' ? 196 : ms, err: g === 'ea' ? 3.8 : g === 'ss' ? 5.1 : err });
  }));
  const median = medianOf(cells.filter((c) => c.ms).map((c) => c.ms));
  const out = ['<span></span>', ...LETTERS.map((l) => `<span>${l}</span>`)];
  LETTERS.forEach((a, row) => {
    out.push(`<span>${a}</span>`);
    cells.slice(row * 26, row * 26 + 26).forEach((c) => {
      if (!c.ms) { out.push(`<i data-s="x" data-tip="${c.g}: too few samples"></i>`); return; }
      const st = msStep(c.ms, median); const e = errStep(c.err);
      out.push(`<i data-h="${st}" data-s="${st}" data-e="${e}"${focus && (c.g === 'ea' || c.g === 'ss') ? ' class="is-focus-cell"' : ''} data-tip="${c.g}: ${c.ms} ms, ${c.err}% errors"></i>`);
    });
  });
  return `<div class="mx-wrap"><div class="mx" id="mx" data-metric="speed" role="img" aria-label="Transition matrix. The first letter is the row, the second is the column. The table beside it lists the slowest transitions.">${out.join('')}</div></div>`;
}
// The date a transition was last typed. Today in these mockups is Nov 4, the last day of the trends.
const slowest = [['pe', 203, 4.9, 'Nov 1'], ['ex', 198, 4.4, 'Oct 27'], ['ss', 196, 5.1, 'Nov 4'], ['sw', 194, 3.7, 'Nov 2'], ['ax', 192, 3.4, 'Oct 24'], ['ze', 189, 3.3, 'Oct 30'], ['ea', 188, 3.8, 'Nov 4'], ['qu', 186, 3.1, 'Oct 31']];
const slowestTable = (one) => `<table class="tbl tbl--rows"><thead><tr><th>Transition</th><th class="n">Time</th><th class="n">Errors</th><th>Last typed</th></tr></thead><tbody>${slowest.map(([g, ms, e, d]) => `<tr><td>${gram(g)}</td><td class="n">${ms} ms</td><td class="n">${e}%</td><td>${one ? 'Nov 4' : d}</td></tr>`).join('')}</tbody></table>`;

// A row or a record opens the saved summary of that session. Each kind is a variant of summary-saved.
const SAVED = (v) => `summary-saved.html${v ? `?variant=${v}` : ''}`;
const STATS_RECENT = [
  ['Today, 01:11', 'Words', '00:45', 67, '97%', '', 'none'],
  ['Today, 00:58', 'Adaptive', '02:10', 55, '96%', '', 'ea −24 ms'],
  ['Yesterday, 21:30', 'Texts', '04:02', 52, '99%', 'file', 'none'],
  ['Yesterday, 18:20', 'Zen', '04:12', 49, 'None', '', 'none'],
  ['Nov 2, 20:15', 'Words', '00:38', 47, '94%', 'closed', 'none'],
  ['Nov 2, 12:10', 'Texts', '00:46', 52, '98%', '', 'none'],
];
const ONE_DAY_RECENT = [['Today, 01:11', 'Words', '00:45', 67, '97%', '', 'none'], ['Today, 00:58', 'Adaptive', '02:10', 55, '96%', '', 'ea −24 ms'], ['Today, 00:40', 'Texts', '04:02', 52, '99%', 'file', 'none'], ['Today, 00:31', 'Words', '00:38', 47, '94%', 'closed', 'none']];
const recentStats = (gain, rows = STATS_RECENT) => `<table class="tbl tbl--rows"><thead><tr><th>When</th><th>Mode</th><th class="n">Time</th><th class="n">WPM</th><th class="n">Accuracy</th>${gain ? '<th>Target gain</th>' : ''}</tr></thead><tbody>${rows.map(([a, b, c, d, e, v, f]) => `<tr><td><a class="link" href="${SAVED(v)}">${a}</a></td><td>${b}</td><td class="n">${c}</td><td class="n">${d}</td><td class="n">${e}</td>${gain ? `<td>${f}</td>` : ''}</tr>`).join('')}</tbody></table>`;
const record = (label, value, date, v) => `<tr><td><a class="link" href="${SAVED(v)}">${label}</a></td><td class="n">${value}</td><td>${date}</td></tr>`;

const WPM = walk(44, 58, 3, 3);
const ACC = walk(93, 97, 1.4, 5, 1);
const RHY = walk(58, 72, 4, 9);
const trends = (one) => [
  ['Speed, WPM', 'WPM', '', WPM, '58', 'WPM', undefined],
  ['Accuracy, %', 'Accuracy', '%', ACC, '97%', 'Accuracy', 100],
  ['Rhythm evenness, %', 'Rhythm evenness', '%', RHY, '72%', 'Rhythm evenness', 100],
].map(([title, name, unit, values, today, word, ceiling]) => `<section class="sec s4">${one
  ? oneDay({ title, value: today, unit: word, date: 'Nov 4' })
  : lineChart({ title, series: [{ name, values }], labels: days, unit, ceiling })}</section>`).join('\n  ');

const STATS = [['many', 'Thirty days'], ['one-day', 'One day of data']];
const vst = variantsOf(STATS);
const statsGrid = (later) => `<div class="grid">
  ${sec('Keyboard', `<div class="sec__tools">
      <span class="row">
        <span class="seg" data-seg-target="#heat" data-seg-attr="view" role="group" aria-label="Group by"><button type="button" data-value="keys" aria-pressed="true">Keys</button><button type="button" data-value="fingers" aria-pressed="false">Fingers</button></span>
        <span class="seg" data-seg-target="#heat" data-seg-attr="metric" role="group" aria-label="Measure"><button type="button" data-value="speed" aria-pressed="true">Speed</button><button type="button" data-value="errors" aria-pressed="false">Errors</button></span>
      </span>
      ${legend('Fast, clean', 'Slow, many errors')}
    </div>
    <div class="heat" id="heat" data-view="keys" data-metric="speed">${keyboard({ heat: true, targets: [], cls: 'kbd--heat', hidden: false })}</div>`, '', 's8')}
  ${sec('By finger', `${fingersChart()}<p class="sec__note sec__note--after">Average time to press, in ms. Your left ring finger is 22 ms slower than your left index.</p>`, '', 's4')}
  ${sec('Transitions', `<div class="sec__tools">
      <span class="seg" data-seg-target="#mx" data-seg-attr="metric" role="group" aria-label="Measure"><button type="button" data-value="speed" aria-pressed="true">Speed</button><button type="button" data-value="errors" aria-pressed="false">Errors</button></span>
      <span class="sec__note">${later ? 'Row is the first key. Outlined cells are in focus.' : 'Row is the first key.'}</span>
    </div>${matrix(later)}`, '', 's6')}
  ${later ? sec('Slowest transitions', slowestTable(false), '', 's6') : `${vst('many', sec('Slowest transitions', slowestTable(false), '', 's6'))}${vst('one-day', sec('Slowest transitions', slowestTable(true), '', 's6'))}`}
  ${later ? trends(false) : `${vst('many', trends(false))}${vst('one-day', trends(true))}`}
  ${sec('Records', `<table class="tbl"><tbody>
      ${record('Best speed', '67 WPM', 'Nov 4', '')}
      ${record('Best accuracy', '99.1%', later ? 'Nov 3' : `${vst('many', 'Nov 3', true)}${vst('one-day', 'Nov 4', true)}`, 'file')}
      ${later ? `<tr><td>Fastest recovery after {</td><td class="n">310 ms</td><td>Nov 3</td></tr>
      <tr class="gam"><td>Longest streak</td><td class="n">23 days</td><td>Now</td></tr>` : ''}
    </tbody></table>`, '', 's4')}
  ${sec('Recent sessions', later ? recentStats(true) : `${vst('many', recentStats(false))}${vst('one-day', recentStats(false, ONE_DAY_RECENT))}`, '', 's8')}
  ${later ? `${sec('Errors by type', `<div class="bars">
      <div><span>Substitution</span><i class="bar-h" style="--v:.68"></i><b>68%</b></div>
      <div><span>Omission</span><i class="bar-h" style="--v:.2"></i><b>20%</b></div>
      <div><span>Transposition</span><i class="bar-h" style="--v:.12"></i><b>12%</b></div>
    </div>`, '', 's4')}
  <section class="sec s8">${lineChart({ title: 'Fatigue: accuracy by minute in session', series: [{ name: 'Accuracy', values: [98, 98, 97.8, 97.6, 97.5, 97.2, 97.1, 96.8, 96.4, 96, 95.6, 95.1, 94.7, 94.4, 94.1] }], labels: Array.from({ length: 15 }, (_, i) => `min ${i + 1}`), unit: '%', ceiling: 100, w: 640 })}</section>` : ''}
</div>`;
const statsHead = `<div class="page-head"><h1>Statistics</h1>
  <span class="seg" data-toggle role="group" aria-label="Period"><button type="button" aria-pressed="false">7 days</button><button type="button" aria-pressed="true">30 days</button><button type="button" aria-pressed="false">All time</button></span></div>`;
const statsRegion = (later) => region({
  full: statsGrid(later),
  rows: 5,
  empty: ['No statistics yet', 'Finish one session and the heatmap, matrix and trends fill in.', '<a class="btn btn--primary" href="plain-words.html">Start session</a>'],
  error: ['The statistics could not be read', 'The local database is damaged or out of date. Your journal is safe; rebuild from it.', '<button class="btn" type="button">Rebuild from the journal</button>'],
});
const statistics = page({
  title: 'Keymind: statistics',
  description: 'Keyboard heatmap by keys and fingers, transition matrix, trends, records and recent sessions, as the app has them now.',
  data: true,
  variants: STATS,
  note: 'Speed is coloured against your own median key, errors in absolute percent. Today is Nov 4 here.',
  body: shell('stats', `${statsHead}${statsRegion(false)}`, { nav: ['home', 'stats', 'settings'], gam: false }),
});
const statisticsLater = page({
  title: 'Keymind: statistics, later stages',
  description: 'What the statistics screen gains once the data exists: recovery, streak, errors by type, fatigue, cells in focus and the gain on targets.',
  data: true,
  gam: true,
  body: shell('stats', `${statsHead}${statsRegion(true)}`),
});

// ---- Brain
const weeks = ['Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2'];
const brain = page({
  title: 'Keymind: brain',
  description: 'What the adaptive engine is focused on and why, and how ML compares with the heuristic.',
  data: true,
  gam: true,
  body: shell('brain', `<div class="page-head"><h1>Brain</h1><a class="link" href="settings.html#brain">Brain settings</a></div>
${region({
    full: `<div class="grid">
  <section class="sheet s7 stack">
    <div class="next__h"><h2>In focus: ${gram('ea')} ${gram('ss')}</h2><span class="tag tag--target">Chosen by ML, A/B session</span></div>
    <p style="font-size:var(--text-sm)">These two are still slow, and everyday English leans on them more than on anything slower. Faster here saves the most time.</p>
    <div>
      <h3 style="margin-bottom:var(--space-xs)">What drove the pick</h3>
      <div class="bars">
        <div><span>Finger pair</span><i class="bar-h" style="--v:.34"></i><b>34%</b></div>
        <div><span>Row change</span><i class="bar-h" style="--v:.27"></i><b>27%</b></div>
        <div><span>Minutes into session</span><i class="bar-h" style="--v:.18"></i><b>18%</b></div>
        <div><span>Time since last practice</span><i class="bar-h" style="--v:.11"></i><b>11%</b></div>
        <div><span>Position in word</span><i class="bar-h" style="--v:.06"></i><b>6%</b></div>
        <div><span>Shift needed</span><i class="bar-h" style="--v:.04"></i><b>4%</b></div>
      </div>
    </div>
  </section>
  <div class="s5 stack" style="gap:var(--space-lg)">
    ${sec('Recipe for the next session', `<table class="tbl"><tbody>
      <tr><td>New material</td><td class="n">30%</td></tr>
      <tr><td>Review</td><td class="n">70%</td></tr>
      <tr><td>Length</td><td class="n">10 min</td></tr>
      <tr><td>Difficulty</td><td class="n">Medium</td></tr>
    </tbody></table>`)}
    ${sec('Due for review', `<ul class="rows">
      <li style="grid-template-columns:auto minmax(0,1fr) auto">${gram('{')}<span>then Enter</span><span class="muted">Today</span></li>
      <li style="grid-template-columns:auto minmax(0,1fr) auto">${gram('p;')}<span>Same finger</span><span class="muted">Tomorrow</span></li>
      <li style="grid-template-columns:auto minmax(0,1fr) auto">${gram('ex')}<span>Row change</span><span class="muted">Nov 7</span></li>
    </ul>`)}
  </div>
  ${sec('ML against the heuristic', `<p class="tag tag--strong" style="margin-block:var(--space-xs) var(--space-sm)">Not conclusive yet</p>
    <p style="font-size:var(--text-sm);margin-bottom:var(--space-md)">ML leads by 5 ms, with an interval of 6 ms each way. That still includes zero, so ML cannot be called better.</p>
    <table class="tbl"><thead><tr><th>Sessions alternate</th><th class="n">Sessions</th><th class="n">Gain on targets</th><th class="n">Session WPM</th></tr></thead><tbody>
      <tr><td>ML</td><td class="n">42</td><td class="n">−14 ms ± 5</td><td class="n">55</td></tr>
      <tr><td>Heuristic</td><td class="n">41</td><td class="n">−9 ms ± 4</td><td class="n">56</td></tr>
    </tbody></table>
    <p class="muted" style="font-size:var(--text-xs);margin-top:var(--space-xs)">The reward is gain on targeted transitions. Session WPM is shown for context and is not rewarded.</p>`, '', 's6')}
  <div class="s6">${lineChart({
    title: 'Time saved on targeted transitions, ms per week',
    legend: true,
    series: [{ name: 'ML', values: [4, 6, 9, 10, 12, 14] }, { name: 'Heuristic', values: [5, 5, 7, 8, 8, 9] }],
    labels: weeks,
    min: 0,
    max: 20,
    ticks: [0, 10, 20],
    w: 560,
    h: 220,
  })}</div>
  ${sec('Experiments', `<table class="tbl tbl--rows"><thead><tr><th>Experiment</th><th>Change</th><th>Status</th><th>Result</th></tr></thead><tbody>
    <tr><td class="tnum">exp-004</td><td>Add time since last practice</td><td><span class="tag tag--strong">Running</span></td><td>Waiting for sessions</td></tr>
    <tr><td class="tnum">exp-003</td><td>Longer forgetting window</td><td><span class="tag">Done</span></td><td>No clear gain, rolled back</td></tr>
  </tbody></table>`, '', 's12')}
</div>`,
    rows: 6,
    empty: ['Still on the heuristic', 'ML starts once there are enough sessions. Until then the weakest key is in focus and letters open by frequency.', '<a class="btn btn--primary" href="typing-words.html">Start session</a>'],
    error: ['The model could not be trained', 'The heuristic picks sessions for now, and practice still counts.', '<button class="btn" type="button">Retrain</button>'],
  })}`),
});

export const dataPages = { home, 'session-summary': summary, statistics, 'statistics-later': statisticsLater, brain };
export { sessionTable };
