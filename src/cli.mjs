#!/usr/bin/env node
// deliverable-builder — one command: Figma link → lightweight branded PDF.
//
// Usage:
//   node src/cli.mjs "<figma-url>" [options]
//   npm run build -- "<figma-url>" [options]
//
// Options:
//   --title <t>        override the document title (default: Figma frame name)
//   --subtitle <s>     small line under the title (e.g. "Entrega 2")
//   --out <file>       output PDF path (default: out/<title>.pdf)
//   --max-width <px>   per-image longest-edge cap (default 1280)
//   --quality <1-100>  JPEG quality (default 80)
//   --columns <n>      images per row in each card (default 2)
//   --scale <n>        Figma export scale, 1-4 (default 2)
//   --plan <file>      use an explicit plan JSON instead of auto-detecting
//   --keep             keep the downloaded source images (in out/<title>/)
//
// Requires a Figma token: put FIGMA_TOKEN in a .env file (see .env.example).

import { resolve, dirname, join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDeliverable } from "./fetch-figma.mjs";
import { buildFromManifest } from "./build-pdf.mjs";

loadEnv();

function loadEnv() {
  // Prefer Node's built-in loader; fall back to a tiny parser for older Node.
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  try {
    process.loadEnvFile(envPath);
  } catch {
    // ignore — token may already be in the environment
  }
}

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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const url = a._[0];
  if (!url) {
    console.error('Usage: npm run build -- "<figma-url>" [--title ..] [--subtitle ..] [--out file.pdf]');
    process.exit(1);
  }

  const plan = a.plan ? JSON.parse(await readFile(resolve(a.plan), "utf8")) : undefined;

  const { manifestPath, imagesDir } = await fetchDeliverable({
    url,
    token: process.env.FIGMA_TOKEN,
    plan,
    title: typeof a.title === "string" ? a.title : undefined,
    subtitle: typeof a.subtitle === "string" ? a.subtitle : undefined,
    scale: a.scale ? Number(a.scale) : 2,
    log: (s) => console.log(s),
  });

  const result = await buildFromManifest(manifestPath, {
    out: typeof a.out === "string" ? a.out : undefined,
    maxWidth: a["max-width"] ? Number(a["max-width"]) : undefined,
    quality: a.quality ? Number(a.quality) : undefined,
    columns: a.columns ? Number(a.columns) : undefined,
  });

  if (!a.keep) {
    // Drop the downloaded source images, keep only the PDF.
    await rm(imagesDir, { recursive: true, force: true }).catch(() => {});
  } else {
    console.log(`Source images kept in ${imagesDir}`);
  }

  console.log(`\n✅ ${result.outPath}  (${(result.pdfBytes / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error("\nError:", e.message);
  process.exit(1);
});
