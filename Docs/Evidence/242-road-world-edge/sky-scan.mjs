/**
 * PBI 242 — numără pixelii de culoarea cerului (clearColor) de sub orizont în cadrele 239.
 *
 * Metodă: regiunea de cer conectată de marginea de sus (flood fill pe 4 vecini cu diferență ≤ 2/255,
 * ca să urmărească gradientul vignetei) dă orizontul H = mediana, pe coloane, a celui mai de jos
 * pixel de cer. Se numără pixelii care NU fac parte din regiune, dar au culoarea cerului din
 * coloana lor (toleranță 8/255 pe canal) la mai mult de 60 px sub H, în afara casetelor de UI.
 * Folosire: node sky-scan.mjs <director-capturi> [...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from '../../../scripts/visual-compare.mjs';

const TOLERANCE = 8;
const MARGIN_PX = 60;
const UI_BOXES = [
  [735, 10, 1185, 76],
  [5, 960, 500, 1075],
  [1805, 1030, 1910, 1066],
];

function scan(file) {
  const { width, height, rgba } = decodePng(readFileSync(file));
  const inUi = (x, y) => UI_BOXES.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const close = (a, b, tolerance) =>
    Math.abs(rgba[a * 4] - rgba[b * 4]) <= tolerance &&
    Math.abs(rgba[a * 4 + 1] - rgba[b * 4 + 1]) <= tolerance &&
    Math.abs(rgba[a * 4 + 2] - rgba[b * 4 + 2]) <= tolerance;
  // Cerul are gradient (vigneta): se crește regiunea de la marginea de sus pe diferențe mici între vecini.
  const connected = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) {
    connected[x] = 1;
    stack.push(x);
  }
  while (stack.length) {
    const index = stack.pop();
    const x = index % width;
    const y = (index - x) / width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (connected[next]) continue;
      if (inUi(nx, ny) || close(index, next, 2)) {
        connected[next] = 1;
        stack.push(next);
      }
    }
  }
  const lowest = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x += 1)
    for (let y = 0; y < height; y += 1) if (connected[y * width + x] && !inUi(x, y)) lowest[x] = y;
  const rows = [...lowest].filter((row) => row >= 0).sort((a, b) => a - b);
  if (rows.length === 0) return { horizonRow: null, skyBelow: 0 };
  const horizonRow = rows[Math.floor(rows.length / 2)];
  let skyBelow = 0;
  for (let x = 0; x < width; x += 1) {
    if (lowest[x] < 0) continue;
    const reference = lowest[x] * width + x;
    for (let y = horizonRow + MARGIN_PX + 1; y < height; y += 1) {
      if (inUi(x, y)) continue;
      if (!connected[y * width + x] && close(y * width + x, reference, TOLERANCE)) skyBelow += 1;
    }
  }
  if (process.env.SKY_SCAN_CLUSTERS) {
    const seen = new Uint8Array(width * height);
    const out = [];
    for (let x0 = 0; x0 < width; x0 += 1) {
      if (lowest[x0] < 0) continue;
      const reference = lowest[x0] * width + x0;
      for (let y0 = horizonRow + MARGIN_PX + 1; y0 < height; y0 += 1) {
        const start = y0 * width + x0;
        if (seen[start] || inUi(x0, y0) || connected[start] || !close(start, reference, TOLERANCE)) continue;
        let minX = x0, maxX = x0, minY = y0, maxY = y0, size = 0;
        const queue = [start];
        seen[start] = 1;
        while (queue.length) {
          const index = queue.pop();
          const x = index % width;
          const y = (index - x) / width;
          size += 1;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = ny * width + nx;
            if (!seen[next] && !connected[next] && !inUi(nx, ny) && close(next, reference, TOLERANCE)) {
              seen[next] = 1;
              queue.push(next);
            }
          }
        }
        out.push({ size, box: [minX, minY, maxX, maxY] });
      }
    }
    out.sort((a, b) => b.size - a.size);
    console.log(file.split(/[\/]/).pop(), JSON.stringify(out.slice(0, 4)));
  }
  return { horizonRow, skyBelow };
}

for (const directory of process.argv.slice(2)) {
  const rows = [];
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.png')).sort()) {
    if (name === 'ui-hud.png') continue;
    const result = scan(join(directory, name));
    rows.push({ frame: name.replace('.png', ''), ...result });
  }
  const total = rows.reduce((sum, row) => sum + row.skyBelow, 0);
  console.log(`# ${directory}`);
  for (const row of rows)
    console.log(
      `${row.frame.padEnd(26)} orizont ${String(row.horizonRow).padStart(5)}  cer sub orizont ${String(row.skyBelow).padStart(8)} px`,
    );
  console.log(`TOTAL cer sub orizont: ${total} px\n`);
}
