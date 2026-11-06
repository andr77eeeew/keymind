// Achievements, quests, events, challenges, settings, tray.
import { gram, meter, page, progressTabs, region, sec, shell, tierMark, variantsOf } from './lib.mjs';

const TIER = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' };
const ach = ({ tier, title, text, state = 'locked', when, value, max, label }) => `<li class="ach is-${state}">
  ${tierMark(tier)}
  <div>
    <p class="ach__t">${title}</p>
    <p class="ach__d">${text}</p>
    <div class="ach__m"><span class="tag${state === 'earned' ? ' tag--accent' : ''}">${TIER[tier]}</span>${when ? `<span class="muted">${when}</span>` : ''}</div>
    ${value !== undefined ? meter({ label, value, max, text: `${value} of ${max}` }) : ''}
  </div>
</li>`;
const hiddenAch = (i) => `<li class="ach is-locked">${tierMark(1, true)}<div><p class="ach__t">Hidden achievement ${i}</p><p class="ach__d">Revealed only after you earn it.</p></div></li>`;
export { ach };

const achievements = page({
  title: 'Keymind: achievements',
  description: 'Achievements in four difficulty tiers plus hidden ones.',
  data: true,
  gam: true,
  body: shell('progress', `<div class="page-head"><h1>Progress</h1><p>Level 14, 2,340 of 3,000 XP</p></div>
${progressTabs('achievements')}
<div class="row" style="justify-content:space-between">
  <div class="tier-key" aria-label="Tiers are counted by rings">${[1, 2, 3, 4].map((t) => `<span>${tierMark(t)}${TIER[t]}</span>`).join('')}</div>
  <span class="seg" data-toggle role="group" aria-label="Show"><button type="button" aria-pressed="true">All</button><button type="button" aria-pressed="false">Earned</button><button type="button" aria-pressed="false">In progress</button></span>
</div>
${region({
    full: `${sec('Earned, 14 of 62', `<ul class="ach-grid">
      ${ach({ tier: 1, title: 'First steps', text: 'Finish your first session.', state: 'earned', when: 'Sep 12' })}
      ${ach({ tier: 1, title: 'Ten clean minutes', text: 'Type 10 minutes at 96% or better.', state: 'earned', when: 'Sep 30' })}
      ${ach({ tier: 2, title: 'Bracket mender', text: 'Cut recovery after { by 100 ms.', state: 'earned', when: 'Oct 21' })}
      ${ach({ tier: 2, title: 'Three weeks running', text: 'Keep a 21-day streak.', state: 'earned', when: 'Nov 2' })}
      ${ach({ tier: 3, title: 'Even hand', text: 'Hold 80% rhythm for a 10-minute session.', state: 'earned', when: 'Nov 3' })}
    </ul>`)}
    ${sec('In progress', `<ul class="ach-grid">
      ${ach({ tier: 2, title: 'Level ground', text: 'Bring 10 weak transitions under 150 ms.', value: 6, max: 10, label: 'Transitions' })}
      ${ach({ tier: 3, title: 'Long practice', text: 'Practice for 100 hours.', value: 62, max: 100, label: 'Hours' })}
      ${ach({ tier: 4, title: 'Flat map', text: 'Every key under 150 ms at 98% accuracy.', value: 31, max: 49, label: 'Keys' })}
      ${ach({ tier: 4, title: 'Sudden death, 500', text: 'Type 500 characters without one error.', value: 212, max: 500, label: 'Best run' })}
    </ul>`)}
    ${sec('Hidden', `<ul class="ach-grid">${hiddenAch(1)}${hiddenAch(2)}${hiddenAch(3)}</ul>`, '<span class="muted" style="font-size:var(--text-sm)">9 still hidden</span>')}`,
    rows: 6,
    empty: ['No achievements yet', 'Your first one comes with your first session.', '<a class="btn btn--primary" href="typing-words.html">Start session</a>'],
    error: ['Achievements could not be loaded', 'A rule file has an error, so nothing was granted or lost.', '<a class="btn" href="settings.html#data">Open data settings</a>'],
  })}`),
});

