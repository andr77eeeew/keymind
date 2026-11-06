// What the first builds of the app need: starting a session, Home before there is data, the typing
// screen without a keyboard, Zen, messages while typing, and plain summaries.
import { esc, keyboard, meter, page, region, relief, runBar, sec, shell, textStream, typedStage, typingScreen, variantsOf } from './lib.mjs';

// ---- Sample copy, written for the mockups or in the public domain
const WALDEN = 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.';
const WORDS = 'state with little people around their work place about small while another house great never always under world after again those every thing still between right should through water might number found point other three because different';
const LONG_TITLE = 'The Complete and Unabridged Illustrated Works of an Unusually Verbose Victorian Naturalist, Volume Seven, Including All Appendices, Corrections and Letters to the Editor (Second Edition, Revised).epub';
const SHORT_LONG = 'The Complete and Unabridged Illustrated Works of an Unusually Verbose Victorian Naturalist';
const ZEN_TEXT = 'Nothing on this screen is keeping score, so the sentence can wander for as long as it likes.\nThe older lines drift up and leave, and only the last few words stay close to the hands.\nWhen the thought runs out, a new line is one key away';

// ---- Home: the remembered setups. A row starts its session at once; Change opens that mode's setup.
export const quickRows = (rows, more = true) => `<section class="sec quickwrap"><header class="sec__h"><h2>Other sessions</h2>${more ? '<a class="link" href="session-setup.html">All modes</a>' : ''}</header>
  <ul class="quick">${rows.map(([mode, setup, start, change, choose]) => `<li class="quick__r"><b class="quick__m">${mode}</b><span class="quick__s" title="${esc(setup)}">${setup}</span>${start ? `<a class="btn btn--sm" href="${start}" aria-label="Start ${mode}">Start</a>${change ? `<a class="link" href="${change}" aria-label="Change the ${mode} setup">Change</a>` : '<span></span>'}` : `<a class="btn btn--sm" href="${change}" aria-label="${choose} for ${mode}">${choose}</a><span></span>`}</li>`).join('')}</ul>
</section>`;

const startSheet = ({ mode, setup, href, change, head, label = 'Start session' }) => `<section class="sheet start">
  <div class="start__copy">
    ${head}
    <p class="start__setup"><b>${mode}</b><span>${setup}</span></p>
    <div class="start__a"><a class="btn btn--primary" href="${href}" autofocus>${label}</a>${change ? `<a class="btn btn--quiet" href="${change}">Change setup</a>` : ''}</div>
  </div>
  <div class="start__ground" aria-hidden="true">${relief({ weak: [], seedValue: 31, density: 5 })}</div>
</section>`;

// What Home does when the last setup cannot start again (ADR-0007). The primary opens the setup of
// that mode, and Other sessions still hold a session that starts at once. The journal keeps a file's
// id and no title, so a deleted file or one on another computer cannot be named.
const LAST = [['repeat', 'Last setup can start'], ['paste', 'Last text was pasted'], ['deleted', 'File was deleted'], ['device', 'File on another computer'], ['device-empty', 'Another computer, empty library'], ['finished', 'Book finished'], ['finished-long', 'Book finished, very long title'], ['row', 'Another mode cannot repeat']];
const vh = variantsOf(LAST);
const CHOOSE_FILE = 'session-setup.html?variant=file-list';
const finishedHead = (title) => `<h1 class="clamp-2" title="${esc(title)}">You finished ${esc(title)}</h1>`;
const AWAY = 'Your file is on another computer';
const NO_REPEAT = {
  paste: { head: '<h1>Paste a new text</h1>', setup: 'A pasted text is not kept, so the last one cannot start again.', label: 'Paste a text', href: 'session-setup.html?variant=texts-paste' },
  deleted: { head: '<h1>Choose a new text</h1>', setup: 'The file from your last session was deleted.', label: 'Choose a text', href: CHOOSE_FILE },
  device: { head: `<h1>${AWAY}</h1>`, setup: 'Files stay on the computer they were added to.', label: 'Choose a text', href: CHOOSE_FILE },
  'device-empty': { head: `<h1>${AWAY}</h1>`, setup: 'Files stay on the computer they were added to, and this one has none yet.', label: 'Add a file', href: 'session-setup.html?variant=file-empty' },
  finished: { head: finishedHead('Walden'), setup: 'Choose what to read next, or read it again.', label: 'Choose a text', href: 'session-setup.html?variant=file-finished' },
  'finished-long': { head: finishedHead(LONG_TITLE), setup: 'Choose what to read next, or read it again.', label: 'Choose a text', href: 'session-setup.html?variant=file-finished' },
};
const WORDS_SHEET = startSheet({
  mode: 'Words',
  setup: '25 words from the 1,000 most common',
  href: 'plain-words.html',
  change: 'session-setup.html',
  head: '<h1><span data-show="full loading">Start where you left off</span><span data-show="empty">Your first session</span><span data-show="error">Start a session</span></h1>',
});
const ROW_WORDS = ['Words', '25 words from the 1,000 most common', 'plain-words.html', 'session-setup.html'];
const ROW_ZEN = ['Zen', 'No setup and no figures', 'typing-zen.html', ''];
const ROW_TEXTS_DEFAULT = ['Texts', 'A passage from a public-domain book', 'plain-text.html', 'session-setup.html?variant=texts-passage'];
const ROW_WALDEN = ['Texts', 'Walden, continues at 36%', 'plain-text.html', CHOOSE_FILE];
const ROW_NO_REPEAT = ['Texts', 'A pasted text is not kept', null, 'session-setup.html?variant=texts-paste', 'Paste'];

