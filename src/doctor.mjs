#!/usr/bin/env node
// doctor — check that everything is set up correctly before a teammate's first run.
//   npm run doctor

import { access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let problems = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => (console.log(`  ✗ ${m}`), problems++);

console.log("\ndeliverable-builder doctor\n");

// Node version
const major = Number(process.versions.node.split(".")[0]);
major >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} (need ≥ 18)`);

// Dependencies
for (const dep of ["sharp", "pdfkit"]) {
  try {
    await import(dep);
    ok(`dependency "${dep}" installed`);
  } catch {
    bad(`dependency "${dep}" missing — run: npm install`);
  }
}

// Assets
for (const rel of [
  "assets/brandcasa-logo.png",
  "assets/fonts/Inter-Regular.ttf",
  "assets/fonts/Inter-SemiBold.ttf",
  "assets/fonts/Inter-Bold.ttf",
]) {
  try {
    await access(join(root, rel));
    ok(rel);
  } catch {
    bad(`missing asset: ${rel}`);
  }
}

// Figma token
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  /* token may be in the env already */
}
const token = process.env.FIGMA_TOKEN;
if (!token || token.includes("xxxx")) {
  bad("FIGMA_TOKEN not set — copy .env.example to .env and add your token");
} else {
  try {
    const res = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": token },
    });
    if (res.ok) {
      const me = await res.json();
      ok(`Figma token valid (${me.email || me.handle || "authenticated"})`);
    } else {
      bad(`Figma token rejected (HTTP ${res.status}) — generate a new one`);
    }
  } catch (e) {
    bad(`could not reach Figma API: ${e.message}`);
  }
}

console.log(
  problems === 0
    ? "\nAll good — you're ready to build deliverables. 🎉\n"
    : `\n${problems} problem(s) above. Fix them, then re-run: npm run doctor\n`
);
process.exit(problems ? 1 : 0);
