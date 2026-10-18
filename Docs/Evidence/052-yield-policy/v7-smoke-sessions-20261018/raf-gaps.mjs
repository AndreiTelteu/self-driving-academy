import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => /^arm-\d+-rafTime-\d+\.json$/.test(f));
const per = new Map();
for (const f of files) {
  const arm = Number(f.match(/^arm-(\d+)-/)[1]);
  const v = JSON.parse(readFileSync(dir + '/' + f, 'utf8'));
  const list = per.get(arm) ?? [];
  for (const n of v.numbers) list.push(n);
  per.set(arm, list);
}
for (const arm of [...per.keys()].sort((a, b) => a - b)) {
  const t = per.get(arm);
  let maxGap = 0,
    gapAt = 0,
    sum = 0;
  for (let i = 1; i < t.length; i++) {
    const g = t[i] - t[i - 1];
    sum += g;
    if (g > maxGap) {
      maxGap = g;
      gapAt = t[i - 1];
    }
  }
  const mean = t.length > 1 ? sum / (t.length - 1) : 0;
  console.log(
    'arm',
    String(arm).padStart(2),
    'samples=' + String(t.length).padStart(5),
    'meanGap=' + mean.toFixed(3),
    'maxGap=' + maxGap.toFixed(3),
    'at=' + gapAt.toFixed(1),
  );
}
