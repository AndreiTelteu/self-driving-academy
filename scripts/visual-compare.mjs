import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

/**
 * PBI 239 — comparația înainte/după: `npm run visual:compare -- <before> <after> [--out <dir>]
 * [--tolerance <0-255>] [--max-percent <p>]`.
 *
 * Citește `manifest.json` din ambele directoare, decodifică PNG-urile cu `node:zlib` (fără
 * dependențe), numără pixelii a căror cea mai mare diferență pe canal depășește toleranța
 * (implicit 4/255, sub zgomotul de cuantizare al animației) și scrie `compare.html` cu perechi
 * alăturate, harta diferențelor (`diff/<id>.png`) și procentul per cadru. Cu `--max-percent`
 * iese cu cod 1 dacă vreun cadru depășește pragul (0,5 = pragul 239 pentru aceeași revizie).
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decodor PNG minimal: 8 biți, non-interlaced, tipuri de culoare 0/2/3/4/6 (cele din Chromium). */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Nu este PNG.');
  let offset = 8;
  let header = null;
  let palette = null;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR')
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  if (!header) throw new Error('PNG fără IHDR.');
  if (header.depth !== 8 || header.interlace !== 0)
    throw new Error('PNG nesuportat (doar 8 biți, fără interlacing).');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.color];
  if (!channels) throw new Error(`Tip de culoare PNG nesuportat: ${header.color}`);
  const raw = inflateSync(Buffer.concat(parts));
  const stride = header.width * channels;
  const pixels = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[x - channels] : 0;
      const above = up ? up[x] : 0;
      const corner = up && x >= channels ? up[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = (left + above) >> 1;
      else if (filter === 4) {
        const estimate = left + above - corner;
        const dl = Math.abs(estimate - left);
        const da = Math.abs(estimate - above);
        const dc = Math.abs(estimate - corner);
        predictor = dl <= da && dl <= dc ? left : da <= dc ? above : corner;
      }
      out[x] = (row[x] + predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let index = 0; index < header.width * header.height; index += 1) {
    const source = index * channels;
    let r;
    let g;
    let b;
    let a = 255;
    if (header.color === 0) r = g = b = pixels[source];
    else if (header.color === 4) {
      r = g = b = pixels[source];
      a = pixels[source + 1];
    } else if (header.color === 3) {
      const entry = pixels[source] * 3;
      r = palette[entry];
      g = palette[entry + 1];
      b = palette[entry + 2];
    } else {
      r = pixels[source];
      g = pixels[source + 1];
      b = pixels[source + 2];
      if (header.color === 6) a = pixels[source + 3];
    }
    rgba.set([r, g, b, a], index * 4);
  }
  return { width: header.width, height: header.height, rgba };
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Procentul pixelilor diferiți și harta diferențelor (roșu = diferit, gri = identic). */
export function compareImages(before, after, tolerance) {
  if (before.width !== after.width || before.height !== after.height)
    return { comparable: false, percent: 100, differing: before.width * before.height, diff: null };
  const total = before.width * before.height;
  const diff = Buffer.alloc(total * 4);
  let differing = 0;
  for (let index = 0; index < total; index += 1) {
    const p = index * 4;
    const delta = Math.max(
      Math.abs(before.rgba[p] - after.rgba[p]),
      Math.abs(before.rgba[p + 1] - after.rgba[p + 1]),
      Math.abs(before.rgba[p + 2] - after.rgba[p + 2]),
    );
    if (delta > tolerance) {
      differing += 1;
      diff.set([255, 32, 32, 255], p);
    } else {
      const grey = Math.round(
        (before.rgba[p] * 0.299 + before.rgba[p + 1] * 0.587 + before.rgba[p + 2] * 0.114) * 0.35 +
          120,
      );
      diff.set([grey, grey, grey, 255], p);
    }
  }
  return { comparable: true, percent: (differing / total) * 100, differing, diff };
}

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

export async function run(argv) {
  const positional = [];
  const options = { out: null, tolerance: 4, maxPercent: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = resolve(argv[(index += 1)]);
    else if (arg === '--tolerance') options.tolerance = Number(argv[(index += 1)]);
    else if (arg === '--max-percent') options.maxPercent = Number(argv[(index += 1)]);
    else if (arg.startsWith('--')) throw new Error(`Argument necunoscut: ${arg}`);
    else positional.push(resolve(arg));
  }
  if (positional.length !== 2)
    throw new Error('Folosire: visual:compare <before> <after> [--out <dir>]');
  const [beforeDir, afterDir] = positional;
  const readManifest = async (dir) =>
    JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const beforeManifest = await readManifest(beforeDir);
  const afterManifest = await readManifest(afterDir);
  const out =
    options.out ?? join(afterDir, '..', `compare-${basename(beforeDir)}-vs-${basename(afterDir)}`);
  await mkdir(join(out, 'diff'), { recursive: true });
  const beforeById = new Map(beforeManifest.views.map((view) => [view.id, view]));
  const rows = [];
  for (const view of afterManifest.views) {
    const left = beforeById.get(view.id);
    const rightPath = join(afterDir, view.file);
    if (!left || !existsSync(join(beforeDir, left.file)) || !existsSync(rightPath)) {
      rows.push({ id: view.id, title: view.title, missing: true, percent: 100 });
      continue;
    }
    const afterImage = decodePng(await readFile(rightPath));
    const result = compareImages(
      decodePng(await readFile(join(beforeDir, left.file))),
      afterImage,
      options.tolerance,
    );
    let diffFile = null;
    if (result.diff) {
      diffFile = `diff/${view.id}.png`;
      await writeFile(
        join(out, diffFile),
        encodePng(afterImage.width, afterImage.height, result.diff),
      );
    }
    rows.push({
      id: view.id,
      title: view.title,
      percent: result.percent,
      differing: result.differing,
      comparable: result.comparable,
      before: relative(out, join(beforeDir, left.file)).replaceAll('\\', '/'),
      after: relative(out, rightPath).replaceAll('\\', '/'),
      diff: diffFile,
      beforeCpuMs: left.cpuRenderMs?.meanMs ?? null,
      afterCpuMs: view.cpuRenderMs?.meanMs ?? null,
    });
  }
  const describe = (manifest) =>
    `${manifest.preset} / ${manifest.backend?.actual} / ${manifest.backend?.renderer} / ${String(manifest.commit).slice(0, 8)}${manifest.sourceDirty ? '+local' : ''}`;
  const worst = rows.reduce((max, row) => Math.max(max, row.percent), 0);
  const html = `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>Comparație capturi V4</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:1.5rem;background:#10161a;color:#e6edf0}
h1{margin:0 0 .25rem}.meta{color:#9fb3bd;margin:.1rem 0}
table.sum{border-collapse:collapse;margin:1rem 0}.sum td,.sum th{border:1px solid #2c3a42;padding:.25rem .6rem;text-align:left}
.pair{margin:1.5rem 0}.pair h2{font-size:1rem;margin:.2rem 0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}
.grid figure{margin:0}.grid img{width:100%;display:block;background:#000}figcaption{color:#9fb3bd;font-size:12px}
.ok{color:#7fd48a}.bad{color:#ff8a7a}
</style></head><body>
<h1>Comparație capturi V4</h1>
<p class="meta">Înainte: ${escapeHtml(describe(beforeManifest))}</p>
<p class="meta">După: ${escapeHtml(describe(afterManifest))}</p>
<p class="meta">Toleranță pe canal: ${options.tolerance}/255. Cel mai mare procent: ${worst.toFixed(3)}%.</p>
<table class="sum"><tr><th>Cadru</th><th>Pixeli diferiți</th><th>CPU render înainte (ms)</th><th>CPU render după (ms)</th></tr>
${rows
  .map(
    (row) =>
      `<tr><td><a href="#${escapeHtml(row.id)}">${escapeHtml(row.id)}</a></td><td class="${
        options.maxPercent !== null && row.percent > options.maxPercent ? 'bad' : 'ok'
      }">${row.missing ? 'lipsă' : `${row.percent.toFixed(3)}%`}</td><td>${row.beforeCpuMs?.toFixed(2) ?? '—'}</td><td>${row.afterCpuMs?.toFixed(2) ?? '—'}</td></tr>`,
  )
  .join('\n')}