// Stage 1, now: no statistics and no adaptive mode. Only what the app really knows is on the screen.
// While the setup loads, or if it cannot be read, Home has the default setup, so nothing is in the way.
const homeNow = page({
  title: 'Keymind: home now',
  description: 'Home while there are no statistics yet: the last setup one action away, what it does when that setup cannot repeat, and the other modes.',
  data: true,
  variants: LAST,
  note: 'This is what the app can show today. The ground is not data: it has no keys and no hills.',
  body: shell('home', `${vh('repeat row', WORDS_SHEET)}
  ${Object.entries(NO_REPEAT).map(([id, sheet]) => vh(id, `<div data-show="full">${startSheet({ mode: 'Texts', ...sheet })}</div><div data-show="loading empty error">${WORDS_SHEET}</div>`)).join('\n  ')}
  <div data-show="error"><div class="state state--error"><p class="state__h">Your last setup could not be read</p><p>The default setup is in place. Your journal is safe, and nothing else changes.</p></div></div>
  ${region({
    full: `${vh('repeat', quickRows([ROW_WALDEN, ROW_ZEN]))}${vh('paste deleted device device-empty finished finished-long', quickRows([ROW_WORDS, ROW_ZEN]))}${vh('row', quickRows([ROW_NO_REPEAT, ROW_ZEN]))}`,
    rows: 3,
    empty: quickRows([ROW_TEXTS_DEFAULT, ROW_ZEN]),
    error: quickRows([ROW_TEXTS_DEFAULT, ROW_ZEN]),
  })}`, { nav: ['home', 'settings'], gam: false }),
});

// Stage 2 onward: Statistics joins the menu, and the sheet gains the map. The start stays first.
const STAGE2 = [['many', 'Ten sessions or more'], ['few', 'Fewer than ten sessions'], ['paste', 'Last setup cannot repeat']];
const v2 = variantsOf(STAGE2);
const flatMap = (caption) => `<div class="map map--flat">${relief({ weak: [], seedValue: 7 })}${keyboard({ targets: [], cls: 'kbd--map' })}<p class="map__note">${caption}</p></div>`;
const RECENT = [['Today, 12:04', 'Words', '00:27', 58, '97%', 'home-words'], ['Today, 11:58', 'Texts', '00:46', 52, '98%', 'home'], ['Yesterday, 18:40', 'Words', '01:00', 61, '96%', 'home-words'], ['Yesterday, 18:20', 'Zen', '04:12', 49, 'None', 'home-words']];
const recentTable = (rows) => `<table class="tbl tbl--rows"><thead><tr><th>When</th><th>Mode</th><th class="n">Time</th><th class="n">WPM</th><th class="n">Accuracy</th></tr></thead><tbody>${rows.map(([a, b, c, d, e, v]) => `<tr><td><a class="link" href="summary-saved.html?variant=${v}">${a}</a></td><td>${b}</td><td class="n">${c}</td><td class="n">${d}</td><td class="n">${e}</td></tr>`).join('')}</tbody></table>`;
const pin = (x, y, text) => `<span class="pin" style="left:calc(50% + ${(x - 7.5).toFixed(2)} * (var(--key) + var(--key-gap)));top:calc(50% + ${(y - 3.5).toFixed(2)} * (var(--key) + var(--key-gap)))">${text}</span>`;
const homeStats = page({
  title: 'Keymind: home with statistics',
  description: 'Home once statistics exist: the relief appears, recent sessions follow, and the start stays first.',
  data: true,
  variants: STAGE2,
  note: 'Empty is the state before the first session. There is no adaptive mode yet.',
  body: shell('home', `<section class="sheet next">
    <div class="next__h"><h1>${v2('many few', '<span data-show="full loading error">Start where you left off</span><span data-show="empty">Your first session</span>', true)}${v2('paste', '<span data-show="full">Paste a new text</span><span data-show="loading error">Start where you left off</span><span data-show="empty">Your first session</span>', true)}</h1><p class="start__setup start__setup--inline">${v2('many few', '<b>Words</b><span>25 words from the 1,000 most common</span>', true)}${v2('paste', '<b data-show="full">Texts</b><span data-show="full">A pasted text is not kept, so the last one cannot start again.</span><b data-show="loading empty error">Words</b><span data-show="loading empty error">25 words from the 1,000 most common</span>', true)}</p></div>
    ${region({
      full: `${v2('many paste', `<div class="map">${relief({ seedValue: 7 })}${keyboard({ targets: ['KeyE', 'KeyS'], cls: 'kbd--map' })}${pin(3.5, 1.5, '<b>E</b> 212 ms')}${pin(2.25, 2.5, '<b>S</b> 188 ms')}</div>`)}
        ${v2('few', `<div class="map">${relief({ weak: [['KeyE', 0.5], ['KeyP', 0.35]], seedValue: 7 })}${keyboard({ targets: [], cls: 'kbd--map' })}<p class="map__note">Drawn from 3 sessions, so it will shift as you type more.</p></div>`)}`,
      loading: '<div class="sk"><i style="--w:100%;height:190px"></i></div>',
      empty: flatMap('The ground is flat for now. Your first session raises the first hills.'),
      error: ['The statistics could not be read', 'Your journal is safe. Rebuild the statistics from it and the map comes back.', '<button class="btn" type="button">Rebuild from the journal</button>'],
    })}
    <div class="next__a"><div class="start__a">${v2('many few', '<a class="btn btn--primary" href="plain-words.html" autofocus>Start session</a><a class="btn btn--quiet" href="session-setup.html">Change setup</a>', true)}${v2('paste', '<span data-show="full"><a class="btn btn--primary" href="session-setup.html?variant=texts-paste" autofocus>Paste a text</a></span><span data-show="loading empty error"><span class="start__a"><a class="btn btn--primary" href="plain-words.html" autofocus>Start session</a><a class="btn btn--quiet" href="session-setup.html">Change setup</a></span></span>', true)}</div><a class="link" href="statistics.html">Open statistics</a></div>
  </section>
  <div class="twocol">
    ${v2('many few', quickRows([ROW_WALDEN, ROW_ZEN]))}${v2('paste', quickRows([ROW_WORDS, ROW_ZEN]))}
    ${sec('Recent sessions', region({
      full: `${v2('many paste', recentTable(RECENT))}${v2('few', recentTable(RECENT.slice(0, 3)))}`,
      rows: 4,
      empty: ['No sessions yet', 'Your first session shows up here.', ''],
      error: ['Sessions could not be loaded', 'Your journal is safe. Rebuild the statistics from it.', ''],
    }))}
  </div>`, { nav: ['home', 'stats', 'settings'], gam: false }),
});

