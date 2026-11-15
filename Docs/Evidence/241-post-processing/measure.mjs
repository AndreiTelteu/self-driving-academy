// PBI 241: luminanță medie per cadru 239 (fără ui-hud): WebGPU↔WebGL2 și LOW/MEDIUM↔HIGH, plus pixeli albi.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from '../../../scripts/visual-compare.mjs';
const root = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const stat = (i) => {
  const d = i.rgba ?? i.data, n = i.width * i.height;
  let s = 0, white = 0;
  for (let p = 0; p < n; p++) {
    s += 0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2];
    if (d[p * 4] >= 250 && d[p * 4 + 1] >= 250 && d[p * 4 + 2] >= 250) white++;
  }
  return { mean: s / n, white: white / n };
};
const data = {};
for (const preset of ['high', 'medium', 'low'])
  for (const backend of ['webgpu', 'webgl2']) {
    const dir = join(root, `after-${preset}-${backend}`);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.png') && x !== 'ui-hud.png'))
      (data[`${preset}-${backend}`] ??= {})[f.slice(0, -4)] = stat(decodePng(readFileSync(join(dir, f))));
  }
const views = Object.keys(data['high-webgpu']);
const pct = (a, b) => (Math.abs(a - b) / 255) * 100;
const rows = [];
const report = (label, pairs) => {
  const diffs = views.map((v) => pct(...pairs(v)));
  rows.push(`${label}: mean ${(diffs.reduce((s, x) => s + x, 0) / diffs.length).toFixed(3)}% max ${Math.max(...diffs).toFixed(3)}% (${views[diffs.indexOf(Math.max(...diffs))]})`);
};
for (const p of ['high', 'medium', 'low']) report(`WebGPU vs WebGL2 ${p}`, (v) => [data[`${p}-webgpu`][v].mean, data[`${p}-webgl2`][v].mean]);
for (const b of ['webgpu', 'webgl2']) for (const p of ['low', 'medium']) report(`${p.toUpperCase()} vs HIGH ${b}`, (v) => [data[`${p}-${b}`][v].mean, data[`high-${b}`][v].mean]);
for (const k of Object.keys(data)) rows.push(`white% ${k}: ${((views.reduce((s, v) => s + data[k][v].white, 0) / views.length) * 100).toFixed(2)}`);
console.log(rows.join('\n'));
console.log('per view mean luminance (0-255), LOW/MEDIUM/HIGH on WebGPU:');
for (const v of views) console.log(v.padEnd(24), ['low', 'medium', 'high'].map((p) => data[`${p}-webgpu`][v].mean.toFixed(1)).join(' / '));
