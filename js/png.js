// Encodes RGBA pixels as a 24-bit RGB PNG (no alpha channel).
//
// Canvas `toBlob('image/png')` always writes RGBA. Google Play asks for the
// feature graphic as JPEG or 24-bit PNG without alpha, so every asset is
// written through this encoder instead. Compression uses the platform's
// zlib (`CompressionStream('deflate')`), available in browsers and Node.
import { crc32 } from './crc32.js';

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Uint8ClampedArray|Uint8Array} rgba width*height*4 bytes
 * @returns {Promise<Uint8Array>} PNG file bytes
 */
export async function encodeRgbPng(rgba, width, height) {
  const stride = width * 3;
  // Filter type 2 ("Up") on every row: much smaller than unfiltered for UI art.
  const raw = new Uint8Array((stride + 1) * height);
  let prev = new Uint8Array(stride);
  let row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      row[x * 3] = rgba[s];
      row[x * 3 + 1] = rgba[s + 1];
      row[x * 3 + 2] = rgba[s + 2];
    }
    const o = y * (stride + 1);
    raw[o] = 2;
    for (let i = 0; i < stride; i++) raw[o + 1 + i] = (row[i] - prev[i]) & 0xff;
    [prev, row] = [row, prev];
  }

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Reads width, height and colour type from PNG bytes. */
export function pngInfo(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20), colorType: bytes[25] };
}
