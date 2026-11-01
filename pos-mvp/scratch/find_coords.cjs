// @ts-nocheck
/* eslint-disable */
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(filePath) {
  const buf = fs.readFileSync(filePath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  let offset = 8;
  let width, height, bitDepth, colorType;
  let idatBuffers = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      bitDepth = buf.readUInt8(offset + 16);
      colorType = buf.readUInt8(offset + 17);
    } else if (type === 'IDAT') {
      idatBuffers.push(buf.subarray(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const compressed = Buffer.concat(idatBuffers);
  const decompressed = zlib.inflateSync(compressed);
  
  // Find green pixels in header (y between 15 and 45)
  // colorType 6 is RGBA (4 bytes per pixel) or 2 is RGB
  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : 4);
  const stride = 1 + width * bpp;

  console.log(`Dimensions: ${width}x${height}, colorType: ${colorType}, bpp: ${bpp}`);

  const greenMatches = [];
  for (let y = 15; y < 50; y++) {
    const rowStart = y * stride + 1;
    for (let x = 400; x < 1000; x++) {
      const p = rowStart + x * bpp;
      const r = decompressed[p];
      const g = decompressed[p + 1];
      const b = decompressed[p + 2];
      // emerald/green check: g > 150 && g > r * 1.3 && g > b * 1.3 (or light green bg: r: 236, g: 253, b: 245)
      // bg-emerald-50: rgb(236, 253, 245)
      // text-emerald-600 / 800: rgb(5, 150, 105) or (6, 95, 70)
      if (g > 140 && r < 80 && b < 130) {
        greenMatches.push({ x, y, r, g, b });
      } else if (r >= 220 && g >= 245 && b >= 235 && r < g) {
        greenMatches.push({ x, y, r, g, b });
      }
    }
  }

  if (greenMatches.length > 0) {
    const xs = greenMatches.map(m => m.x);
    console.log(`Found green button from x=${Math.min(...xs)} to x=${Math.max(...xs)}`);
    console.log(`Center x: ${Math.round((Math.min(...xs) + Math.max(...xs)) / 2)}`);
  } else {
    console.log('No green matches found in header');
  }
}

decodePNG('scratch/sunmi_preview.png');
