import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { crc32 } from '../js/crc32.js';
import { encodeRgbPng, pngInfo } from '../js/png.js';
import { zip } from '../js/zip.js';
import { checkAsset } from '../js/rules.js';
import { fitText, wrapBalanced } from '../js/text.js';

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('encodeRgbPng writes a 24-bit PNG whose pixels round-trip', async () => {
  // 3x2 RGBA, with alpha that must be dropped.
  const rgba = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0,
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
  ]);
  const png = await encodeRgbPng(rgba, 3, 2);
  assert.deepEqual(pngInfo(png), { width: 3, height: 2, colorType: 2 });

  // Find IDAT, inflate, undo the "Up" filter and compare RGB.
  let at = 8;
  let idat;
  while (at < png.length) {
    const len = new DataView(png.buffer, png.byteOffset + at).getUint32(0);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === 'IDAT') idat = png.subarray(at + 8, at + 8 + len);
    at += 12 + len;
  }
  const raw = inflateSync(idat);
  const stride = 9;
  let prev = new Uint8Array(stride);
  const rows = [];
  for (let y = 0; y < 2; y++) {
    assert.equal(raw[y * (stride + 1)], 2, 'filter type is Up');
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) row[i] = (raw[y * (stride + 1) + 1 + i] + prev[i]) & 0xff;
    rows.push([...row]);
    prev = row;
  }
  assert.deepEqual(rows, [
    [255, 0, 0, 0, 255, 0, 0, 0, 255],
    [10, 20, 30, 40, 50, 60, 70, 80, 90],
  ]);
});

test('zip writes stored entries with correct headers and CRCs', () => {
  const a = new TextEncoder().encode('hello');
  const b = new Uint8Array([1, 2, 3]);
  const out = zip([
    { name: 'a.txt', data: a },
    { name: 'dir/b.bin', data: b },
  ]);
  const v = new DataView(out.buffer);
  const end = out.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);

  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(14, true), crc32(a));
  assert.equal(new TextDecoder().decode(out.subarray(30, 35)), 'a.txt');
  assert.deepEqual([...out.subarray(35, 40)], [...a]);

  const second = 30 + 5 + a.length;
  assert.equal(v.getUint32(second, true), 0x04034b50);
  assert.equal(v.getUint32(second + 14, true), crc32(b));
});

test('checkAsset enforces Play sizes, ratios and alpha', () => {
  assert.deepEqual(checkAsset('icon', { width: 512, height: 512, bytes: 1000, colorType: 2 }), []);
  assert.equal(checkAsset('icon', { width: 500, height: 512, bytes: 1000 }).length, 1);
  assert.deepEqual(checkAsset('feature', { width: 1024, height: 500, bytes: 1000, colorType: 2 }), []);
  assert.match(checkAsset('feature', { width: 1024, height: 500, bytes: 1000, colorType: 6 })[0], /alpha/);
  assert.deepEqual(checkAsset('screenshot', { width: 1080, height: 1920, bytes: 1000 }), []);
  assert.match(checkAsset('screenshot', { width: 1080, height: 2424, bytes: 1000 })[0], /aspect ratio/);
  assert.match(checkAsset('screenshot', { width: 300, height: 500, bytes: 1000 })[0], /under 320px/);
});

// Each character is 10px wide.
const mono = (str) => str.length * 10;

test('wrapBalanced keeps short text on one line', () => {
  assert.deepEqual(wrapBalanced('Share your streak', 400, 2, mono), ['Share your streak']);
});

test('wrapBalanced balances two lines', () => {
  assert.deepEqual(wrapBalanced('Log your morning in a minute', 200, 2, mono), ['Log your morning', 'in a minute']);
});

test('wrapBalanced returns null when even two lines overflow', () => {
  assert.equal(wrapBalanced('Supercalifragilistic expialidocious', 100, 2, mono), null);
});

test('fitText shrinks the size until the text fits', () => {
  // At size s each character is s/2 px wide.
  const measureAt = (size) => (str) => (str.length * size) / 2;
  const r = fitText('Track your 28-day challenge', { max: 76, min: 40, maxWidth: 500, maxLines: 2 }, measureAt);
  assert.equal(r.fits, true);
  assert.ok(r.size <= 76 && r.size >= 40);
  assert.ok(r.lines.length <= 2);
  assert.ok(r.lines.every((l) => (l.length * r.size) / 2 <= 500));
});

test('every decoration in the form has a renderer, and vice versa', async () => {
  const { readFile } = await import('node:fs/promises');
  const { DECORATIONS } = await import('../js/render.js');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const select = html.match(/<select name="decor">([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options.sort(), Object.keys(DECORATIONS).sort());
});
