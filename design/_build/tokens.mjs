// Single source for design/tokens.css and design/tokens.json.
const fontUi = '"Golos Text", ui-sans-serif, system-ui, sans-serif';
const fontCode = '"JetBrains Mono", ui-monospace, Consolas, monospace';

export const scale = {
  space: { '3xs': '2px', '2xs': '4px', xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },
  text: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.2rem', xl: '1.44rem', '2xl': '1.728rem', '3xl': '2.074rem', '4xl': '2.488rem' },
  font: { ui: fontUi, display: fontUi, typing: fontUi, code: fontCode },
  weight: { regular: '400', medium: '500', display: '600' },
  radius: { glyph: '4px', ui: '6px', key: '6px', pill: '999px' },
  control: { sm: '32px', md: '40px', hit: '44px' },
  ease: { out: 'cubic-bezier(0.16, 1, 0.3, 1)', settle: 'cubic-bezier(0.34, 1.3, 0.64, 1)' },
  dur: { micro: '120ms', short: '220ms', long: '420ms', ripple: '900ms', reward: '2600ms' },
  z: { tooltip: '400', toast: '500', overlay: '600' },
};

export const sizes = {
  base: { 'typing-size': '30px', 'code-size': '21px', key: '50px', 'key-gap': '5px', 'key-font': '16px', 'bar-h': '56px', 'hand-w': '14px', 'hand-h': '76px', 'content-max': '1360px', 'typing-column': '930px', 'reward-band': '88px' },
  large: { 'typing-size': '40px', 'code-size': '28px', key: '68px', 'key-font': '20px', 'bar-h': '64px', 'hand-w': '18px', 'hand-h': '108px', 'content-max': '1560px', 'typing-column': '1240px' },
};

