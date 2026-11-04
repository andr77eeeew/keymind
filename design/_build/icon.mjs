// Generates design/icon.svg, the source of the app icon. Run: node design/_build/icon.mjs
// The picture is the product in one glance: the next key, lit as on the typing screen, on a relief.
// Large sizes show the contour lines. At 16 px only the key, one ring and the tile edge remain.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icon.svg');

// An SVG icon is a standalone file, so it holds resolved colours, not token references.
const COLOR = {
  tile: '#26211c', // dark theme, paper-2
  edge: '#574e44', // keeps the tile visible on a dark taskbar
  ringNear: '#c9bfb1',
  ringFar: '#6f6558',
  key: '#ea5b1e', // light theme, accent
  keyLip: '#b8430f',
  bump: '#14110f', // light theme, ink
};

const TILE = { x: 64, y: 64, size: 896, radius: 196, edge: 20 };
const KEY = { size: 440, lip: 30, radius: 92 };
const CENTER = 512;

// One organic closed curve, sampled in polar form and smoothed with Catmull-Rom into cubic Beziers.
function contour(radius, samples = 40) {
  const points = [];
  for (let i = 0; i < samples; i += 1) {
    const angle = (i / samples) * Math.PI * 2;
    const r = radius * (1 + 0.07 * Math.sin(2 * angle + 0.9) + 0.035 * Math.sin(3 * angle + 2.4));
    points.push([CENTER + r * Math.cos(angle), CENTER + r * 0.92 * Math.sin(angle)]);
  }
  const at = (i) => points[(i + samples) % samples];
  const n = (value) => value.toFixed(1);
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 0; i < samples; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d}Z`;
}

const ring = (radius, stroke, width) => `<path d="${contour(radius)}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;

const keyX = CENTER - KEY.size / 2;
const keyY = CENTER - (KEY.size + KEY.lip) / 2;
const bump = { width: KEY.size * 0.38, height: KEY.size * 0.095 };
const inset = TILE.edge / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <title>Keymind</title>
  <defs>
    <clipPath id="tile"><rect x="${TILE.x}" y="${TILE.y}" width="${TILE.size}" height="${TILE.size}" rx="${TILE.radius}"/></clipPath>
  </defs>
  <rect x="${TILE.x}" y="${TILE.y}" width="${TILE.size}" height="${TILE.size}" rx="${TILE.radius}" fill="${COLOR.tile}"/>
  <g clip-path="url(#tile)">
    ${ring(640, COLOR.ringFar, 26)}
    ${ring(525, COLOR.ringFar, 26)}
    ${ring(356, COLOR.ringNear, 44)}
  </g>
  <rect x="${TILE.x + inset}" y="${TILE.y + inset}" width="${TILE.size - TILE.edge}" height="${TILE.size - TILE.edge}" rx="${TILE.radius - inset}" fill="none" stroke="${COLOR.edge}" stroke-width="${TILE.edge}"/>
  <rect x="${keyX}" y="${keyY + KEY.lip}" width="${KEY.size}" height="${KEY.size}" rx="${KEY.radius}" fill="${COLOR.keyLip}"/>
  <rect x="${keyX}" y="${keyY}" width="${KEY.size}" height="${KEY.size}" rx="${KEY.radius}" fill="${COLOR.key}"/>
  <rect x="${CENTER - bump.width / 2}" y="${keyY + KEY.size * 0.68}" width="${bump.width}" height="${bump.height}" rx="${bump.height / 2}" fill="${COLOR.bump}"/>
</svg>
`;

writeFileSync(out, svg);
console.log(`written ${out}`);
