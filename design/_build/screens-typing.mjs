// Onboarding and every typing-screen variant.
import { ROWS, codeStream, fingerOf, hand, keyboard, LEFT, page, region, relief, RIGHT, textStream, typedStage, typingScreen, variantsOf } from './lib.mjs';

export function codeOf(ch) {
  for (const row of ROWS) for (const k of row) if (k.base === ch || k.shift === ch) return k.code;
  return 'Space';
}
const fingerFor = (ch) => fingerOf[codeOf(ch)];
const steps = (now) => `<ol class="steps" aria-label="Setup steps">${['Layout', 'Starting test', 'Your relief'].map((s, i) => `<li${i === now ? ' aria-current="step"' : ''}>${s}</li>`).join('')}</ol>`;
const obTop = (now) => `<header class="top"><span class="wordmark">Keymind</span>${steps(now)}</header>`;
const mapPin = (x, y, text) => `<span class="pin" style="left:calc(50% + ${(x - 7.5).toFixed(2)} * (var(--key) + var(--key-gap)));top:calc(50% + ${(y - 3.5).toFixed(2)} * (var(--key) + var(--key-gap)))">${text}</span>`;
export { mapPin };

// ---- First launch: the one step the app has until stage 3. It has one choice and one button.
// Each picture carries its own data-theme, so it stays true whatever the page is showing.
const THEME_STEP = [['choose', 'Choosing'], ['save-error', 'Choice could not be saved']];
const vth = variantsOf(THEME_STEP);
const themeLine = '<i class="c done">the qu</i><i class="c cur">i</i><i class="c">et path up</i>';
const themePic = (t) => `<i class="themepic" data-theme="${t}" aria-hidden="true"><i class="themepic__t">${themeLine}</i></i>`;
const themeSplit = `<i class="themepic themepic--split" aria-hidden="true"><i data-theme="light"><i class="themepic__t">${themeLine}</i></i><i data-theme="dark"><i class="themepic__t">${themeLine}</i></i></i>`;
const themeCard = (value, name, text, pic) => `<label><input type="radio" name="theme" value="${value}" data-theme-choice${value === 'system' ? ' checked' : ''}>${pic}<b>${name}</b><span>${text}</span></label>`;
const onboardingTheme = page({
  title: 'Keymind setup: theme',
  description: 'First launch: choose how Keymind looks. The choice applies at once, and System is already selected.',
  variants: THEME_STEP,
  note: 'The whole page repaints when a choice changes, as it does in the app. Continue goes to the first Home.',
  body: `<div class="ob"><header class="top"><span class="wordmark">Keymind</span></header>
<main class="ob__body ob__body--narrow">
  <form class="ob__form" action="home-now.html" method="get">
    <input type="hidden" name="data" value="empty">
    <div class="stack">
      <h1>How should Keymind look?</h1>
      <p class="muted">You can change this at any time in Settings.</p>
    </div>
    <fieldset class="pick pick--theme">
      <legend class="visually-hidden">Theme</legend>
      ${themeCard('light', 'Light', 'Dark text on a light page', themePic('light'))}
      ${themeCard('dark', 'Dark', 'Light text on a dark page', themePic('dark'))}
      ${themeCard('system', 'System', 'Like Windows, now <span data-scheme-now>light</span>', themeSplit)}
    </fieldset>
    ${vth('save-error', '<div class="state state--error" role="status"><p class="state__h">Your choice could not be saved</p><p>Keymind keeps it for now and asks again at the next launch.</p></div>')}
    <div class="ob__foot"><button type="submit" class="btn btn--primary">Continue</button></div>
  </form>
</main></div>`,
});