export const themes = {
  light: {
    paper: 'oklch(96% 0.011 85)', 'paper-2': 'oklch(99% 0.005 85)', 'paper-3': 'oklch(92% 0.016 85)',
    ink: 'oklch(18% 0.006 60)', 'ink-2': 'oklch(28% 0.008 60)', muted: 'oklch(44% 0.012 60)',
    rule: 'oklch(86% 0.014 85)', 'rule-2': 'oklch(91% 0.012 85)', 'field-edge': 'oklch(56% 0.014 70)',
    accent: 'oklch(65% 0.19 40)', 'accent-ink': 'oklch(18% 0.006 60)', 'accent-soft': 'oklch(91% 0.05 50)',
    signal: 'oklch(18% 0.006 60)', 'signal-ink': 'oklch(97% 0.008 85)', focus: 'oklch(52% 0.17 40)',
    upcoming: 'oklch(44% 0.012 60)', done: 'oklch(18% 0.006 60)',
    'caret-bg': 'oklch(65% 0.19 40)', 'caret-ink': 'oklch(18% 0.006 60)',
    'error-ink': 'oklch(97% 0.008 85)', 'error-bg': 'oklch(18% 0.006 60)', 'error-mark': 'oklch(18% 0.006 60)',
    target: 'oklch(48% 0.11 150)', 'target-soft': 'oklch(92% 0.04 150)',
    'key-bg': 'oklch(99% 0.005 85 / 0.86)', 'key-edge': 'oklch(80% 0.016 85)', 'key-ink': 'oklch(28% 0.008 60)', 'key-quiet': 'oklch(44% 0.012 60)',
    'key-next-bg': 'oklch(65% 0.19 40)', 'key-next-ink': 'oklch(18% 0.006 60)', 'key-wrong-bg': 'oklch(18% 0.006 60)', 'key-wrong-ink': 'oklch(97% 0.008 85)',
    'hand-idle': 'oklch(84% 0.016 85)', contour: 'oklch(62% 0.07 58)', 'key-lit': 'oklch(99.5% 0.003 85 / 0.9)', 'key-shade': 'oklch(40% 0.03 60 / 0.22)',
    'heat-0': 'oklch(95% 0.015 75)', 'heat-1': 'oklch(89% 0.05 62)', 'heat-2': 'oklch(81% 0.09 54)', 'heat-3': 'oklch(72% 0.13 46)', 'heat-4': 'oklch(61.5% 0.15 40)', 'heat-5': 'oklch(44% 0.12 36)',
    'heat-ink-0': 'oklch(18% 0.006 60)', 'heat-ink-1': 'oklch(18% 0.006 60)', 'heat-ink-2': 'oklch(18% 0.006 60)', 'heat-ink-3': 'oklch(18% 0.006 60)', 'heat-ink-4': 'oklch(18% 0.006 60)', 'heat-ink-5': 'oklch(97% 0.008 85)',
    'chart-1': 'oklch(48% 0.12 250)', 'chart-2': 'oklch(62% 0.18 42)', 'chart-grid': 'oklch(89% 0.012 85)',
  },
  dark: {
    paper: 'oklch(18.5% 0.012 65)', 'paper-2': 'oklch(22.5% 0.013 65)', 'paper-3': 'oklch(15.5% 0.011 65)',
    ink: 'oklch(93% 0.012 85)', 'ink-2': 'oklch(85% 0.013 85)', muted: 'oklch(73% 0.014 80)',
    rule: 'oklch(33% 0.014 70)', 'rule-2': 'oklch(26% 0.013 70)', 'field-edge': 'oklch(58% 0.014 75)',
    accent: 'oklch(74% 0.16 42)', 'accent-ink': 'oklch(16% 0.01 60)', 'accent-soft': 'oklch(32% 0.06 45)',
    signal: 'oklch(93% 0.012 85)', 'signal-ink': 'oklch(17% 0.012 65)', focus: 'oklch(78% 0.14 42)',
    upcoming: 'oklch(73% 0.014 80)', done: 'oklch(95% 0.01 85)',
    'caret-bg': 'oklch(74% 0.16 42)', 'caret-ink': 'oklch(16% 0.01 60)',
    'error-ink': 'oklch(17% 0.012 65)', 'error-bg': 'oklch(93% 0.012 85)', 'error-mark': 'oklch(93% 0.012 85)',
    target: 'oklch(76% 0.13 150)', 'target-soft': 'oklch(32% 0.05 150)',
    'key-bg': 'oklch(25% 0.014 65 / 0.88)', 'key-edge': 'oklch(34% 0.014 68)', 'key-ink': 'oklch(88% 0.012 85)', 'key-quiet': 'oklch(73% 0.014 80)',
    'key-next-bg': 'oklch(74% 0.16 42)', 'key-next-ink': 'oklch(16% 0.01 60)', 'key-wrong-bg': 'oklch(93% 0.012 85)', 'key-wrong-ink': 'oklch(17% 0.012 65)',
    'hand-idle': 'oklch(36% 0.014 68)', contour: 'oklch(50% 0.05 62)', 'key-lit': 'oklch(96% 0.01 85 / 0.08)', 'key-shade': 'oklch(8% 0.01 60 / 0.5)',
    'heat-0': 'oklch(25% 0.016 62)', 'heat-1': 'oklch(32% 0.05 52)', 'heat-2': 'oklch(41% 0.08 46)', 'heat-3': 'oklch(59% 0.115 42)', 'heat-4': 'oklch(69% 0.13 42)', 'heat-5': 'oklch(80% 0.12 50)',
    'heat-ink-0': 'oklch(93% 0.012 85)', 'heat-ink-1': 'oklch(93% 0.012 85)', 'heat-ink-2': 'oklch(95% 0.01 85)', 'heat-ink-3': 'oklch(14% 0.01 60)', 'heat-ink-4': 'oklch(14% 0.01 60)', 'heat-ink-5': 'oklch(14% 0.01 60)',
    'chart-1': 'oklch(66% 0.12 240)', 'chart-2': 'oklch(66% 0.16 42)', 'chart-grid': 'oklch(29% 0.013 70)',
  },
};

