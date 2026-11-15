import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
// @ts-expect-error script .mjs fără declarații de tipuri
import { compareImages, decodePng } from '../../scripts/visual-compare.mjs';

function png(width: number, height: number, rgb: (x: number, y: number) => number[]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) raw.set(rgb(x, y), y * (width * 3 + 1) + 1 + x * 3);
  const chunk = (type: string, data: Buffer): Buffer => {
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
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('239: compararea numără pixelii peste toleranță și ignoră zgomotul mic', () => {
  const base = decodePng(png(10, 10, () => [100, 100, 100]));
  const noisy = decodePng(png(10, 10, () => [102, 100, 99]));
  const changed = decodePng(png(10, 10, (x) => (x < 2 ? [200, 0, 0] : [100, 100, 100])));
  assert.equal(compareImages(base, base, 4).percent, 0);
  assert.equal(compareImages(base, noisy, 4).percent, 0);
  assert.equal(compareImages(base, changed, 4).percent, 20);
  const other = decodePng(png(5, 5, () => [0, 0, 0]));
  assert.equal(compareImages(base, other, 4).comparable, false);
});