const onboardingLayout = page({
  title: 'Keymind setup: layout',
  description: 'First run: choose the keyboard layout.',
  body: `<div class="ob">${obTop(0)}
<main class="ob__body">
  <div class="stack">
    <h1>Which layout do you type on?</h1>
    <p class="muted">Keymind stores the physical key with every press, so adding a layout later keeps your statistics.</p>
  </div>
  <fieldset class="pick" style="border:0;padding:0;margin:0">
    <legend class="visually-hidden">Keyboard layout</legend>
    <label><input type="radio" name="layout" checked><b>English, QWERTY</b><span>Available now</span></label>
    <label><input type="radio" name="layout" disabled><b>Russian</b><span>Planned</span></label>
    <label><input type="radio" name="layout" disabled><b>Ukrainian</b><span>Planned</span></label>
  </fieldset>
  <div class="ob__kbd">
    ${hand('l', LEFT, null, 'Each tint is one finger')}
    ${keyboard({ targets: [], cls: 'kbd--zones', next: null })}
    ${hand('r', RIGHT, null, 'F and J have a ridge')}
  </div>
  <div class="ob__foot">
    <span class="muted" style="font-size:var(--text-sm)">You can change this in Settings.</span>
    <a class="btn btn--primary" href="onboarding-test.html">Continue to the test</a>
  </div>
</main></div>`,
});

const testText = 'the little house stood at the end of the road and every morning the same two birds came back to sit on the fence';
const onboardingTest = page({
  title: 'Keymind setup: starting test',
  description: 'First run: a one-minute test to set a baseline.',
  typing: true,
  body: typingScreen({
    title: 'Starting test',
    left: '<span class="bar__mode">Starting test</span><span>About one minute</span>',
    stage: typedStage({ stream: textStream(testText, { cursor: 22, errs: { 11: 'y' }, targets: null }), source: 'Errors are fine, this only sets a baseline. <a class="link" href="onboarding-result.html">Skip the test</a>' }),
    next: testText[22],
    finger: fingerFor(testText[22]),
    targets: [],
    time: '00:41',
    wpm: 34,
    acc: '93%',
  }),
});

const onboardingResult = page({
  title: 'Keymind setup: your relief',
  description: 'First run: the starting skill relief and a suggested daily goal.',
  body: `<div class="ob">${obTop(2)}
<main class="ob__body">
  <div class="page-head">
    <h1>This is your starting relief</h1>
    <p>The higher the ground under a key, the slower or less accurate you are on it.</p>
  </div>
  <div class="map">
    ${relief({ seedValue: 11 })}
    ${keyboard({ targets: ['KeyE', 'KeyS', 'KeyP'], cls: 'kbd--map' })}
    ${mapPin(4, 1.5, '<b>E</b> 212 ms')}
    ${mapPin(10.5, 1.5, '<b>P</b> 205 ms')}
  </div>
  <div class="grid">
    <div class="figures s5">
      <div class="figure"><b>34</b><span>WPM</span></div>
      <div class="figure"><b>93%</b><span>Accuracy</span></div>
      <div class="figure"><b>61%</b><span>Rhythm evenness</span></div>
    </div>
    <div class="field s3">
      <label for="ob-goal">Daily goal</label>
      <select class="select" id="ob-goal"><option>10 minutes</option><option selected>15 minutes</option><option>20 minutes</option><option>30 minutes</option></select>
      <p class="field__help">Suggested from your test.</p>
    </div>
    <div class="field s4">
      <label for="ob-rem">Reminder</label>
      <input class="input" id="ob-rem" type="time" value="12:00">
      <p class="field__help">Turn it off any time in Settings.</p>
    </div>
  </div>
  <div class="ob__foot">
    <a class="btn btn--quiet" href="onboarding-test.html">Retake the test</a>
    <a class="btn btn--primary" href="typing-words.html">Start your first session</a>
  </div>
</main></div>`,
});