const questRow = (title, tag, tagCls, m, text) => `<li class="quest"><span class="quest__t">${title}</span><span class="tag ${tagCls}">${tag}</span>${text ? `<span class="quest__d">${text}</span>` : ''}${meter(m)}</li>`;
const quests = page({
  title: 'Keymind: quests',
  description: 'Day and week goals, daily, weekly and personal quests.',
  data: true,
  gam: true,
  body: shell('progress', `<div class="page-head"><h1>Progress</h1><p>Streak 23 days, one freeze left</p></div>
${progressTabs('quests')}
${region({
    full: `<div class="grid">
  ${sec('From the brain', `<ul class="rows">
    ${questRow(`Bring ${gram('{')} then Enter to 240 ms`, 'Personal', 'tag--accent', { label: 'Now 262 ms', value: 38, max: 60, text: '38 of 60 ms' }, 'Your slowest code transition this month.')}
    ${questRow(`Bring ${gram('ss')} under 190 ms`, 'Personal', 'tag--accent', { label: 'Now 196 ms', value: 9, max: 15, text: '9 of 15 ms' }, 'Trained in your next adaptive session.')}
  </ul>`, '', 's6')}
  ${sec('Your goals', `<div class="stack" style="gap:var(--space-sm);padding-block:var(--space-xs)">
    ${meter({ label: 'Today: minutes', value: 12, max: 20, text: '12 of 20' })}
    ${meter({ label: 'This week: sessions', value: 3, max: 5, text: '3 of 5' })}
    ${meter({ label: 'This week: accuracy', value: 96.4, max: 97, text: '96.4 of 97%' })}
    <div class="row"><button class="btn btn--sm" type="button">Edit goals</button><span class="muted" style="font-size:var(--text-xs)">Set your own, or let the brain suggest them.</span></div>
  </div>`, '', 's6')}
  ${sec('Daily', `<ul class="rows">
    ${questRow('Type 10 minutes at 96% or better', 'Today', '', { label: 'Progress', value: 7, max: 10, text: '7 of 10 min' })}
    ${questRow('Finish a session with no Backspace', 'Today', '', { label: 'Progress', value: 0, max: 1, text: '0 of 1' })}
  </ul>`, '', 's6')}
  ${sec('Weekly', `<ul class="rows">
    ${questRow('Three code sessions', 'Until Sunday', '', { label: 'Progress', value: 1, max: 3, text: '1 of 3' })}
    ${questRow('Raise rhythm evenness by 2 points', 'Until Sunday', '', { label: 'Progress', value: 2, max: 2, text: '2 of 2', state: 'done' })}
  </ul>`, '', 's6')}
</div>`,
    rows: 5,
    empty: ['No quests right now', 'New daily quests appear tomorrow.', ''],
    error: ['Quests could not be loaded', 'A rule file has an error. Practice still counts.', '<a class="btn" href="settings.html#data">Open data settings</a>'],
  })}`),
});

