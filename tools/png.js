// Minimal PNG decode/encode (RGBA8, no interlace) so art can be cropped out of
// the Kenney sheets without pulling in a native image dependency.
const fs = require('fs');
const zlib = require('zlib');

function decode(path) {
  const buf = fs.readFileSync(path);
  let p = 8;
  let w = 0, h = 0, depth = 0, ctype = 0;
  let pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'PLTE') pal = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('bit depth ' + depth + ' unsupported');
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = chans;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.slice(y * stride, (y + 1) * stride);
    line.copy(cur);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  // normalise to RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ctype === 6) { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    else if (ctype === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (ctype === 0) { r = g = b = out[i]; }
    else if (ctype === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else { const v = out[i]; r = pal[v * 3]; g = pal[v * 3 + 1]; b = pal[v * 3 + 2]; if (trns && v < trns.length) a = trns[v]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, data: rgba };
}

function encode(img, path) {
  const { w, h, data } = img;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunks = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(path, Buffer.concat(chunks));
}

let TAB = null;
function crc32(buf) {
  if (!TAB) {
    TAB = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TAB[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TAB[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let j = 0; j < h; j++) {
    const sy = y + j;
    if (sy < 0 || sy >= img.h) continue;
    for (let i = 0; i < w; i++) {
      const sx = x + i;
      if (sx < 0 || sx >= img.w) continue;
      img.data.copy(out, (j * w + i) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
    }
  }
  return { w, h, data: out };
}

function blit(dst, src, x, y) {
  // Round the destination up front: a fractional offset silently produces
  // fractional buffer indices, which copy nothing at all rather than erroring.
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < src.h; j++) {
    for (let i = 0; i < src.w; i++) {
      const dx = x + i, dy = y + j;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      const s = (j * src.w + i) * 4, d = (dy * dst.w + dx) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa === 0) continue;

      // Source-over, in STRAIGHT alpha.
      //
      // The obvious version — lerp RGB by the source's alpha and take the larger
      // of the two alphas — is quietly wrong wherever the destination is
      // transparent: it multiplies the colour down by the coverage while ALSO
      // recording that coverage, so the result is half premultiplied. Every
      // anti-aliased sprite edge came out darkened, and the darkening survived
      // into the shipped PNGs because padding a pose onto a blank canvas is a
      // blit too. Dividing the composited colour back out by the result's alpha
      // is what keeps the colour and the coverage separate.
      const da = dst.data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[d + c] = Math.round(
          (src.data[s + c] * sa + dst.data[d + c] * da * (1 - sa)) / oa
        );
      }
      dst.data[d + 3] = Math.round(oa * 255);
    }
  }
}

function blank(w, h, fill) {
  const data = Buffer.alloc(w * h * 4);
  if (fill) {
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = fill[0]; data[i * 4 + 1] = fill[1];
      data[i * 4 + 2] = fill[2]; data[i * 4 + 3] = fill[3] ?? 255;
    }
  }
  return { w, h, data };
}

function scale(img, f) {
  const w = Math.round(img.w * f), h = Math.round(img.h * f);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor(x / f));
      const sy = Math.min(img.h - 1, Math.floor(y / f));
      img.data.copy(out, (y * w + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
    }
  }
  return { w, h, data: out };
}

module.exports = { decode, encode, crop, blit, blank, scale };
