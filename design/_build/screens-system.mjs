// The component sheet and the gallery of all screens.
import { gram, keyboard, meter, page, relief, tierMark, region } from './lib.mjs';

const STATES = ['Normal', 'Hover', 'Focus', 'Error', 'Disabled'];
const row = (name, cells) => `<tr><th scope="row">${name}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
const btnRow = (cls, label) => [
  `<button type="button" class="btn ${cls}">${label}</button>`,
  `<button type="button" class="btn ${cls} is-hover">${label}</button>`,
  `<button type="button" class="btn ${cls} is-focus">${label}</button>`,
  `<button type="button" class="btn ${cls} is-error">Failed, retry</button>`,
  `<button type="button" class="btn ${cls}" disabled>${label}</button>`,
];
const inputCell = (extra, attrs = '', err = '') => `<div class="field"><label>Daily goal</label><input class="input ${extra}" value="20 min" ${attrs}><p class="field__error">${err}</p></div>`;
const selectCell = (extra, attrs = '') => `<div class="field"><label>Sound set</label><select class="select ${extra}" ${attrs}><option>Soft</option><option>Tick</option></select></div>`;
const swCell = (extra, attrs = 'checked') => `<label class="switch ${extra}"><input type="checkbox" role="switch" ${attrs}><span class="switch__t"></span><span class="switch__state">On</span></label>`;
const segCell = (segCls, optCls, attrs = '') => `<span class="seg ${segCls}" role="group" aria-label="Sample"><button type="button" class="seg__o" aria-pressed="true" ${attrs}>Keys</button><button type="button" class="seg__o ${optCls}" ${attrs}>Fingers</button></span>`;
const navCell = (cls, extra = '') => `<a class="nav__item ${cls}" href="#components" style="min-height:40px" ${extra}>Statistics</a>`;
const tabCell = (cls) => `<a class="tab ${cls}" href="#components">Quests</a>`;
const keyCell = (cls, label = 'E', attrs = '') => `<span class="kbd"><span class="kbd__row"><span class="key ${cls}" ${attrs}><span class="key__l">${label}</span></span></span></span>`;
const questCell = (cls, m) => `<div class="quest ${cls}"><span class="quest__t">Three code sessions</span><span class="tag">Weekly</span>${meter(m)}</div>`;
const achCell = (cls, tier = 2) => `<div class="ach ${cls}">${tierMark(tier)}<div><p class="ach__t">Bracket mender</p><p class="ach__d">Cut recovery after { by 100 ms.</p></div></div>`;
const sessionRow = (cls, last = '58') => `<table class="tbl tbl--rows"><tbody><tr class="${cls}"><td>Adaptive</td><td class="n">${last}</td></tr></tbody></table>`;
const quickCellHtml = (attrs = '', cls = '', dis = '') => `<div class="quick__r"${attrs}><b class="quick__m">Zen</b><span class="quick__s">No setup</span><button type="button" class="btn btn--sm ${cls}"${dis}>Start</button><span></span></div>`;
const libCell = (attrs = '', cls = '') => `<div class="lib__r" style="grid-template-columns:minmax(0,1fr) auto"${attrs}><label class="lib__pick ${cls}"><input type="radio" name="cs-${cls || attrs.length}" checked><span class="lib__t">Walden</span></label><span class="lib__read"><b>36%</b> read</span></div>`;
const heatCells = [0, 1, 2, 3, 4, 5].map((i) => `<i class="heatcell" data-h="${i}"></i>`).join('');

const glyphs = [
  ['Upcoming', '<span class="c">a</span>'],
  ['Target', '<span class="c tgt">e</span><span class="c tgt">a</span>'],
  ['Current', '<span class="c cur">r</span>'],
  ['Zen caret, no next character', 'wr<span class="zen__caret"></span>'],
  ['Done', '<span class="c done">d</span>'],
  ['Error, shows what was typed', '<span class="c err" data-typed="w">e</span>'],
  ['Fixed after an error', '<span class="c fixed">s</span>'],
  ['Skipped, continuous video', '<span class="c miss">t</span>'],
];
const colorRoles = ['paper', 'paper-2', 'paper-3', 'ink', 'muted', 'rule', 'accent', 'signal', 'focus', 'target', 'caret-bg', 'error-bg', 'contour', 'chart-1', 'chart-2'];

export const componentsPage = page({
  title: 'Keymind: components',
  description: 'Every shared component in normal, hover, focus, error and disabled states.',
  typing: false,
  data: true,
  gam: true,
  body: `<main class="gal" id="components">
  <div class="page-head"><h1>Components and states</h1><a class="link" href="index.html">All screens</a></div>
  <section class="sec"><header class="sec__h"><h2>Controls</h2></header>
    <div class="cs-scroll"><table class="cs"><thead><tr><th>Component</th>${STATES.map((s) => `<th>${s}</th>`).join('')}</tr></thead><tbody>
      ${row('Button, primary', btnRow('btn--primary', 'Start session'))}
      ${row('Button, secondary', btnRow('', 'Export ZIP'))}
      ${row('Button, quiet', btnRow('btn--quiet', 'Retake the test'))}
      ${row('Input', [inputCell(''), inputCell('is-hover'), inputCell('is-focus'), inputCell('', 'aria-invalid="true"', 'Use a number of minutes.'), inputCell('', 'disabled')])}
      ${row('Select', [selectCell(''), selectCell('is-hover'), selectCell('is-focus'), selectCell('', 'aria-invalid="true"'), selectCell('', 'disabled')])}
      ${row('Switch', [swCell(''), swCell('is-hover'), swCell('is-focus'), swCell('is-error'), swCell('', 'checked disabled')])}
      ${row('Segmented', [segCell('', ''), segCell('', 'is-hover'), segCell('', 'is-focus'), segCell('is-error', ''), segCell('', '', 'disabled')])}
      ${row('Nav item', [navCell(''), navCell('is-hover'), navCell('is-focus'), navCell('is-error'), navCell('is-disabled', 'aria-disabled="true"')])}
      ${row('Tab', [tabCell(''), tabCell('is-hover'), tabCell('is-focus'), tabCell('is-error'), tabCell('is-disabled')])}
    </tbody></table></div>
  </section>
  <section class="sec"><header class="sec__h"><h2>Product pieces</h2></header>
    <div class="cs-scroll"><table class="cs"><thead><tr><th>Component</th>${STATES.map((s) => `<th>${s}</th>`).join('')}</tr></thead><tbody>
      ${row('Key', [keyCell(''), keyCell('is-hoverkey'), keyCell('is-focus'), keyCell('is-wrong'), keyCell('key--locked')])}
      ${row('Meter', [meter({ label: 'Today', value: 12, max: 20, text: '12 of 20' }), meter({ label: 'Today', value: 12, max: 20, text: '12 of 20', state: 'hover' }), `<div class="is-focus">${meter({ label: 'Today', value: 12, max: 20, text: '12 of 20' })}</div>`, meter({ label: 'Today', value: 12, max: 20, text: 'No data', state: 'error' }), meter({ label: 'Today', value: 12, max: 20, text: '12 of 20', state: 'disabled' })])}
      ${row('Quest row', [questCell('', { label: 'Progress', value: 1, max: 3, text: '1 of 3' }), questCell('is-hover', { label: 'Progress', value: 1, max: 3, text: '1 of 3' }), questCell('is-focus', { label: 'Progress', value: 1, max: 3, text: '1 of 3' }), questCell('', { label: 'Progress', value: 1, max: 3, text: 'No data', state: 'error' }), questCell('is-disabled', { label: 'Progress', value: 1, max: 3, text: '1 of 3' })])}
      ${row('Achievement', [achCell('is-earned'), achCell('is-earned is-hover'), achCell('is-earned is-focus'), achCell('is-error'), achCell('is-locked is-disabled')])}
      ${row('Session row', [sessionRow(''), sessionRow('is-hover'), sessionRow('is-focus'), sessionRow('', 'No data'), `<div style="opacity:.55">${sessionRow('')}</div>`])}
      ${row('Message in the slot', ['<p class="notice" data-level="act">Caps Lock is on.</p>', 'Not interactive', 'Never takes focus', '<p class="notice" data-level="wait">Saving is delayed.</p>', 'Empty keeps its height'])}
      ${row('Mode on the rail', ['<a class="rail__i" href="#components">Words</a><a class="rail__i" href="#components" aria-current="page">Texts</a>', '<a class="rail__i is-hover" href="#components">Words</a>', '<a class="rail__i is-focus" href="#components">Words</a>', 'A rail item has no error of its own', '<a class="rail__i is-disabled" aria-disabled="true">Words</a>'])}
      ${row('Quick session row', [quickCellHtml(), quickCellHtml(' style="background:var(--color-paper-3)"'), quickCellHtml('', 'is-focus'), '<div class="state state--error"><p class="state__h">Could not be read</p><p>The default setup is in place.</p></div>', quickCellHtml('', '', ' disabled')])}
      ${row('Library row', [libCell(), libCell(' style="background:var(--color-paper-3)"'), libCell('', 'is-focus'), '<div class="state state--error lib__fail"><p class="state__h">This file could not be read</p><p>Nothing was added.</p></div>', libCell(' style="opacity:.55"')])}
      ${row('Reward', ['<div class="reward is-static"><b>+12 XP</b><span>Clean run on ea</span></div>', 'Not interactive', 'Never takes focus', 'Not shown on errors', 'Off in Settings or clean mode'])}
      ${row('Heat cell', [`<i class="heatcell" data-h="3"></i>`, `<i class="heatcell" data-h="3" style="outline:1px solid var(--color-ink)"></i><br><span class="tip-demo">ea: 212 ms, 6.1% errors</span>`, `<i class="heatcell is-focus" data-h="3"></i>`, `<i class="heatcell" style="box-shadow:inset 0 0 0 1px var(--color-rule)"></i> Too few samples`, `<i class="heatcell" data-h="3" style="opacity:.55"></i>`])}
    </tbody></table></div>
  </section>
  <section class="sec"><header class="sec__h"><h2>Typed text</h2></header>
    <p class="muted" style="font-size:var(--text-sm);max-width:62ch;margin-block:var(--space-xs)">Error and current are told apart by shape and brightness first, then by hue. Use the Vision control to check.</p>
    <table class="tbl"><tbody>${glyphs.map(([n, g]) => `<tr><td style="width:280px">${n}</td><td class="glyph-demo">${g}</td></tr>`).join('')}</tbody></table>
  </section>
  <section class="sec"><header class="sec__h"><h2>Data states</h2></header>
    <div class="grid" style="margin-top:var(--space-xs)">
      <div class="s3"><h3 style="margin-bottom:var(--space-xs)">Full</h3>${meter({ label: 'Symbols typed', value: 840, max: 2000, text: '840 of 2,000' })}</div>
      <div class="s3"><h3 style="margin-bottom:var(--space-xs)">Loading</h3><div class="sk"><i style="--w:92%"></i><i style="--w:74%"></i><i style="--w:84%"></i></div></div>
      <div class="s3"><h3 style="margin-bottom:var(--space-xs)">Empty</h3><div class="state"><p class="state__h">No sessions yet</p><p>Your first session shows up here.</p><div class="state__a"><a class="btn" href="typing-words.html">Start session</a></div></div></div>
      <div class="s3"><h3 style="margin-bottom:var(--space-xs)">Error</h3><div class="state state--error"><p class="state__h">Sessions could not be loaded</p><p>Your journal is safe. Rebuild the statistics from it.</p><div class="state__a"><button class="btn" type="button">Rebuild from the journal</button></div></div></div>
    </div>
  </section>
  <section class="sec"><header class="sec__h"><h2>Keyboard, one component</h2></header>
    <div class="stack" style="margin-top:var(--space-xs)">
      <h3>Typing, next key and target keys</h3>${keyboard({ next: 'a', targets: ['KeyE', 'KeyS'] })}
      <h3>Locked keys, before they open</h3>${keyboard({ targets: [], locked: ['KeyQ', 'KeyZ', 'KeyX', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'Quote', 'Slash'] })}
      <h3>Heat, on the statistics screen</h3><div class="heat" data-view="keys" data-metric="speed">${keyboard({ heat: true, targets: [], cls: 'kbd--heat' })}</div>
      <h3>Ghost, over the relief</h3><div class="map">${relief()}${keyboard({ targets: ['KeyE', 'KeyA', 'KeyS'] })}</div>
    </div>
  </section>
  <section class="sec"><header class="sec__h"><h2>Type</h2></header>
    <div class="type-spec" style="margin-top:var(--space-xs)">
      <div><span>Page head, Golos Text 600</span><h1>You moved ${gram('e')} by 24 ms</h1></div>
      <div><span>Section, Golos Text 600</span><h2>Targeted transitions</h2></div>
      <div><span>Typing text, Golos Text 400</span><span style="font-size:var(--typing-size)">season lesson great pass</span></div>
      <div><span>Code, JetBrains Mono 400</span><span style="font-family:var(--font-code);font-size:var(--code-size)">fn rolling_mean(s: &amp;[f64])</span></div>
      <div><span>Body, Golos Text 400</span><span>Your left ring finger is 34 ms slower than your left index.</span></div>
      <div><span>Figures, JetBrains Mono 500</span><b style="font-family:var(--font-code);font-weight:500;font-size:var(--text-xl)">212 ms</b></div>
    </div>
  </section>
  <section class="sec"><header class="sec__h"><h2>Colour roles</h2></header>
    <div class="swatch-row">${colorRoles.map((c) => `<div class="swatch" style="--c:var(--color-${c})"><i></i><b>${c}</b></div>`).join('')}</div>
    <div class="row" style="margin-top:var(--space-sm)"><span class="muted" style="font-size:var(--text-sm)">Heat ramp</span>${heatCells}</div>
  </section>
</main>`,
});

const GROUPS = [
  ['First launch', [['onboarding-theme', 'Theme choice', 'The first step, now'], ['onboarding-theme?variant=save-error', 'Choice not saved', 'Keeps it, asks again'], ['onboarding-test', 'Starting test', 'Stage 3, can be skipped'], ['onboarding-result', 'Your relief', 'Stage 3, goal and reminder'], ['onboarding-layout', 'Layout choice', 'Stage 11']]],
  ['Home, as data arrives', [['home-now', 'Now', 'No statistics, no adaptive mode'], ['home-now?data=empty', 'Now, first launch', 'Nothing typed yet'], ['home-stats?data=empty', 'Statistics, no sessions', 'Flat ground, Statistics in the menu'], ['home-stats?variant=few', 'Statistics, three sessions', 'First hills, marked as early'], ['home-stats', 'Statistics, enough sessions', 'Relief and recent sessions'], ['home?gam=off', 'Adaptive', 'The brain picks the next session'], ['home', 'Adaptive with gamification', 'Level, goals, quests, event']]],
  ['Home, when the last setup cannot repeat', [['home-now?variant=paste', 'Pasted text', 'Never kept'], ['home-now?variant=deleted', 'File deleted', 'The title is gone too'], ['home-now?variant=device', 'On another computer', 'Files do not sync'], ['home-now?variant=device-empty', 'Another computer, no files', 'Add a file'], ['home-now?variant=finished', 'Book finished', 'Next, or read it again'], ['home-now?variant=finished-long', 'Finished, very long title', 'Two lines, full name on hover'], ['home-now?variant=row', 'Another mode', 'The row offers its setup'], ['home-stats?variant=paste', 'With statistics', 'Same words over the map']]],
  ['Set up a session', [['session-setup', 'Words, by count', 'The default'], ['session-setup?variant=words-time', 'Words, by time', 'Countdown length'], ['session-setup?variant=texts-passage', 'Texts, passages', 'Difficulty'], ['session-setup?variant=paste-filled', 'Texts, paste', 'Also empty, partial, nothing to type'], ['session-setup?variant=paste-none', 'Paste, nothing to type', 'Start stays off and says why'], ['session-setup?variant=zen', 'Zen', 'Nothing to set'], ['session-setup?variant=future', 'Later, all modes', 'Adaptive first, nine on the rail']]],
  ['Your files', [['session-setup?variant=file-list', 'Library', 'Reading position per file'], ['session-setup?variant=file-empty', 'Empty', 'What to do next'], ['session-setup?variant=file-importing', 'Importing', 'Long books, the app stays usable'], ['session-setup?variant=file-unreadable', 'Not readable', 'What is safe, what to try'], ['session-setup?variant=file-drm', 'Protected by DRM', 'Why, and what works'], ['session-setup?variant=file-notext', 'Nothing to type', 'Text with no keys on the layout'], ['session-setup?variant=file-finished', 'Book finished', 'Start again is explicit'], ['session-setup?variant=file-long', 'Very long title', 'Two lines, full name on hover'], ['session-setup?variant=file-delete', 'Confirm delete', 'In the row, not a dialog']]],
  ['Typing without a keyboard', [['plain-words', 'Words, by count', 'The main screen for now'], ['plain-time', 'Words, by time', 'Time left, line shortens'], ['plain-words?variant=short', 'Short text', 'The window fits the text'], ['plain-text', 'Text', 'Source in the message slot'], ['plain-text?variant=long', 'Very long title', 'Panel keeps its figures'], ['typing-zen', 'Zen', 'Own caret and panel'], ['typing-zen?variant=fresh', 'Zen, before the first key', 'One quiet line']]],
  ['Live figures off', [['plain-words?figures=off', 'Words, by count', 'Only the text and Esc'], ['plain-time?figures=off', 'Words, by time', 'The limit stays'], ['plain-text?figures=off', 'Text', 'Source stays in the slot'], ['typing-words?figures=off', 'With the keyboard', 'Same panel, stage 12']]],
  ['Messages while typing', [['typing-messages?variant=layout', 'Wrong layout', 'The press was not counted'], ['typing-messages?variant=caps', 'Caps Lock', 'Clears with the key'], ['typing-messages?variant=disk', 'Saving delayed', 'Waiting, no action'], ['typing-messages?variant=backspace', 'Backspace blocked', 'Answers a press'], ['typing-messages?variant=stop', 'Stop on error', 'Text waits for the key'], ['typing-messages?variant=pause-focus', 'Paused, lost focus', 'Same dialog, says why'], ['typing-messages?variant=pause-esc', 'Paused with Esc', 'The usual dialog']]],
  ['Typing', [['typing-words', 'Adaptive words', 'With the keyboard'], ['typing-text', 'Text', 'Public-domain passage'], ['typing-code', 'Code', 'Mono, indents, visible symbols'], ['typing-music', 'Music', 'Song lines, track progress'], ['typing-video-pause', 'Video, pause until typed', 'Player and subtitles'], ['typing-video-continuous', 'Video, continuous', 'Skipped characters are struck through']]],
  ['After a session', [['summary-plain', 'Words', 'Five figures, two leading'], ['summary-plain?variant=time', 'Words, by time', 'Time is the setup'], ['summary-plain?variant=text', 'Text, passage', 'Names the source'], ['summary-plain?variant=file', 'Text, from a file', 'Reading progress'], ['summary-plain?variant=zen', 'Zen', 'No accuracy'], ['summary-plain?variant=early-count', 'Ended early', 'Says where it stopped'], ['summary-plain?variant=short', 'Ended very early', 'Too few presses'], ['session-summary', 'Adaptive session', 'Target gain first']]],
  ['Past sessions', [['summary-saved', 'From Statistics', 'Saved figures, one way back'], ['summary-saved?variant=closed', 'The app closed', 'Says so, figures cover what was typed'], ['summary-saved?variant=file', 'Text from a file', 'No reading progress'], ['summary-saved?variant=home', 'From Home, a passage', 'Named in general words'], ['summary-saved?data=loading', 'Loading', 'The heading waits'], ['summary-saved?data=error', 'Could not be read', 'Rebuild from the journal']]],
  ['Understand', [['statistics', 'Statistics', 'What the app has now'], ['statistics?variant=one-day', 'One day of data', 'Figures instead of lines'], ['statistics?data=empty', 'No statistics yet', 'Start a session'], ['statistics?data=error', 'Could not be read', 'Rebuild from the journal'], ['statistics?data=loading', 'Loading', 'Skeleton'], ['statistics-later', 'Statistics, later', 'Recovery, streak, errors, fatigue'], ['brain', 'Brain', 'One key in focus, open letters'], ['brain?data=empty', 'Brain, nothing typed', 'Starts with the most frequent letter'], ['brain?data=error', 'Brain, could not read', 'Rebuild from the journal'], ['brain-later', 'Brain, later', 'ML against the heuristic']]],
  ['Progress', [['achievements', 'Achievements', 'Tiers and hidden'], ['quests', 'Quests', 'Goals, daily, weekly, personal'], ['events', 'Events', 'Symbol week'], ['challenges', 'Challenges', 'Special rules and ghost']]],
  ['System', [['settings', 'Settings', 'Every policy'], ['settings?variant=rebuilding#data', 'Rebuilding', 'Typing goes on'], ['settings?variant=rebuilt#data', 'Rebuilt', 'Says it is done'], ['settings?variant=rebuild-error#data', 'Rebuild failed', 'Says why'], ['settings?variant=damaged#data', 'Lines left out', 'Counts them'], ['tray', 'Tray and reminder', 'Text for what Windows draws'], ['components', 'Components', 'All states']]],
];

const fileOf = (href) => { const [path, hash] = href.split('#'); const [name, query] = path.split('?'); return `${name}.html${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`; };

export const galleryPage = page({
  title: 'Keymind screens',
  description: 'All mockups of the Relief direction.',
  body: `<main class="gal">
  <div class="stack">
    <h1>Keymind, direction Relief</h1>
    <p class="gal__intro">Static mockups. Every screen has a Mockup control at the bottom right for theme, data states, clean mode and colour vision. The typing screens accept real keystrokes, and Esc pauses them.</p>
  </div>
  ${GROUPS.map(([title, items]) => `<section class="sec"><header class="sec__h"><h2>${title}</h2></header>
    <div class="gal__grid">${items.map(([href, name, note]) => `<a class="thumb" href="${fileOf(href)}"><div class="thumb__f"><iframe data-src="${fileOf(href)}" title="${name}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></div><b>${name}</b><span>${note}</span></a>`).join('')}</div>
  </section>`).join('\n')}
</main>`,
});
export { region };
