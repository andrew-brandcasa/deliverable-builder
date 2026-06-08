// Image optimization — the step that makes the PDFs light.
//
// Every creative is resized down to a screen-friendly width and re-encoded as a
// progressive JPEG. A 4000px, 8 MB ad export becomes a ~1280px, ~150 KB JPEG that
// looks identical on screen. pdfkit embeds the JPEG bytes verbatim (DCTDecode),
// so the number we produce here IS the number that lands in the PDF.

import sharp from "sharp";

/**
 * @param {string|Buffer} input  path or buffer of the source image
 * @param {object} opts
 * @param {number} opts.maxWidth  longest-edge cap in px (default 1280)
 * @param {number} opts.quality   JPEG quality 1-100 (default 80)
 * @returns {Promise<{buffer: Buffer, width: number, height: number, srcBytes: number, outBytes: number}>}
 */
export async function optimizeImage(input, { maxWidth = 1280, quality = 80 } = {}) {
  const srcBuf = Buffer.isBuffer(input) ? input : await readFileBuffer(input);
  const meta = await sharp(srcBuf, { failOn: "none" }).metadata();

  let pipeline = sharp(srcBuf, { failOn: "none" }).rotate(); // honor EXIF orientation

  // Cap the longest edge. Figma exports can be huge; nothing on screen needs >1280.
  const longest = Math.max(meta.width || 0, meta.height || 0);
  if (longest > maxWidth) {
    const resizeOpts =
      (meta.height || 0) >= (meta.width || 0)
        ? { height: maxWidth, withoutEnlargement: true }
        : { width: maxWidth, withoutEnlargement: true };
    pipeline = pipeline.resize(resizeOpts);
  }

  // JPEG has no alpha — flatten transparency onto white so PNG/transparent
  // exports don't turn black.
  const buffer = await pipeline
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
    .toBuffer();

  const outMeta = await sharp(buffer).metadata();
  return {
    buffer,
    width: outMeta.width,
    height: outMeta.height,
    srcBytes: srcBuf.length,
    outBytes: buffer.length,
  };
}

async function readFileBuffer(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
