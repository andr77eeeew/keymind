// Generates design/tokens.*, design/screens/*.html. Run: node design/_build/build.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, contrastPairs, themes, tokensCss, tokensJson } from './tokens.mjs';
import { typingPages } from './screens-typing.mjs';
import { dataPages } from './screens-data.mjs';
import { progressPages } from './screens-progress.mjs';
import { sessionPages } from './screens-session.mjs';
import { componentsPage, galleryPage } from './screens-system.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const design = join(here, '..');
const screens = join(design, 'screens');

writeFileSync(join(design, 'tokens.css'), tokensCss());
writeFileSync(join(design, 'tokens.json'), tokensJson());

const pages = { ...typingPages, ...dataPages, ...progressPages, ...sessionPages, components: componentsPage, index: galleryPage };
for (const [name, html] of Object.entries(pages)) writeFileSync(join(screens, `${name}.html`), html);
console.log(`${Object.keys(pages).length} pages written`);

let failed = 0;
for (const [mode, t] of Object.entries(themes)) {
  for (const [a, b, min] of contrastPairs) {
    const ratio = contrast(t[a], t[b]);
    if (ratio < min) { failed += 1; console.log(`FAIL ${mode}: ${a} on ${b} = ${ratio.toFixed(2)} (needs ${min})`); }
  }
}
console.log(failed ? `${failed} contrast failures` : `contrast: ${contrastPairs.length * 2} pairs pass`);
