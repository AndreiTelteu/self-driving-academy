// PBI 243: culoarea medie a unei benzi de cer (rândurile 100–300, coloanele 100–700, fără overlay)
// și a benzii de orizont (rândurile 470–490) pe fiecare preset/backend; pentru `city-aerial`, banda de
// cer de sus (rândurile 5–25). Decodorul PNG este cel din scripts/visual-compare.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../../../scripts/visual-compare.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const band = (image, x0, x1, y0, y1) => {
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      for (let channel = 0; channel < 3; channel += 1)
        sum[channel] += image.rgba[(y * image.width + x) * 4 + channel];
      count += 1;
    }
  return sum.map((value) => +(value / count).toFixed(1)).join(',');
};
const sets = ['after-high-webgpu', 'after-medium-webgpu', 'after-high-webgl2', 'after-low-webgl2'];
for (const view of ['horizon', 'city-aerial'])
  for (const set of sets) {
    const image = decodePng(readFileSync(`${root}${set}/${view}.png`));
    const text =
      view === 'horizon'
        ? `cer RGB ${band(image, 100, 700, 100, 300)}  orizont RGB ${band(image, 100, 700, 470, 490)}`
        : `cer sus RGB ${band(image, 100, 500, 5, 25)}`;
    console.log(view.padEnd(12), set.padEnd(22), text);
  }