</table>
${rows
  .filter((row) => !row.missing)
  .map(
    (
      row,
    ) => `<section class="pair" id="${escapeHtml(row.id)}"><h2>${escapeHtml(row.title)} — ${row.percent.toFixed(3)}% pixeli diferiți</h2>
<div class="grid">
<figure><img src="${escapeHtml(row.before)}" alt="înainte"><figcaption>înainte</figcaption></figure>
<figure><img src="${escapeHtml(row.after)}" alt="după"><figcaption>după</figcaption></figure>
${row.diff ? `<figure><img src="${escapeHtml(row.diff)}" alt="diferență"><figcaption>diferență (roșu = peste toleranță)</figcaption></figure>` : '<figure><figcaption>dimensiuni diferite</figcaption></figure>'}
</div></section>`,
  )
  .join('\n')}
</body></html>
`;
  await writeFile(join(out, 'compare.html'), html);
  await writeFile(
    join(out, 'compare.json'),
    `${JSON.stringify({ tolerance: options.tolerance, before: describe(beforeManifest), after: describe(afterManifest), views: rows.map(({ id, percent, differing, missing }) => ({ id, percent, differing: differing ?? null, missing: missing ?? false })) }, null, 2)}\n`,
  );
  for (const row of rows)
    console.log(`${row.id}: ${row.missing ? 'lipsă' : `${row.percent.toFixed(3)}%`}`);
  console.log(`Cel mai mare: ${worst.toFixed(3)}% -> ${join(out, 'compare.html')}`);
  if (options.maxPercent !== null && worst > options.maxPercent) {
    console.error(`Depășește pragul ${options.maxPercent}%.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(String(error?.stack ?? error));
    process.exit(1);
  });
}