const wordsText = 'season lesson great pass each early class reach idea press please glass team across bread speak loss dress mean clear test heat miss learn stress year guess real lead cross';
const typingWords = page({
  title: 'Typing: adaptive words',
  description: 'The main typing screen in adaptive mode, focused on two weak transitions.',
  typing: true,
  body: typingScreen({
    title: 'Adaptive session',
    left: '<span class="bar__mode">Adaptive</span><span>Focus on <b class="gram">ea</b> <b class="gram">ss</b></span>',
    stage: typedStage({ stream: textStream(wordsText, { cursor: 26, errs: { 16: 'w' }, fixed: [9] }) }),
    next: wordsText[26],
    finger: fingerFor(wordsText[26]),
  }),
});

const walden = 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.';
const typingText = page({
  title: 'Typing: text',
  description: 'The typing screen with a public-domain passage.',
  typing: true,
  body: typingScreen({
    title: 'Text session',
    left: '<span class="bar__mode">Text</span><span>Walden, passage 12 of 240</span>',
    stage: typedStage({ stream: textStream(walden, { cursor: 41, errs: { 33: 'k' }, targets: null }), source: 'Henry David Thoreau, Walden, 1854. Public domain.' }),
    next: walden[41],
    finger: fingerFor(walden[41]),
    targets: [],
  }),
});

const rust = `/// Mean of the last \`window\` samples.
pub fn rolling_mean(samples: &[f64], window: usize) -> Vec<f64> {
    let mut out = Vec::with_capacity(samples.len());
    for (i, _) in samples.iter().enumerate() {
        let start = i.saturating_sub(window - 1);
        let slice = &samples[start..=i];
        out.push(slice.iter().sum::<f64>() / slice.len() as f64);
    }
    out
}`;
const codeCursor = 77;
const typingCode = page({
  title: 'Typing: code',
  description: 'The typing screen in code mode with a mono font, visible indents and line ends.',
  typing: true,
  body: typingScreen({
    title: 'Code session',
    left: '<span class="bar__mode">Code</span><span>Rust, built-in snippet</span>',
    right: '<span>Auto-indent, 4 spaces</span><span class="stat stat--live"><b>410 ms</b> recovery after {</span>',
    stage: `<div class="window window--code" style="--lines:10"><div class="stream">${codeStream(rust, codeCursor, { 58: ':' })}</div></div>`,
    next: rust[codeCursor],
    finger: fingerFor(rust[codeCursor]),
    targets: ['BracketLeft', 'BracketRight', 'Semicolon'],
    stats: true,
  }),
});

const trackBar = (done, total, pct) => {
  const g = [3, 2, 4, 3, 2, 5, 3, 4, 2, 3, 4, 3, 2, 4, 3, 2, 5, 3];
  return `<div class="track__bar" role="progressbar" aria-label="Track progress" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}">${g.slice(0, total).map((v, i) => `<i style="--g:${v}${i === done ? `;--p:${pct}%` : ''}" class="${i < done ? 'd' : i === done ? 'n' : ''}"></i>`).join('')}</div>`;
};
const lyricNow = 'the city hums along the evening rain';
const typingMusic = page({
  title: 'Typing: music',
  description: 'The typing screen following synced song lines and the track position.',
  typing: true,
  data: true,
  note: 'The lines are written for this mockup, not from a real song.',
  body: typingScreen({
    title: 'Music session',
    left: '<span class="bar__mode">Music</span><span>Sample Track by Sample Artist</span>',
    stage: region({
      full: `<div class="lyrics">
        <p class="past">sample lyric, written for this mockup</p>
        <div class="window"><div class="stream">${textStream(lyricNow, { cursor: 13, errs: { 6: 'r' }, targets: null })}</div></div>
        <div class="linetime" title="Time left on this line"><i style="--v:.42"></i></div>
        <p>no real song is quoted on this screen</p>
      </div>
      <div class="track"><span>1:12</span>${trackBar(6, 18, 40)}<span>3:48</span></div>
      <p class="source">Each mark is one line. Lyrics from LRCLIB, kept only in the local cache.</p>`,
      loading: `<div class="sk" style="width:min(100%,62ch)"><i style="--w:60%"></i><i style="--w:92%;height:32px"></i><i style="--w:70%"></i></div><p class="source">Looking up lyrics on LRCLIB</p>`,
      empty: ['Nothing is playing', 'Start a track in any player and Keymind picks it up from Windows media controls.', '<a class="btn" href="typing-text.html">Type a text instead</a>'],
      error: ['Lyrics are not available offline', 'LRCLIB could not be reached and this track is not in the local cache.', '<a class="btn" href="typing-text.html">Type a text instead</a>'],
    }),
    next: lyricNow[13],
    finger: fingerFor(lyricNow[13]),
    targets: [],
  }),
});

