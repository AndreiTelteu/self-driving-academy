// Costul umbrelor si al AO, separat (PBI 244): media pe 5 vederi a intervalului de cadru (ms), fara vsync,
// GPU real amd rdna-2, WebGPU, 1920x1080 DPR1. O singura rulare per configuratie (vezi perf-runs/ pentru
// cele 3 rulari intercalate inainte/dupa). Zgomot tipic intre rulari: +-0.5-1 ms.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('./diag/', import.meta.url);
const rows = [];
for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
  const avg = r.views.reduce((s, v) => s + v.meanMs, 0) / r.views.length;
  rows.push(`${name.padEnd(28)} ${r.preset.padEnd(6)} shadows=${r.shadows} ao=${r.ao} move=${r.move ?? false}  medie ${avg.toFixed(2)} ms  (${r.views.map((v) => v.meanMs.toFixed(1)).join(' / ')})`);
}
console.log(rows.join('\n'));