const events = page({
  title: 'Keymind: events',
  description: 'Time-limited event themes with dates in local content files.',
  data: true,
  gam: true,
  body: shell('progress', `<div class="page-head"><h1>Progress</h1><p>Events run offline, by your local date</p></div>
${progressTabs('events')}
${region({
    full: `<div class="grid">
  <section class="sheet s7 stack">
    <div class="next__h"><h2>Symbol week</h2><span class="tag tag--strong">Ends in 4 days</span></div>
    <p style="font-size:var(--text-sm)">Nov 2 to 8, 2026. Brackets and Shift pairs earn double XP, and sessions lean on symbols.</p>
    ${meter({ label: 'Symbols typed', value: 840, max: 2000, text: '840 of 2,000' })}
    ${meter({ label: 'Clean bracket pairs', value: 64, max: 100, text: '64 of 100' })}
    <div><a class="btn btn--primary" href="typing-code.html">Start a symbol session</a></div>
  </section>
  ${sec('Rewards', `<ul class="rows">
    <li style="grid-template-columns:minmax(0,1fr) auto"><span>Double XP on symbols</span><span class="tag tag--accent">Active</span></li>
    <li style="grid-template-columns:minmax(0,1fr) auto"><span>Silver achievement, Symbol week</span><span class="muted">At 2,000 symbols</span></li>
    <li style="grid-template-columns:minmax(0,1fr) auto"><span>One extra streak freeze</span><span class="muted">At 100 clean pairs</span></li>
  </ul>`, '', 's5')}
  ${sec('Other events', `<table class="tbl tbl--rows"><thead><tr><th>Event</th><th>Dates</th><th>Status</th><th class="n">Your result</th></tr></thead><tbody>
    <tr><td>Home row month</td><td>Dec 1 to 31</td><td>Upcoming</td><td class="n">Not started</td></tr>
    <tr><td>Number sprint</td><td>Oct 12 to 18</td><td>Ended</td><td class="n">1,620 digits</td></tr>
    <tr><td>Rhythm week</td><td>Sep 21 to 27</td><td>Ended</td><td class="n">+4 points</td></tr>
  </tbody></table>`, '', 's12')}
</div>`,
    rows: 5,
    empty: ['No event this week', 'The next one starts on Dec 1. Practice still earns XP as usual.', ''],
    error: ['The event could not be read', 'Its content file has an error, so the event is off. Practice still counts.', ''],
  })}`),
});

const challenge = (name, rule, best) => `<tr><td><b style="font-weight:var(--weight-medium)">${name}</b></td><td>${rule}</td><td class="n">${best}</td><td class="n"><a class="btn btn--sm" href="typing-words.html">Start</a></td></tr>`;
const challenges = page({
  title: 'Keymind: challenges',
  description: 'Special conditions: no errors, sudden death, blind mode, speed ladder, ghost race.',
  data: true,
  gam: true,
  body: shell('progress', `<div class="page-head"><h1>Progress</h1><p>Special rules, on purpose</p></div>
${progressTabs('challenges')}
${region({
    full: `<div class="stack stack--secs">${sec('Challenges', `<table class="tbl tbl--rows tbl--challenge"><thead><tr><th>Challenge</th><th>Rule</th><th class="n">Your best</th><th class="n"><span class="visually-hidden">Action</span></th></tr></thead><tbody>
      ${challenge('No errors', 'Finish a passage without one mistake.', '312 characters')}
      ${challenge('Sudden death', 'The first error ends the run.', '212 characters')}
      ${challenge('Blind mode', 'What you type stays hidden until the end.', '94%')}
      ${challenge('Speed ladder', 'The target speed climbs every 30 seconds.', '62 WPM')}
    </tbody></table>`)}
    ${sec('Ghost', `<table class="tbl tbl--rows tbl--challenge"><thead><tr><th>Text</th><th>Race your own past run</th><th class="n">Your best</th><th class="n"><span class="visually-hidden">Action</span></th></tr></thead><tbody>
      ${challenge('Walden, passage 12', 'Ghost set on Oct 29.', '64 WPM')}
      ${challenge('Top 200 words', 'Ghost set on Nov 1.', '71 WPM')}
    </tbody></table>`)}</div>`,
    rows: 6,
    empty: ['No challenges available', 'Challenges come from local content files, and none were found.', '<a class="btn" href="settings.html#data">Open data settings</a>'],
    error: ['Challenges could not be loaded', 'A rule file has an error. Other modes still work.', '<a class="btn" href="settings.html#data">Open data settings</a>'],
  })}`),
});

