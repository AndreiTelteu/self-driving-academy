// Inspect GLB files: JSON chunk summary (nodes, meshes, materials, animations, bounds).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = 'public/assets/models';

function readGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error('not glb');
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    offset += 8 + chunkLength;
  }
  return { version, total, json };
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.glb')) out.push(full);
  }
  return out;
}

for (const file of walk(root)) {
  const { version, total, json } = readGlb(file);
  const meshes = json.meshes?.length ?? 0;
  const nodes = json.nodes?.length ?? 0;
  const materials = json.materials?.length ?? 0;
  const animations = (json.animations ?? []).map((a) => a.name ?? '(unnamed)');
  const nodeNames = (json.nodes ?? [])
    .map((n) => n.name)
    .filter(Boolean)
    .slice(0, 12);
  const accessors = json.accessors ?? [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const posIdx = prim.attributes?.POSITION;
      if (posIdx == null) continue;
      const acc = accessors[posIdx];
      if (acc?.min && acc?.max) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], acc.min[i]);
          max[i] = Math.max(max[i], acc.max[i]);
        }
      }
    }
  }
  console.log(`\n=== ${file}`);
  console.log(
    `  bytes=${total} glTF v${version} nodes=${nodes} meshes=${meshes} materials=${materials}`,
  );
  console.log(`  animations(${animations.length}): ${animations.join(', ') || 'none'}`);
  console.log(`  node names: ${nodeNames.join(', ')}`);
  if (Number.isFinite(min[0])) {
    console.log(
      `  bounds: min=[${min.map((v) => v.toFixed(2))}] max=[${max.map((v) => v.toFixed(2))}] size=[${max
        .map((v, i) => (v - min[i]).toFixed(2))
        .join(', ')}]`,
    );
  }
  const images = json.images?.length ?? 0;
  console.log(`  images=${images} buffers=${json.buffers?.length ?? 0}`);
}