// ---- Colour maths, used for hex values in tokens.json and for the contrast report
export function oklchToRgb(str) {
  const m = str.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/);
  const L = +m[1] / 100; const C = +m[2]; const h = (+m[3] * Math.PI) / 180;
  const a = C * Math.cos(h); const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s].map((v) => Math.min(1, Math.max(0, v)));
  return { lin, alpha: m[4] === undefined ? 1 : +m[4] };
}
const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function hex(str) {
  const { lin, alpha } = oklchToRgb(str);
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${lin.map((v) => to(gamma(v))).join('')}${alpha < 1 ? to(alpha) : ''}`;
}
const lum = (str) => { const { lin: [r, g, b] } = oklchToRgb(str); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (x, y) => { const a = lum(x); const b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

export const contrastPairs = [
  ['ink', 'paper', 7], ['ink', 'paper-2', 7], ['ink', 'paper-3', 7], ['ink-2', 'paper', 7], ['ink', 'accent-soft', 7], ['muted', 'paper', 4.5], ['muted', 'paper-2', 4.5], ['muted', 'paper-3', 4.5],
  ['upcoming', 'paper', 4.5], ['done', 'paper', 7], ['caret-ink', 'caret-bg', 4.5], ['caret-bg', 'paper', 3], ['error-ink', 'error-bg', 7],
  ['signal-ink', 'signal', 7], ['accent-ink', 'accent', 4.5], ['focus', 'paper', 3], ['focus', 'paper-2', 3], ['field-edge', 'paper-2', 3],
  ['key-ink', 'paper-2', 4.5], ['key-quiet', 'paper-2', 4.5], ['key-next-ink', 'key-next-bg', 4.5], ['key-wrong-ink', 'key-wrong-bg', 7], ['target', 'paper', 3],
  ['chart-1', 'paper', 3], ['chart-2', 'paper', 3],
  ...[0, 1, 2, 3, 4, 5].map((i) => [`heat-ink-${i}`, `heat-${i}`, 4.5]),
];

// ---- Writers
const vars = (prefix, o) => Object.entries(o).map(([k, v]) => `--${prefix}-${k}: ${v};`).join(' ');
const colorBlock = (o) => Object.entries(o).map(([k, v]) => `  --color-${k}: ${v};`).join('\n');

export function tokensCss() {
  return `/* Keymind design tokens, direction "Relief". Generated by design/_build; edit tokens.mjs, not this file.
   Both themes share the same role names. Components use roles, never raw colours or font names. */
:root {
  ${vars('space', scale.space)}
  ${vars('text', scale.text)}
  ${vars('font', scale.font)}
  ${vars('weight', scale.weight)}
  ${vars('radius', scale.radius)}
  ${vars('control', scale.control)}
  ${vars('ease', scale.ease)}
  ${vars('dur', scale.dur)}
  ${vars('z', scale.z)}
  --typing-weight: 400; --typing-spacing: 0.01em; --typing-lines: 4; --tracking-display: -0.02em;
  ${Object.entries(sizes.base).map(([k, v]) => `--${k}: ${v};`).join(' ')}
  --shadow-key: inset 0 1px 0 var(--color-key-lit), 0 1px 0 var(--color-key-edge), 0 2px 3px -1px var(--color-key-shade);
  --shadow-lift: 0 1px 2px var(--color-key-shade), 0 12px 24px -14px var(--color-key-shade);
}
/* Large window step: 1920 x 1080 gets bigger type and keys, not a wider line. */
@media (min-height: 950px) and (min-width: 1600px) {
  :root { ${Object.entries(sizes.large).map(([k, v]) => `--${k}: ${v};`).join(' ')} }
}
:root, [data-theme="light"] {
  color-scheme: light;
${colorBlock(themes.light)}
}
[data-theme="dark"] {
  color-scheme: dark;
${colorBlock(themes.dark)}
}
`;
}

export function tokensJson() {
  const leaf = (type) => (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { $type: type, $value: v }]));
  const colors = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { $type: 'color', $value: v, hex: hex(v) }]));
  return `${JSON.stringify({
    $description: 'Keymind design tokens, direction Relief. Generated by design/_build. Hex values are sRGB conversions of the OKLCH source.',
    color: { light: colors(themes.light), dark: colors(themes.dark) },
    font: { family: leaf('fontFamily')(scale.font), weight: leaf('fontWeight')(scale.weight), size: leaf('dimension')(scale.text) },
    space: leaf('dimension')(scale.space),
    radius: leaf('dimension')(scale.radius),
    control: leaf('dimension')(scale.control),
    size: {
      $description: 'Typing-screen sizes. "large" applies from 1600 x 950 up.',
      base: leaf('dimension')(sizes.base),
      large: leaf('dimension')(sizes.large),
    },
    motion: { ease: leaf('cubicBezier')(scale.ease), duration: leaf('duration')(scale.dur) },
    z: leaf('number')(scale.z),
  }, null, 2)}\n`;
}
