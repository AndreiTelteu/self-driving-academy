// PBI 243: culoarea medie pe petice 9x9 (asfalt, trotuar, iarbă, clădire/acoperiș) înainte/după.
// Folosire: node ground-brightness.mjs <setÎnainte> <setDupă> (directoare din acest folder).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../../../scripts/visual-compare.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const PATCHES = {
  'street-eye-level': { asfalt: [1500, 950], trotuar: [1000, 950], iarbă: [200, 800], clădire: [600, 520] },
  horizon: { asfalt: [700, 900], trotuar: [1500, 900], iarbă: [150, 700], clădire: [1400, 500] },
  'city-aerial': { asfalt: [960, 960], iarbă: [300, 400], clădire: [1100, 800], 'perete': [1100, 870] },
};
const mean = (image, [cx, cy]) => {
  const sum = [0, 0, 0];
  for (let y = cy - 4; y <= cy + 4; y += 1)
    for (let x = cx - 4; x <= cx + 4; x += 1)
      for (let c = 0; c < 3; c += 1) sum[c] += image.rgba[(y * image.width + x) * 4 + c] / 81;
  return sum;
};
const [beforeSet, afterSet] = process.argv.slice(2);
let worst = 0;
for (const [view, patches] of Object.entries(PATCHES)) {
  let before, after;
  try {
    before = decodePng(readFileSync(`${root}${beforeSet}/${view}.png`));
    after = decodePng(readFileSync(`${root}${afterSet}/${view}.png`));
  } catch {
    continue;
  }
  for (const [name, point] of Object.entries(patches)) {
    const b = mean(before, point), a = mean(after, point);
    const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const delta = ((lum(a) - lum(b)) / lum(b)) * 100;
    worst = Math.min(worst, delta);
    console.log(view.padEnd(17), name.padEnd(8), 'înainte', b.map((v) => v.toFixed(0)).join(','), 'după', a.map((v) => v.toFixed(0)).join(','), `Δlum ${delta.toFixed(1)}%`);
  }
}
console.log(`cea mai mare scădere: ${worst.toFixed(1)}%`);
