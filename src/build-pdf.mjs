#!/usr/bin/env node
// build-pdf — assemble a lightweight deliverable PDF from a manifest + image files.
//
// Usage:
//   node src/build-pdf.mjs <manifest.json> [options]
//
// Options:
//   --out <file>          output PDF path (default: out/<brand-title>.pdf)
//   --images-dir <dir>    base dir for image paths (default: manifest's folder)
//   --max-width <px>      longest-edge cap per image (default 1280)
//   --quality <1-100>     JPEG quality (default 80)
//   --columns <n>         images per row in each card (default 2)
//   --page <WxH>          page size in points (default 960x1280)
//
// The manifest shape:
//   {
//     "brand": "Northwind",
//     "title": "Summer Campaign — Variations — June 2026",
//     "subtitle": "Delivery 2",
//     "groups": [
//       { "name": "Creative 1", "images": ["creative-1/a.png", "creative-1/b.png"] }
//     ]
//   }

import { readFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve, join, isAbsolute, basename } from "node:path";
import { optimizeImage, formatBytes } from "./optimize.mjs";
import { renderDeliverable } from "./template.mjs";

export async function buildFromManifest(manifestPath, opts = {}) {
  const manifestAbs = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(manifestAbs, "utf8"));
  validateManifest(manifest, manifestPath);

  const baseDir = opts.imagesDir ? resolve(opts.imagesDir) : dirname(manifestAbs);
  const maxWidth = opts.maxWidth ?? 1280;
  const quality = opts.quality ?? 80;

  // Resolve + optimize every image, preserving group structure.
  const jobs = [];
  for (const group of manifest.groups) {
    for (const ref of group.images) {
      jobs.push({ group, ref, path: resolveImage(ref, baseDir) });
    }
  }

  log(`Optimizing ${jobs.length} image(s)  (max ${maxWidth}px, JPEG q${quality})…`);
  let srcTotal = 0;
  let outTotal = 0;
  const optimized = new Map();
  await pMap(
    jobs,
    async (job) => {
      try {
        const r = await optimizeImage(job.path, { maxWidth, quality });
        srcTotal += r.srcBytes;
        outTotal += r.outBytes;
        optimized.set(job.ref + "::" + job.group.name, r);
        log(
          `  ✓ ${basename(job.ref)}  ${formatBytes(r.srcBytes)} → ${formatBytes(
            r.outBytes
          )}  (${r.width}×${r.height})`
        );
      } catch (e) {
        throw new Error(`Failed to process "${job.ref}": ${e.message}`);
      }
    },
    4
  );

  // Build the in-memory manifest the renderer consumes.
  const renderManifest = {
    brand: manifest.brand,
    title: manifest.title,
    subtitle: manifest.subtitle,
    groups: manifest.groups.map((g) => ({
      name: g.name,
      images: g.images.map((ref) => optimized.get(ref + "::" + g.name)),
    })),
  };

  const outPath = opts.out
    ? resolve(opts.out)
    : resolve("out", `${slug(manifest.brand, manifest.title)}.pdf`);
  await mkdir(dirname(outPath), { recursive: true });

  const theme = {};
  if (opts.columns) theme.grid = { columns: opts.columns };
  if (opts.page) theme.page = parsePage(opts.page);
  if (opts.paged) theme.paged = true;

  log(`Rendering PDF…`);
  await renderDeliverable({ manifest: renderManifest, outPath, theme });

  const pdfBytes = (await stat(outPath)).size;
  log("");
  log(`Done → ${outPath}`);
  log(
    `Images: ${formatBytes(srcTotal)} → ${formatBytes(outTotal)} ` +
      `(${srcTotal ? (100 - (outTotal / srcTotal) * 100).toFixed(0) : 0}% smaller)`
  );
  log(`Final PDF: ${formatBytes(pdfBytes)}`);

  return { outPath, pdfBytes, srcTotal, outTotal, count: jobs.length };
}

// ---- helpers --------------------------------------------------------------

function validateManifest(m, path) {
  if (!m || typeof m !== "object") throw new Error(`${path}: not a JSON object`);
  if (!m.title) throw new Error(`${path}: missing "title"`);
  if (!Array.isArray(m.groups) || m.groups.length === 0)
    throw new Error(`${path}: "groups" must be a non-empty array`);
  m.groups.forEach((g, i) => {
    if (!g.name) throw new Error(`${path}: groups[${i}] missing "name"`);
    if (!Array.isArray(g.images) || g.images.length === 0)
      throw new Error(`${path}: groups[${i}] ("${g.name}") has no images`);
  });
}

function resolveImage(ref, baseDir) {
  if (/^https?:\/\//.test(ref)) return ref; // (reserved) remote refs
  return isAbsolute(ref) ? ref : join(baseDir, ref);
}

function slug(brand, title) {
  return (
    [brand, title]
      .filter(Boolean)
      .join("-")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "") // strip accents so filenames stay ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "deliverable"
  );
}

function parsePage(s) {
  const m = String(s).toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`--page must look like 960x1280, got "${s}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

async function pMap(items, fn, concurrency = 4) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function log(s) {
  process.stdout.write(s + "\n");
}

// ---- CLI ------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else (args[key] = next), i++;
    } else args._.push(a);
  }
  return args;
}

const isMain = resolve(process.argv[1] || "") === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  const manifestPath = a._[0] || a.manifest;
  if (!manifestPath) {
    console.error("Usage: node src/build-pdf.mjs <manifest.json> [--out file] [--max-width 1280] [--quality 80] [--columns 2] [--page 960x1280]");
    process.exit(1);
  }
  buildFromManifest(manifestPath, {
    out: typeof a.out === "string" ? a.out : undefined,
    imagesDir: typeof a["images-dir"] === "string" ? a["images-dir"] : undefined,
    maxWidth: a["max-width"] ? Number(a["max-width"]) : undefined,
    quality: a.quality ? Number(a.quality) : undefined,
    columns: a.columns ? Number(a.columns) : undefined,
    page: typeof a.page === "string" ? a.page : undefined,
    paged: a.paged === true,
  }).catch((e) => {
    console.error("\nError:", e.message);
    process.exit(1);
  });
}
