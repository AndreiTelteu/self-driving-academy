// Mediana (și min–max) a mediei intervalului de cadru, pe 3 rulări intercalate, per vedere.
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('./perf-runs/', import.meta.url);
const groups = {};
for (const name of readdirSync(dir).filter((n) => /-r\d\.json$/.test(n))) {
  const report = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
  for (const view of report.views)
    ((groups[`${report.preset} ${report.backend}`] ??= {})[view.id] ??= {})[report.label] ??= [];
  for (const view of report.views)
    groups[`${report.preset} ${report.backend}`][view.id][report.label].push(view.meanMs);
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const lines = [];
for (const [config, views] of Object.entries(groups)) {
  lines.push(`## ${config} (3 rulări intercalate, 1920x1080, fără vsync; mediana mediilor, [min–max])`);
  let before = 0;
  let after = 0;
  for (const [id, runs] of Object.entries(views)) {
    const b = median(runs.before);
    const a = median(runs.after);
    before += b;
    after += a;
    const range = (x) => `[${Math.min(...x).toFixed(2)}–${Math.max(...x).toFixed(2)}]`;
    lines.push(`${id.padEnd(24)} înainte ${b.toFixed(2)} ms ${range(runs.before)}  după ${a.toFixed(2)} ms ${range(runs.after)}  Δ ${(a - b >= 0 ? '+' : '') + (a - b).toFixed(2)} ms`);
  }
  const n = Object.keys(views).length;
  lines.push(`MEDIE pe ${n} vederi: înainte ${(before / n).toFixed(2)} ms, după ${(after / n).toFixed(2)} ms\n`);
}
console.log(lines.join('\n'));
