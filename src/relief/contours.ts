/** A smooth random field drawn as contour lines, which is the signature of the Relief design. */
export interface ContourOptions {
  seed: number;
  /** Grid cells per unit of ground. */
  density: number;
  /** Width and height of the ground, in key pitches. */
  width?: number;
  height?: number;
  /** Hills on top of the noise: x, y and height. */
  hills?: readonly (readonly [number, number, number])[];
}

export interface Contours {
  viewBox: string;
  /** Path data of the thin lines, and of every fifth line, which is bold. */
  thin: string;
  bold: string;
}

const LATTICE = 40;

function randomLattice(seed: number): number[][] {
  let state = seed;
  const next = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const lattice: number[][] = [];
  for (let j = 0; j <= LATTICE; j += 1) {
    lattice[j] = [];
    for (let i = 0; i <= LATTICE; i += 1) {
      lattice[j][i] = next();
    }
  }
  return lattice;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Marching squares: each grid cell crossed by a level gets one or two short segments. */
export function contours({
  seed,
  density,
  width = 30,
  height = 5.6,
  hills = [],
}: ContourOptions): Contours {
  const nx = Math.round(width * density);
  const ny = Math.round(height * density);
  const lattice = randomLattice(seed);

  const noise = (x: number, y: number): number => {
    const xi = Math.floor(x) % LATTICE;
    const yi = Math.floor(y) % LATTICE;
    const fx = smooth(x - Math.floor(x));
    const fy = smooth(y - Math.floor(y));
    const a = lattice[yi][xi];
    const b = lattice[yi][xi + 1];
    const c = lattice[yi + 1][xi];
    const d = lattice[yi + 1][xi + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const field = (x: number, y: number): number => {
    let value =
      (noise(x * 0.16 + 3, y * 0.26 + 5) * 0.62 +
        noise(x * 0.42 + 9, y * 0.62 + 2) * 0.2) *
      1.05;
    for (const [hx, hy, amount] of hills) {
      const dy = (y - hy) * 1.35;
      value += amount * Math.exp(-((x - hx) ** 2 + dy * dy) / 1.25);
    }
    return value;
  };

  const grid: number[][] = [];
  for (let j = 0; j <= ny; j += 1) {
    grid[j] = [];
    for (let i = 0; i <= nx; i += 1) {
      grid[j][i] = field((i / nx) * width, (j / ny) * height);
    }
  }

  const viewWidth = 1000;
  const viewHeight = (1000 * height) / width;
  const sx = viewWidth / nx;
  const sy = viewHeight / ny;
  const segment = (p: number[], q: number[]): string =>
    `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`;

  let thin = "";
  let bold = "";
  let index = 0;
  for (let level = 0.22; level < 2; level += 0.1) {
    let path = "";
    const at = (p: number, q: number) => (level - p) / (q - p);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const a = grid[j][i];
        const b = grid[j][i + 1];
        const c = grid[j + 1][i + 1];
        const e = grid[j + 1][i];
        const points: number[][] = [];
        if (a < level !== b < level) {
          points.push([(i + at(a, b)) * sx, j * sy]);
        }
        if (b < level !== c < level) {
          points.push([(i + 1) * sx, (j + at(b, c)) * sy]);
        }
        if (e < level !== c < level) {
          points.push([(i + at(e, c)) * sx, (j + 1) * sy]);
        }
        if (a < level !== e < level) {
          points.push([i * sx, (j + at(a, e)) * sy]);
        }
        if (points.length >= 2) {
          path += segment(points[0], points[1]);
        }
        if (points.length === 4) {
          path += segment(points[2], points[3]);
        }
      }
    }
    if (index % 5 === 4) {
      bold += path;
    } else {
      thin += path;
    }
    index += 1;
  }
  return {
    viewBox: `0 0 ${viewWidth} ${viewHeight.toFixed(0)}`,
    thin,
    bold,
  };
}