// ---- Settings
const sw = (id, on = true, attrs = '') => `<label class="switch"><input type="checkbox" role="switch" id="${id}"${on ? ' checked' : ''} ${attrs}><span class="switch__t"></span><span class="switch__state">${on ? 'On' : 'Off'}</span></label>`;
const seg = (label, opts, active = 0, dis = []) => `<span class="seg" data-toggle role="group" aria-label="${label}">${opts.map((o, i) => `<button type="button" aria-pressed="${i === active}"${dis.includes(i) ? ' disabled' : ''}>${o}</button>`).join('')}</span>`;
const sel = (id, label, opts, active = 0) => `<select class="select" id="${id}" aria-label="${label}">${opts.map((o, i) => `<option${i === active ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
const setting = (title, text, control, { dep, labelFor } = {}) => `<div class="setting${dep ? ' setting--dep' : ''}"${dep ? ` data-dep="${dep}"` : ''}><div>${labelFor ? `<label class="setting__t" for="${labelFor}">${title}</label>` : `<p class="setting__t">${title}</p>`}${text ? `<p class="setting__d">${text}</p>` : ''}</div><div class="setting__c">${control}</div></div>`;
const group = (id, title, inner) => `<section class="sec" id="${id}"><header class="sec__h"><h2>${title}</h2></header>${inner}</section>`;
// Settings, Data: the statistics row in each state of a rebuild. A rebuild never blocks typing, so only
// the button waits. Lines left out stay said under the row until the journal changes.
const DATA = [['idle', 'Data, as usual'], ['rebuilding', 'Data, rebuilding'], ['rebuilt', 'Data, rebuilt'], ['rebuild-error', 'Data, rebuild failed'], ['damaged', 'Data, journal lines left out']];
const vd = variantsOf(DATA);
const REBUILD = '<button class="btn" type="button">Rebuild from the journal</button>';
const statsRow = (extra = '', button = REBUILD) => `<div class="setting"><div><p class="setting__t">Statistics</p><p class="setting__d">Worked out from your journal. Rebuilding reads the journal again and does not change it.</p>${extra}</div><div class="setting__c">${button}</div></div>`;
const STATS_ROW = [
  vd('idle', statsRow()),
  vd('rebuilding', statsRow('<p class="setting__d" role="status">Rebuilding. You can keep typing.</p>', '<button class="btn" type="button" disabled>Rebuild from the journal</button>')),
  vd('rebuilt', statsRow('<p class="setting__d" role="status">The statistics were rebuilt.</p>')),
  vd('rebuild-error', statsRow('<p class="field__error" role="alert">The statistics could not be rebuilt: the journal folder could not be read at C:\\Users\\me\\AppData\\Roaming\\Keymind\\journal: Access is denied.</p>')),
  vd('damaged', statsRow('<p class="setting__d">3 lines of the journal could not be read and were left out.</p>')),
].join('');
const NAV = [['typing', 'Typing'], ['code', 'Code'], ['progress', 'Progress'], ['brain', 'Brain'], ['reminders', 'Reminders'], ['app', 'App'], ['layouts', 'Layouts'], ['sync', 'Sync'], ['integrations', 'Integrations'], ['data', 'Data']];

const settings = page({
  title: 'Keymind: settings',
  description: 'Every policy and feature, on by default and switchable.',
  gam: true,
  variants: DATA,
  note: 'The states change only the Statistics row under Data.',
  body: shell('settings', `<div class="page-head"><h1>Settings</h1><p>Everything can be turned off. Only sync starts off, until you pick a target.</p></div>
<div class="set-layout">
  <nav class="set-nav" aria-label="Settings sections">${NAV.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
  <div class="set-body">
    ${group('typing', 'Typing', [
    setting('Backspace', 'Corrections are allowed everywhere. The original error is always counted.', seg('Backspace', ['Allowed', 'Blocked in Adaptive'])),
    setting('On error', 'Keep typing, or wait for the right key.', seg('On error', ['Keep going', 'Stop until correct'])),
    setting('Live figures', 'WPM, accuracy and elapsed time while you type. A time limit always shows, and the summary keeps every figure.', sw('s-figures')),
    setting('On-screen keyboard', 'The finger hint is part of the keyboard.', sel('s-kbd', 'On-screen keyboard', ['On, with finger hint', 'Only on error', 'Off']), { labelFor: 's-kbd' }),
    setting('Sounds', '', sw('s-sound')),
    setting('Sound set', '', sel('s-soundset', 'Sound set', ['Soft', 'Mechanical', 'Tick']), { dep: 's-sound', labelFor: 's-soundset' }),
  ].join(''))}
    ${group('code', 'Code', [
    setting('Indents', 'Auto-indent moves you past the indent after Enter.', seg('Indents', ['Automatic', 'Type them'])),
    setting('Indent with', '', seg('Indent with', ['Spaces', 'Tabs'])),
    setting('Auto-close brackets', 'Typing { also places }.', sw('s-brackets')),
    setting('Show special symbols', 'Line ends and indent dots.', sw('s-symbols')),
  ].join(''))}
    ${group('progress', 'Progress', [
    setting('Gamification', 'Off is clean mode: no XP, levels, quests, events or achievements anywhere.', sw('s-gam')),
    setting('Streaks', '', sw('s-streak'), { dep: 's-gam' }),
    setting('Streak freeze', 'A freeze saves a missed day.', sw('s-freeze'), { dep: 's-gam' }),
    setting('Reward animations', 'Shown away from the text and never over it.', sw('s-reward'), { dep: 's-gam' }),
    setting('Tips', 'Each tip shows the data behind it.', sw('s-tips')),
  ].join(''))}
    ${group('brain', 'Brain', [
    setting('Who picks your sessions', 'ML starts after a cold start on the heuristic. Heuristic only keeps it that way.', seg('Who picks your sessions', ['ML with heuristic', 'Heuristic only'])),
    setting('A/B comparison', 'Sessions alternate between ML and the heuristic to measure which helps more.', sw('s-ab')),
  ].join(''))}
    ${group('reminders', 'Reminders', [
    setting('Reminders', 'A Windows notification. Works while the window is closed.', sw('s-rem')),
    setting('When', 'Smart picks a time from your real habits.', seg('When', ['Fixed time', 'Smart']), { dep: 's-rem' }),
    setting('Time', '', '<input class="input" id="s-time" type="time" value="12:00">', { dep: 's-rem', labelFor: 's-time' }),
    setting('Quiet hours', 'No reminders in this window.', sw('s-quiet') + '<input class="input" style="width:140px" type="time" value="22:00" aria-label="Quiet hours from"><span class="muted">to</span><input class="input" style="width:140px" type="time" value="08:00" aria-label="Quiet hours until">', { dep: 's-rem' }),
  ].join(''))}
    ${group('app', 'App', [
    setting('Start with Windows', '', sw('s-auto')),
    setting('Keep in the tray', 'Closing the window keeps Keymind running.', sw('s-tray')),
    setting('Theme', 'System follows the Windows setting, also while Keymind is open.', `<span class="seg" role="group" aria-label="Theme"><button type="button" data-set-theme="light">Light</button><button type="button" data-set-theme="dark">Dark</button><button type="button" data-set-theme="system">System</button></span>`),
    setting('Interface language', 'More languages come with their keyboard layouts.', `<select class="select" id="s-lang"><option selected>English</option><option disabled>Russian, planned</option><option disabled>Ukrainian, planned</option></select>`, { labelFor: 's-lang' }),
  ].join(''))}
    ${group('layouts', 'Layouts', [
    setting('Layout', 'Statistics use the physical key, so they carry over.', `<select class="select" id="s-layout"><option selected>English, QWERTY</option><option disabled>Russian, planned</option><option disabled>Ukrainian, planned</option></select>`, { labelFor: 's-layout' }),
  ].join(''))}
    ${group('sync', 'Sync', [
    setting('Sync journals', 'Off until you pick a target. Only journals sync, the database stays on this PC.', seg('Sync journals', ['Off', 'Folder', 'Git'], 1)),
    `<div class="setting setting--dep"><div><label class="setting__t" for="s-folder">Folder</label><p class="setting__d">Google Drive for desktop, OneDrive or Dropbox.</p></div><div class="setting__c"><input class="input" id="s-folder" value="G:\\My Drive\\keymind" aria-invalid="true" aria-describedby="s-folder-e"><p class="field__error" id="s-folder-e">This folder is not available. Is the drive mounted?</p></div></div>`,
    `<div class="setting setting--dep"><div><label class="setting__t" for="s-git">Git remote</label><p class="setting__d">A private repository. Used when the target is Git.</p></div><div class="setting__c"><input class="input" id="s-git" placeholder="git@example.com:me/journals.git" disabled></div></div>`,
  ].join(''))}
    ${group('integrations', 'Integrations', [
    setting('Lyrics from LRCLIB', 'Uses the network, and cached lyrics still work offline.', sw('s-lrclib')),
    setting('Windows media controls', 'Reads the current track from any player.', sw('s-media')),
    setting('YouTube through yt-dlp', 'Local video with .srt files works without it.', sw('s-yt')),
  ].join(''))}
    ${group('data', 'Data', [
    setting('Export everything', 'One ZIP with journals and settings.', '<button class="btn" type="button">Export ZIP</button>'),
    setting('Import', 'Merges journals from a ZIP. Nothing is overwritten.', '<button class="btn" type="button">Import ZIP</button>'),
    STATS_ROW,
    setting('Telemetry', 'None. Your data only leaves this PC through the sync you choose.', '<span class="muted" style="font-size:var(--text-sm)">No telemetry</span>'),
  ].join(''))}
  </div>
</div>`),
});

// ---- Tray and reminder
const tray = page({
  title: 'Keymind: tray and reminder',
  description: 'Content of the tray menu and the reminder notification, both drawn by Windows.',
  gam: true,
  body: shell('settings', `<div class="page-head"><h1>Tray and reminder</h1><p>Windows draws both. We design what they say.</p></div>
<div class="tray-grid">
  ${sec('Tray menu', `<ul class="nmenu" aria-label="Tray menu content">
      <li class="is-hover"><span>Start short session</span></li>
      <li><span>Open Keymind</span></li>
      <li class="sep"></li>
      <li class="is-disabled gam"><span>Today: 12 of 20 min</span></li>
      <li class="is-disabled gam"><span>Streak: 23 days</span></li>
      <li class="sep"></li>
      <li><span>Reminders</span><span class="chk">on</span></li>
      <li><span>Quiet until tomorrow</span></li>
      <li class="sep"></li>
      <li><span>Quit</span></li>
    </ul>
    <p class="muted" style="font-size:var(--text-xs);margin-top:var(--space-sm);max-width:44ch">A native menu in Tauri 2: text items, checks and separators, in the system look. The two status lines are read-only and update in the background.</p>`)}
  ${sec('Reminder', `<div class="stack">
      <div class="toast"><small>Keymind</small><b>Ten minutes on ea?</b><span>Your weak spot from yesterday. Click to start a short session.</span></div>
      <div class="toast"><small>Keymind, streak on</small><b>Day 24 is waiting</b><span>Five minutes keeps your streak. Click to start.</span></div>
      <div class="toast"><small>Keymind, clean mode</small><b>Time for practice</b><span>Click to start a short session.</span></div>
    </div>
    <p class="muted" style="font-size:var(--text-xs);margin-top:var(--space-sm);max-width:44ch">Title and body only: notification action buttons in the Tauri 2 plugin are mobile only.</p>`)}
  ${sec('When it cannot show', `<ul class="rows">
      <li><b style="font-weight:var(--weight-medium)">Quiet hours</b><span class="muted">The reminder waits and is dropped if the day ends.</span></li>
      <li><b style="font-weight:var(--weight-medium)">Do not disturb</b><span class="muted">Windows holds it. Keymind does not retry.</span></li>
      <li><b style="font-weight:var(--weight-medium)">Goal already met</b><span class="muted">No reminder today.</span></li>
    </ul>`)}
</div>`),
});

export const progressPages = { achievements, quests, events, challenges, settings, tray };