// ---- Session setup: one screen, one rail of modes, one Start button that never scrolls away.
const NOW = [['words', 'Words'], ['texts', 'Texts'], ['zen', 'Zen']];
const FUTURE = [['adaptive', 'Adaptive'], ['words', 'Words'], ['texts', 'Texts'], ['zen', 'Zen'], ['symbols', 'Symbols'], ['code', 'Code'], ['ghost', 'Ghost'], ['music', 'Music'], ['video', 'Video']];
const firstOf = { words: 'words-count', texts: 'texts-passage', zen: 'zen' };
const rail = (now, list = NOW) => `<nav class="rail" aria-label="Modes">${list.map(([id, label]) => `<a class="rail__i" href="?variant=${firstOf[id] ?? 'future'}" data-go="${firstOf[id] ?? 'future'}"${id === now ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
const segGo = (label, opts) => `<span class="seg" role="group" aria-label="${label}">${opts.map(([text, go, on]) => `<button type="button" ${go ? `data-go="${go}"` : 'data-pick'} aria-pressed="${Boolean(on)}">${text}</button>`).join('')}</span>`;
const row = (title, text, control) => `<div class="setting"><div><p class="setting__t">${title}</p>${text ? `<p class="setting__d">${text}</p>` : ''}</div><div class="setting__c">${control}</div></div>`;
const foot = ({ sum, label = 'Start session', href = 'plain-words.html', off = false, why = '' }) => `<div class="setup__foot">
    <p class="setup__sum"${why ? ' role="status"' : ''} title="${esc(sum)}">${why || sum}</p>
    ${off ? `<button type="button" class="btn btn--primary" disabled>${label}</button>` : `<a class="btn btn--primary" href="${href}">${label}</a>`}
  </div>`;
const panel = (title, text, inner, footer) => `<section class="setup__p"><header class="setup__h"><h2>${title}</h2><p>${text}</p></header><div class="setup__b">${inner}</div>${footer}</section>`;
const shellSetup = (now, panelHtml, list) => `<div class="setup">${rail(now, list)}${panelHtml}</div>`;

const LENGTH_COUNT = row('Length', '', `${segGo('Length by', [['By count', '', true], ['By time', 'words-time']])}${segGo('Number of words', [['10'], ['25', '', true], ['50'], ['100']])}`);
const LENGTH_TIME = row('Length', 'The clock starts with your first key.', `${segGo('Length by', [['By count', 'words-count'], ['By time', '', true]])}${segGo('Time limit', [['15 s'], ['30 s'], ['60 s', '', true], ['120 s']])}`);
const POOL = row('Word set', 'Draws from the most common English words.', segGo('Word pool', [['200'], ['1,000', '', true], ['5,000']]));
const sources = (now) => row('Text', '', segGo('Text source', [['Passages', now === 'p' ? '' : 'texts-passage', now === 'p'], ['Paste', now === 't' ? '' : 'texts-paste', now === 't'], ['File', now === 'f' ? '' : 'file-list', now === 'f']]));
const TEXTS_DESC = 'Books, your own words or your own files.';

const libAdd = (note = '') => `<div class="lib__add"><button type="button" class="btn" data-go="file-importing">Add a file</button><p class="field__help">${note || 'TXT or EPUB, up to 128 MB. It stays on this computer.'}</p></div>`;
const libRow = ({ id, title, chars, read, on = false, finished = false, note = '', actions = true, go = 'file-delete' }) => `<li class="lib__r${finished ? ' is-finished' : ''}">
    <label class="lib__pick"><input type="radio" name="lib-${id}"${on ? ' checked' : ''}><span class="lib__t" title="${esc(title)}">${esc(title)}</span></label>
    <span class="lib__c">${chars} characters</span>
    <span class="lib__read">${finished ? '<span class="tag tag--strong">Finished</span>' : `<b>${read}%</b> read`}</span>
    ${actions ? `<button type="button" class="btn btn--quiet btn--sm" data-go="${go}" aria-label="Delete ${esc(title)}">Delete</button>` : ''}
    ${note ? `<p class="lib__note">${note}</p>` : ''}
  </li>`;
const SAMPLE = [{ title: 'Walden', chars: '612,000', read: 36 }, { title: 'The Odyssey, translated by Samuel Butler', chars: '640,000', read: 8 }, { title: 'Notes from the garden.txt', chars: '4,200', read: 72 }];
const libList = (variant, extra = '') => `<ul class="lib">${extra}${SAMPLE.map((item, i) => libRow({ ...item, id: variant, on: i === 0 })).join('')}</ul>`;
const failRow = (name, head, text) => `<li class="lib__r is-error">
    <span class="lib__t lib__t--wide" title="${esc(name)}">${esc(name)}</span>
    <div class="state state--error lib__fail"><p class="state__h">${head}</p><p>${text}</p></div>
    <button type="button" class="btn btn--quiet btn--sm" data-go="file-list">Dismiss</button>
  </li>`;
const importRow = (name) => `<li class="lib__r is-importing">
    <span class="lib__t lib__t--wide" title="${esc(name)}">${esc(name)}</span>
    <div class="lib__busy"><div class="busy" role="progressbar" aria-label="Importing ${esc(name)}"><i></i></div><p class="field__help" role="status">Reading the file. A long book takes a moment, and you can start a session meanwhile.</p></div>
  </li>`;
const WALDEN_FOOT = foot({ sum: 'Walden, continues at 36%', href: 'plain-text.html' });
const filePanel = (inner, footer = WALDEN_FOOT) => panel('Texts', TEXTS_DESC, `${sources('f')}<div class="lib__wrap">${inner}</div>`, footer);
const NO_FILE = foot({ sum: '', off: true, why: 'Add a file to start.' });
const PASTE_HELP = 'It stays on this computer. Characters with no key on the layout are left out.';
const pasteBody = (value, attrs, help) => `${sources('t')}<div class="field paste"><label for="${attrs.id}">Your text</label><textarea id="${attrs.id}" class="input paste__area" rows="5" spellcheck="false"${attrs.invalid ? ` aria-invalid="true" aria-describedby="${attrs.id}-e"` : ''} placeholder="Paste or type a text here">${esc(value)}</textarea>${help}</div>`;
const PASTED = 'A short note written for this mockup, with a few plain sentences to type. It could be a letter, a page of notes or anything else worth practising on.';

const SETUP = [
  ['words-count', 'Words, by count'], ['words-time', 'Words, by time'], ['texts-passage', 'Texts, passages'], ['texts-paste', 'Paste, empty'], ['paste-filled', 'Paste, with text'], ['paste-partial', 'Paste, some characters left out'], ['paste-none', 'Paste, nothing to type'],
  ['file-list', 'Library'], ['file-empty', 'Library, empty'], ['file-loading', 'Library, loading'], ['file-error', 'Library, could not be read'], ['file-importing', 'File importing'], ['file-imported', 'File imported, characters left out'], ['file-unreadable', 'File not readable'], ['file-drm', 'File protected by DRM'], ['file-notext', 'File with nothing to type'], ['file-finished', 'Book finished'], ['file-long', 'Very long title'], ['file-delete', 'Confirm delete'], ['zen', 'Zen'], ['start-error', 'Start failed'], ['future', 'Later: all modes on the rail'],
];
const vs = variantsOf(SETUP);
const views = {
  'words-count': shellSetup('words', panel('Words', 'Common English words in random order.', `${LENGTH_COUNT}${POOL}`, foot({ sum: '25 words from the 1,000 most common' }))),
  'words-time': shellSetup('words', panel('Words', 'Common English words in random order.', `${LENGTH_TIME}${POOL}`, foot({ sum: '60 seconds, words from the 1,000 most common', href: 'plain-time.html' }))),
  'texts-passage': shellSetup('texts', panel('Texts', TEXTS_DESC, `${sources('p')}${row('Difficulty', 'Passages from public-domain books.', segGo('Difficulty', [['Any', '', true], ['Easy'], ['Medium'], ['Hard']]))}`, foot({ sum: 'A passage of any difficulty', href: 'plain-text.html' }))),
  'texts-paste': shellSetup('texts', panel('Texts', TEXTS_DESC, pasteBody('', { id: 'pa-1' }, `<p class="field__help">${PASTE_HELP}</p>`), foot({ sum: '', off: true, why: 'Paste a text to start.' }))),
  'paste-filled': shellSetup('texts', panel('Texts', TEXTS_DESC, pasteBody(PASTED, { id: 'pa-2' }, `<p class="field__help">${PASTE_HELP}</p>`), foot({ sum: 'Your text, 151 characters', href: 'plain-text.html' }))),
  'paste-partial': shellSetup('texts', panel('Texts', TEXTS_DESC, pasteBody(`${PASTED} Жили-были ✓`, { id: 'pa-3' }, '<p class="field__help">12 characters have no key on the English layout and will be left out.</p>'), foot({ sum: 'Your text, 151 characters', href: 'plain-text.html' }))),
  'paste-none': shellSetup('texts', panel('Texts', TEXTS_DESC, pasteBody('Жили-были дед да баба ✓ ✓ ✓', { id: 'pa-4', invalid: true }, '<p class="field__error" id="pa-4-e">Nothing here can be typed on the English layout, the only one available for now.</p>'), foot({ sum: '', off: true, why: 'Add English text to start.' }))),
  'file-list': shellSetup('texts', filePanel(`${libList('a')}${libAdd()}`)),
  'file-empty': shellSetup('texts', filePanel(`<div class="state"><p class="state__h">No files yet</p><p>Add a TXT or EPUB file. A session continues where the last one stopped.</p></div>${libAdd()}`, NO_FILE)),
  'file-loading': shellSetup('texts', filePanel('<div aria-busy="true"><span class="visually-hidden">Loading</span><div class="sk"><i style="--w:92%"></i><i style="--w:74%"></i><i style="--w:84%"></i></div></div>', foot({ sum: '', off: true, why: 'Reading your library.' }))),
  'file-error': shellSetup('texts', filePanel('<div class="state state--error"><p class="state__h">Your library could not be read</p><p>Your files are still in the data folder. Passages and pasted text work as usual.</p><div class="state__a"><button class="btn" type="button" data-go="file-list">Try again</button></div></div>', foot({ sum: '', off: true, why: 'Choose a file to start.' }))),
  'file-importing': shellSetup('texts', filePanel(`${libList('b', importRow('The Count of Monte Cristo.epub'))}${libAdd('Another file can wait for this one, or go first.')}`)),
  'file-imported': shellSetup('texts', filePanel(`<ul class="lib">${libRow({ id: 'c', title: 'The Count of Monte Cristo', chars: '2,640,000', read: 0, on: true, note: 'Imported. 312 characters have no key on this layout and were left out.' })}${SAMPLE.map((item) => libRow({ ...item, id: 'c' })).join('')}</ul>${libAdd()}`, foot({ sum: 'The Count of Monte Cristo, from the beginning', href: 'plain-text.html' }))),
  'file-unreadable': shellSetup('texts', filePanel(`${libList('d', failRow('The Odyssey, damaged copy.epub', 'This file could not be read', 'Nothing was added, and your library is unchanged. If it opens elsewhere, try saving it as TXT.'))}${libAdd()}`)),
  'file-drm': shellSetup('texts', filePanel(`${libList('e', failRow('Bought in a store.epub', 'This book is protected by DRM', 'Its text cannot be read, so nothing was added. A DRM-free or TXT copy will work.'))}${libAdd()}`)),
  'file-notext': shellSetup('texts', filePanel(`${libList('f', failRow('Война и мир.epub', 'Nothing here can be typed yet', 'The text has no characters on the English layout, the only one available for now. Nothing was added.'))}${libAdd()}`)),
  'file-finished': shellSetup('texts', filePanel(`<ul class="lib">${libRow({ id: 'g', title: 'Walden', chars: '612,000', finished: true, on: true })}${SAMPLE.slice(1).map((item) => libRow({ ...item, id: 'g' })).join('')}</ul>${libAdd()}`, foot({ sum: 'You reached the end of Walden. It starts again from the beginning.', label: 'Start again', href: 'plain-text.html' }))),
  'file-long': shellSetup('texts', filePanel(`<ul class="lib">${libRow({ id: 'h', title: LONG_TITLE, chars: '1,180,000', read: 3, on: true })}${SAMPLE.map((item) => libRow({ ...item, id: 'h' })).join('')}</ul>${libAdd()}`, foot({ sum: `${LONG_TITLE}, continues at 3%`, href: 'plain-text.html?variant=long' }))),
  'file-delete': shellSetup('texts', filePanel(`<ul class="lib"><li class="lib__r is-confirm">
      <span class="lib__t lib__t--wide" title="Walden">Walden</span>
      <div class="lib__ask" role="group" aria-label="Confirm delete"><p>Delete this file and its reading position? Your typing history stays in the journal.</p><div class="row"><button type="button" class="btn btn--sm" data-go="file-list">Delete</button><button type="button" class="btn btn--quiet btn--sm" data-go="file-list">Keep</button></div></div>
    </li>${SAMPLE.slice(1).map((item) => libRow({ ...item, id: 'i' })).join('')}</ul>${libAdd()}`)),
  zen: shellSetup('zen', panel('Zen', 'Type anything. There is no text to follow, and no figures on the screen.', '<p class="setup__none">Zen has nothing to set up. Backspace always works here.</p>', foot({ sum: 'Free typing, for as long as you like', href: 'typing-zen.html' }))),
  'start-error': shellSetup('texts', panel('Texts', TEXTS_DESC, `${sources('p')}${row('Difficulty', 'Passages from public-domain books.', segGo('Difficulty', [['Any'], ['Easy'], ['Medium'], ['Hard', '', true]]))}<p class="field__error" role="alert">The passage could not be prepared. Nothing was started. Try again or pick another mode.</p>`, foot({ sum: 'A hard passage', label: 'Try again', href: 'plain-text.html' }))),
  future: shellSetup('adaptive', panel('Adaptive', 'Sessions built from your weak transitions. The brain picks everything, so there is nothing to set up.', '<p class="setup__none">The next session works on <b class="gram">ea</b> and <b class="gram">ss</b>. Home starts it with one action, and this screen is only a second way in.</p>', foot({ sum: 'A session of about ten minutes', href: 'typing-words.html' })), FUTURE),
};
const sessionSetup = page({
  title: 'Keymind: session setup',
  description: 'Choose a mode and its options. Every mode remembers its own setup, and Home starts the last one directly.',
  variants: SETUP,
  note: 'Controls that change the panel work. The rail holds nine modes without scrolling at 720 x 480.',
  body: shell('home', `<div class="page-head page-head--setup"><h1>Set up a session</h1><a class="link" href="home-now.html">Back to home</a></div>
${Object.entries(views).map(([id, html]) => vs(id, html)).join('\n')}`, { nav: ['home', 'settings'], gam: false }),
});

// ---- Typing without a keyboard: the main screen until the keyboard arrives.
const PLAIN_WORDS = [['count', 'By count'], ['short', 'Short text: ten words']];
const vw = variantsOf(PLAIN_WORDS);
const plainWords = page({
  title: 'Typing: words without a keyboard',
  description: 'The main typing screen: figures and text in one column, four lines, messages in a reserved slot.',
  typing: true,
  plain: true,
  variants: PLAIN_WORDS,
  reloadVariants: true,
  note: 'The Keyboard control shows how the same screen takes the keyboard back at stage 12.',
  body: typingScreen({
    title: 'Words session',
    left: `<span class="bar__mode">Words</span><span class="bar__detail">${vw('count', '25 words, top 1,000', true)}${vw('short', '10 words, top 200', true)}</span>`,
    stage: `${vw('count', typedStage({ stream: textStream(WORDS, { cursor: 26, errs: { 16: 'p' }, fixed: [9], targets: null }), run: runBar(0.2, 'Progress through the words') }))}${vw('short', typedStage({ stream: textStream('state with little people around their work place about small', { cursor: 12, targets: null }), run: runBar(0.2, 'Progress through the words') }))}`,
    targets: [],
    next: null,
    time: '00:05',
    end: 'summary-plain.html?variant=early-count',
  }),
});

const plainTime = page({
  title: 'Typing: words by time',
  description: 'A timed session: the clock counts down, says left, and the line above the text shortens.',
  typing: true,
  plain: true,
  note: 'The clock runs from your first key in this demo. The last ten seconds get a soft block, and the end opens the summary.',
  body: typingScreen({
    title: 'Timed words session',
    left: '<span class="bar__mode">Words</span><span class="bar__detail">60 seconds, top 1,000</span>',
    stage: typedStage({ stream: textStream(WORDS, { cursor: 0, targets: null }), run: runBar(1, 'Time left', 'run--limit'), notice: 'The clock starts with your first key.', level: 'ready' }),
    targets: [],
    next: null,
    time: '01:00',
    limit: 60,
    wpm: '—',
    acc: '—',
    end: 'summary-plain.html?variant=early-time',
  }),
});

const PLAIN_TEXT = [['walden', 'Public-domain passage'], ['long', 'Very long title']];
const vt = variantsOf(PLAIN_TEXT);
const plainText = page({
  title: 'Typing: text without a keyboard',
  description: 'A text session on the main typing screen, with its source under the text.',
  typing: true,
  plain: true,
  variants: PLAIN_TEXT,
  reloadVariants: true,
  body: typingScreen({
    title: 'Text session',
    left: `<span class="bar__mode">Text</span><span class="bar__detail" title="${esc(SHORT_LONG)}">${vt('walden', 'Walden, passage 12 of 240', true)}${vt('long', esc(LONG_TITLE), true)}</span>`,
    stage: typedStage({ stream: textStream(WALDEN, { cursor: 41, errs: { 33: 'k' }, targets: null }), run: runBar(0.19, 'Progress through the text'), source: `${vt('walden', 'Henry David Thoreau, Walden, 1854. Public domain.', true)}${vt('long', 'Your file. It stays on this computer.', true)}` }),
    targets: [],
    next: null,
    time: '00:09',
    wpm: 54,
    acc: '98%',
    end: 'summary-plain.html?variant=early-count',
  }),
});

// ---- Zen: no sample text, no figures, its own caret. The newest line stays put and older lines rise.
const ZEN = [['writing', 'While writing'], ['fresh', 'Before the first key']];
const vz = variantsOf(ZEN);
const zen = page({
  title: 'Typing: Zen',
  description: 'Free typing with no sample text and no figures. Text grows at the bottom and older lines rise and fade.',
  typing: true,
  plain: true,
  figures: false,
  variants: ZEN,
  reloadVariants: true,
  note: 'Type here. Enter starts a new line and Backspace works. The caret blinks only after a pause.',
  body: typingScreen({
    title: 'Zen session',
    appCls: 'app--zen',
    left: '<span class="bar__mode">Zen</span>',
    stats: false,
    restart: false,
    end: 'summary-plain.html?variant=zen',
    stage: `<div class="window window--zen" data-zen><div class="stream">${vz('writing', `<span class="zen__text">${esc(ZEN_TEXT)}</span><span class="zen__caret" aria-hidden="true">&#8288;</span>`, true)}${vz('fresh', '<span class="zen__text"></span><span class="zen__caret is-idle" aria-hidden="true">&#8288;</span><span class="zen__hint">Type anything. Nothing here is scored.</span>', true)}</div></div>
    <div class="slot"><p class="notice" role="status" data-level=""></p></div>`,
    targets: [],
    next: null,
  }),
});

// ---- Messages while typing: one slot under the text, one message at a time.
const MESSAGES = [['none', 'No message: source in the slot'], ['layout', 'Wrong keyboard layout'], ['caps', 'Caps Lock'], ['disk', 'Saving delayed'], ['backspace', 'Backspace blocked'], ['stop', 'Stop on error'], ['pause-esc', 'Paused with Esc'], ['pause-focus', 'Paused, window lost focus']];
const vm = variantsOf(MESSAGES);
const messages = page({
  title: 'Typing: messages',
  description: 'Every message that can appear while typing, in one reserved slot that never moves the text.',
  typing: true,
  plain: true,
  variants: MESSAGES,
  reloadVariants: true,
  note: 'Try it: Caps Lock and a non-English layout react for real. Backspace blocked and Stop on error change the rules of this demo.',
  body: typingScreen({
    title: 'Text session',
    left: `<span class="bar__mode">Text</span><span class="bar__detail">Walden, passage 12 of 240</span>${vm('backspace', '<span class="tag">Backspace off</span>', true)}${vm('stop', '<span class="tag">Stops on errors</span>', true)}`,
    stage: `${runBar(0.19, 'Progress through the text')}<div class="window"><div class="stream">${textStream(WALDEN, { cursor: 41, errs: {}, targets: null })}</div></div>
    <div class="slot"><p class="notice" role="status" data-level=""></p><p class="source">Henry David Thoreau, Walden, 1854. Public domain.</p></div>`,
    targets: [],
    next: null,
    time: '00:09',
    wpm: 54,
    acc: '98%',
    end: 'summary-plain.html?variant=early-count',
  }),
});

// ---- Plain summaries: only what a Words, Texts or Zen session really has.
const fig = (value, label, lead = false) => `<div class="figure${lead ? ' figure--lead' : ''}"><b>${value}</b><span>${label}</span></div>`;
const RHYTHM_NOTE = 'Rhythm evenness is how steady the gaps between your keys were. Higher is steadier.';
const result = ({ lead, rest, note = RHYTHM_NOTE }) => `<div class="result"><div class="result__lead">${lead.map(([value, label]) => fig(value, label, true)).join('')}</div><div class="result__rest">${rest.map(([value, label]) => fig(value, label)).join('')}</div>${note ? `<p class="result__note">${note}</p>` : ''}</div>`;
const SUMMARY = [['words', 'Words, by count'], ['time', 'Words, by time'], ['text', 'Text, passage'], ['file', 'Text, from a file'], ['zen', 'Zen'], ['early-count', 'Ended early, by count'], ['early-time', 'Ended early, by time'], ['early-file', 'Ended early, from a file'], ['short', 'Ended very early']];
const vr = variantsOf(SUMMARY);
const summaryBody = {
  words: { h: 'Session complete', sub: 'Words, 25 words from the 1,000 most common', fig: { lead: [['58', 'WPM'], ['97.2%', 'Accuracy']], rest: [['291', 'CPM'], ['84%', 'Rhythm evenness'], ['00:27', 'Time']] }, next: 'plain-words.html', nextLabel: 'Next session' },
  time: { h: 'Session complete', sub: 'Words, 60 seconds from the 1,000 most common', fig: { lead: [['61', 'WPM'], ['96.4%', 'Accuracy']], rest: [['305', 'CPM'], ['81%', 'Rhythm evenness'], ['01:00', 'Time']] }, next: 'plain-time.html', nextLabel: 'Next session' },
  text: { h: 'Session complete', sub: 'A passage from Walden, by Henry David Thoreau', fig: { lead: [['52', 'WPM'], ['98.1%', 'Accuracy']], rest: [['262', 'CPM'], ['87%', 'Rhythm evenness'], ['00:46', 'Time']] }, next: 'plain-text.html', nextLabel: 'Next session' },
  file: { h: 'Session complete', sub: 'Walden, your file', fig: { lead: [['52', 'WPM'], ['98.1%', 'Accuracy']], rest: [['262', 'CPM'], ['87%', 'Rhythm evenness'], ['04:02', 'Time']] }, extra: meter({ label: 'Read so far', value: 38, max: 100, text: '38%, up from 36%' }), next: 'plain-text.html', nextLabel: 'Continue reading' },
  zen: { h: 'Session complete', sub: 'Zen, free typing', fig: { lead: [['49', 'WPM'], ['04:12', 'Time']], rest: [['246', 'CPM'], ['79%', 'Rhythm evenness']], note: `${RHYTHM_NOTE} Zen has no text to compare with, so it has no accuracy.` }, next: 'typing-zen.html', nextLabel: 'Next session' },
  'early-count': { h: 'Session ended early', sub: 'Words, stopped at 14 of 25 words', fig: { lead: [['54', 'WPM'], ['95.8%', 'Accuracy']], rest: [['272', 'CPM'], ['76%', 'Rhythm evenness'], ['00:16', 'Time']], note: `These figures cover what you typed. ${RHYTHM_NOTE}` }, next: 'plain-words.html', nextLabel: 'Next session' },
  'early-time': { h: 'Session ended early', sub: 'Words, stopped at 00:18 of 01:00', fig: { lead: [['57', 'WPM'], ['96.9%', 'Accuracy']], rest: [['286', 'CPM'], ['80%', 'Rhythm evenness'], ['00:18', 'Time']], note: `These figures cover what you typed. ${RHYTHM_NOTE}` }, next: 'plain-time.html', nextLabel: 'Next session' },
  'early-file': { h: 'Session ended early', sub: 'Walden, your file', fig: { lead: [['50', 'WPM'], ['97.5%', 'Accuracy']], rest: [['252', 'CPM'], ['83%', 'Rhythm evenness'], ['01:31', 'Time']], note: `These figures cover what you typed. ${RHYTHM_NOTE}` }, extra: meter({ label: 'Read so far', value: 37, max: 100, text: '37%, up from 36%' }), next: 'plain-text.html', nextLabel: 'Continue reading' },
  short: { h: 'Session ended early', sub: 'Words, stopped at 1 of 25 words', fig: { lead: [['—', 'WPM'], ['100%', 'Accuracy']], rest: [['—', 'CPM'], ['—', 'Rhythm evenness'], ['00:01', 'Time']], note: 'A dash means too few presses to measure.' }, next: 'plain-words.html', nextLabel: 'Next session' },
};
const summaryPlain = page({
  title: 'Keymind: session summary',
  description: 'Summaries of Words, Texts and Zen sessions, with only the figures those sessions have, and sessions ended early.',
  data: true,
  variants: SUMMARY,
  note: 'The adaptive summary with transitions and XP is a separate mockup.',
  body: shell('home', `${Object.entries(summaryBody).map(([id, s]) => vr(id, `<div class="page-head page-head--stack"><h1>${s.h}</h1><p>${s.sub}</p></div>
    ${region({
      full: `${result(s.fig)}${s.extra ? `<div class="result__extra">${s.extra}</div>` : ''}`,
      rows: 3,
      empty: ['Nothing was typed', 'No session was recorded, so there is nothing to show. The app goes straight home in this case.', ''],
      error: ['The summary could not be read', 'Your typing is safe in the journal. Later sessions are not affected.', ''],
    })}
    <div class="row"><a class="btn btn--primary" href="${s.next}">${s.nextLabel}</a><a class="btn" href="session-setup.html">Change setup</a><a class="btn btn--quiet" href="home-now.html">Back to home</a></div>`)).join('\n')}`, { nav: ['home', 'settings'], gam: false }),
});

// ---- Saved summaries: the numbers from the sessions table, with no journal read (ADR-0009). The text,
// the cursor and the book title are not in that row, so there is no reading progress, and a passage is
// named in general words. The only way on is back to where it was opened from.
const SAVED = [['words', 'From Statistics'], ['closed', 'The app closed during it'], ['file', 'Text from a file'], ['home', 'From Home, a passage'], ['home-words', 'From Home, words']];
const vsv = variantsOf(SAVED);
const CLOSED_NOTE = 'The app closed before this session ended. These figures cover what you typed.';
const savedBody = {
  words: { from: 'stats', h: 'Session complete', sub: 'Words, 50 words from the 1,000 most common. Today, 01:11.', fig: { lead: [['67', 'WPM'], ['97.2%', 'Accuracy']], rest: [['334', 'CPM'], ['84%', 'Rhythm evenness'], ['00:45', 'Time']] } },
  closed: { from: 'stats', h: 'Session ended early', sub: 'Words, 60 seconds from the 1,000 most common. Nov 2, 20:15.', fig: { lead: [['47', 'WPM'], ['94.0%', 'Accuracy']], rest: [['236', 'CPM'], ['71%', 'Rhythm evenness'], ['00:38', 'Time']], note: `${CLOSED_NOTE} ${RHYTHM_NOTE}` } },
  file: { from: 'stats', h: 'Session complete', sub: 'Walden, your file. Yesterday, 21:30.', fig: { lead: [['52', 'WPM'], ['99.1%', 'Accuracy']], rest: [['262', 'CPM'], ['87%', 'Rhythm evenness'], ['04:02', 'Time']] } },
  home: { from: 'home', h: 'Session complete', sub: 'A passage from a public-domain book. Today, 11:58.', fig: { lead: [['52', 'WPM'], ['98.1%', 'Accuracy']], rest: [['262', 'CPM'], ['87%', 'Rhythm evenness'], ['00:46', 'Time']] } },
  'home-words': { from: 'home', h: 'Session complete', sub: 'Words, 25 words from the 1,000 most common. Today, 12:04.', fig: { lead: [['58', 'WPM'], ['97.2%', 'Accuracy']], rest: [['291', 'CPM'], ['84%', 'Rhythm evenness'], ['00:27', 'Time']] } },
};
// The heading waits for the row, so a loading or unreadable session is only "Session".
const summarySaved = page({
  title: 'Keymind: saved session summary',
  description: 'A past session opened from Recent sessions or a record: the saved figures, what the session was, when, and the way back.',
  data: true,
  variants: SAVED,
  note: 'Empty cannot happen here: a row that is missing reads as could not be read.',
  body: Object.entries(savedBody).map(([id, s]) => vsv(id, shell(s.from, `<div class="page-head page-head--stack"><h1><span data-show="full">${s.h}</span><span data-show="loading empty error">Session</span></h1><p data-show="full">${s.sub}</p></div>
    ${region({
      full: result(s.fig),
      rows: 3,
      empty: ['This session could not be read', 'Your journal is safe. Rebuild the statistics from it.', '<button class="btn" type="button">Rebuild from the journal</button>'],
      error: ['This session could not be read', 'Your journal is safe. Rebuild the statistics from it.', '<button class="btn" type="button">Rebuild from the journal</button>'],
    })}
    <div class="row"><a class="btn btn--primary" href="${s.from === 'stats' ? 'statistics.html' : 'home-stats.html'}" autofocus>${s.from === 'stats' ? 'Back to statistics' : 'Back to home'}</a></div>`, { nav: ['home', 'stats', 'settings'], gam: false }))).join('\n'),
});

export const sessionPages = {
  'home-now': homeNow,
  'home-stats': homeStats,
  'session-setup': sessionSetup,
  'plain-words': plainWords,
  'plain-time': plainTime,
  'plain-text': plainText,
  'typing-zen': zen,
  'typing-messages': messages,
  'summary-plain': summaryPlain,
  'summary-saved': summarySaved,
};
