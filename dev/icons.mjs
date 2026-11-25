// Draws the house icon as PNG files in docs/.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
function chunk(type, data) {
  const t = Buffer.concat([Buffer.from(type), data]), o = Buffer.alloc(8 + t.length);
  o.writeUInt32BE(data.length, 0); t.copy(o, 4); o.writeUInt32BE(crc32(t), 4 + t.length);
  return o;
}
for (const n of [180, 192, 512]) {
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const roof = v > 0.22 && v < 0.5 && Math.abs(u - 0.5) < (v - 0.22) * 1.15;
    const wall = v >= 0.5 && v < 0.76 && Math.abs(u - 0.5) < 0.23;
    const door = v > 0.58 && v < 0.76 && Math.abs(u - 0.5) < 0.065;
    const c = door ? [242, 190, 92] : roof || wall ? [243, 245, 239] : [47, 111, 94];
    c.forEach((k, i) => { raw[y * (n * 3 + 1) + 1 + x * 3 + i] = k; });
  }
  const h = Buffer.alloc(13); h.writeUInt32BE(n, 0); h.writeUInt32BE(n, 4); h[8] = 8; h[9] = 2;
  writeFileSync(`docs/icon-${n}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', h), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