const subtitle = 'This is a placeholder subtitle written for the mockup, and nothing here comes from a real film or a real channel.';
const cues = (now) => ['A short opening line', 'Another sample subtitle', 'This is a placeholder subtitle', 'Next cue, still a sample', 'A closing sample line'].map((t, i) => `<li class="${i < now ? 'is-past' : i === now ? 'is-now' : ''}"${i === now ? ' aria-current="true"' : ''}>${t}</li>`).join('');
const videoModes = (now) => `<span class="seg"><a href="typing-video-pause.html"${now === 'pause' ? ' aria-current="true"' : ''}>Pause until typed</a><a href="typing-video-continuous.html"${now === 'cont' ? ' aria-current="true"' : ''}>Continuous</a></span>`;
const player = (veil) => `<div class="player">
  ${relief({ seedValue: 23, density: 5 })}
  <span class="player__label">Sample frame, not a real video</span>
  ${veil}
  <div class="player__controls"><span>0:41</span>${trackBar(2, 9, 70)}<span>4:05</span></div>
</div>`;
const videoScreen = (mode) => {
  const isPause = mode === 'pause';
  const cursor = isPause ? 28 : 42;
  return page({
    title: `Typing: video, ${isPause ? 'pause until typed' : 'continuous'}`,
    description: `The typing screen under a video player with subtitles, ${isPause ? 'paused until the line is typed' : 'playing without stopping'}.`,
    typing: true,
    data: true,
    note: 'No real video or subtitles are used.',
    body: typingScreen({
      title: 'Video session',
      left: '<span class="bar__mode">Video</span><span>sample.mp4 with sample.srt</span>',
      right: videoModes(isPause ? 'pause' : 'cont'),
      appCls: 'app--video',
      deckCls: 'deck--compact',
      stage: region({
        full: `<div class="vid">
          ${player(isPause ? '<div class="player__veil"><b>Waiting for you</b><span>Plays on when this line is typed</span></div>' : '')}
          <ol class="cues" aria-label="Subtitle lines">${cues(2)}</ol>
        </div>
        <div class="window window--sub"><div class="stream">${textStream(subtitle, isPause ? { cursor, errs: { 17: 'o' }, targets: null } : { cursor, errs: { 17: 'o' }, missed: [24, 25, 26, 27, 28, 29, 30, 31], targets: null })}</div></div>`,
        loading: '<div class="sk" style="width:min(100%,800px)"><i style="--w:100%;height:200px"></i><i style="--w:70%"></i></div><p class="source">Reading subtitles</p>',
        empty: ['No video yet', 'Pick a local file with an .srt beside it, or paste a YouTube link.', '<button class="btn" type="button">Choose a video</button>'],
        error: ['The video could not be loaded', 'yt-dlp could not reach the network. Local files still work.', '<button class="btn" type="button">Choose a local file</button>'],
      }),
      next: subtitle[cursor],
      finger: fingerFor(subtitle[cursor]),
      targets: [],
    }),
  });
};

export const typingPages = {
  'onboarding-theme': onboardingTheme,
  'onboarding-layout': onboardingLayout,
  'onboarding-test': onboardingTest,
  'onboarding-result': onboardingResult,
  'typing-words': typingWords,
  'typing-text': typingText,
  'typing-code': typingCode,
  'typing-music': typingMusic,
  'typing-video-pause': videoScreen('pause'),
  'typing-video-continuous': videoScreen('cont'),
};
