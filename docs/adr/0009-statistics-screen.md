# ADR-0009: Statistics screen

- Status: accepted
- Date: 2026-11-05

## Context

Stage 2 shows what the projector counted (ADR-0008): the relief map on Home and the Statistics screen.
The design gives the layout, but several questions are about meaning rather than looks: what makes a
key "slow", what counts as a record, when there is too little data to say anything, how the charts are
drawn, and when the screens read the database given that the typing screen must never lag.

## Options

**Charts.** ECharts does everything, at about 1 MB. uPlot draws fast lines on a canvas at about 50 KB,
and nothing else. Hand-written SVG needs no dependency but brings its own bugs in axes and cursors.

**Speed scale of the heatmap.** The mockup uses absolute limits, with the best step below 125 ms and
the worst from 220 ms. A personal scale measures every key against the person's own median key.

**Error scale.** Absolute or personal.

**When to read.** Keep every screen fresh as soon as the projector finishes, or read only for the
screen in front.

## Decision

**uPlot**, version pinned. It covers the three trends, which are the only real charts here: the keyboard,
the matrix and the finger bars are plain HTML, so that they stay readable and themeable by tokens. The
chart code and its 50 KB load in a lazy chunk together with the screen.

**Speed is personal, errors are absolute.** Absolute limits would paint a beginner's keyboard in one
colour and tell them nothing. The step comes from the ratio to the median key, with limits 0.85, 1, 1.15,
1.3 and 1.5. The price is that the colours do not show progress: getting faster everywhere leaves the
map the same, and the trends show that instead. Errors keep the limits 1.5, 2.5, 3.5, 4.5 and 6.5 percent,
because a percentage already means the same for everyone.

**Too little data.**

- Under 5 samples, a key or transition says "too few samples" and has no colour for speed.
- The error step needs 5 presses, counted separately, so a key can show errors without a time.
- Under 10 sessions, the map on Home is drawn lower, says it will still change, and names no weak keys.

**Weakness on the map** is the worse of two values from 0 to 1: slowdown against the median, where 45% is
full, and errors, where 8% is full. The two pins show the weakest keys, each with the figure that made it
weak. The second pin keeps its distance from the first, so one does not cover the other. The map always
reads all time, whatever period Statistics shows.

**Records** are the best WPM and the best accuracy among completed sessions of at least 100 correct
characters, over all time. Zen does not count (ADR-0008). Without a minimum, a three-word session would be
the record forever. The labels are "Best speed" and "Best accuracy", not the mockup's "5 minutes" and "10
minutes", because sessions here are short and have no such lengths.

**A saved summary** is drawn from the row in `sessions`, with no journal read. So it has no reading
progress, and a passage is named generally, since the row has no book title. A dedicated `stats_session`
command reads the row, because a record can be older than the recent list.

**Reads follow the screen.** When the projector finishes, every reader is marked stale, and only the screen
in front reads at once. During typing nothing reads at all, and the next screen reads when it opens. During a
rebuild the tables start from nothing, so the old answer stays on the screen until the rebuild ends.

**Theme.** A canvas cannot read CSS variables, so the chart looks the tokens up and redraws when
`data-theme` changes. That attribute is always set to the resolved theme, so the system theme is covered too.

**Left out for now:** level and streak (stage 4), errors by type, the fatigue curve, recovery time (stage 5),
the brain panel (stage 3), the "Target gain" column, and the note about cells in focus (stage 3). Each needs data
that does not exist yet.

## Consequences

- The screen says less than the mockup, but all of it is true.
- Two people with the same colours can have very different speeds. This is intended, and the numbers on
  the keys and in the tips stay absolute.
- A median needs enough keys to mean something. With only a few typed keys, colours move a lot. The 10
  session note on Home covers that case.
- A record does not depend on the chosen period, unlike everything else on the screen except Recent
  sessions.
- The relief is recomputed only when its data changes. It never runs during typing, since Home is not mounted.
- uPlot's axes and cursor are its own, so keyboard reading goes through `setCursor`, and table view stays
  available for anyone who needs the plain numbers.
