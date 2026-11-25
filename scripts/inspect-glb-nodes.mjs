import { readFileSync } from 'node:fs';

function readGlb(path) {
  const buf = readFileSync(path);
  let offset = 12;
  let json = null;
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    offset += 8 + chunkLength;
  }
  return json;
}

for (const file of [
  'public/assets/models/vehicles/taxi.glb',
  'public/assets/models/vehicles/sedan.glb',
]) {
  const json = readGlb(file);
  console.log(`\n=== ${file}`);
  (json.nodes ?? []).forEach((n, i) => {
    const t = n.translation ? `t=[${n.translation.map((v) => v.toFixed(2))}]` : '';
    const r = n.rotation ? `r=[${n.rotation.map((v) => v.toFixed(2))}]` : '';
    const s = n.scale ? `s=[${n.scale.map((v) => v.toFixed(2))}]` : '';
    console.log(`  [${i}] ${n.name ?? '(unnamed)'} mesh=${n.mesh ?? '-'} ${t} ${r} ${s}`);
  });
}
