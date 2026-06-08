#!/usr/bin/env node
// setup — one interactive step to get a fresh clone ready.
//   npm run setup
//
// Creates .env from .env.example (if needed), asks for your Figma token
// (input is masked), saves it, and verifies it against the Figma API.
//
// Non-interactive options (handy for scripts):
//   npm run setup -- figd_yourtoken
//   FIGMA_TOKEN=figd_yourtoken npm run setup

import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

const exists = (p) => access(p).then(() => true).catch(() => false);

async function main() {
  console.log("\n  Deliverable Builder — setup\n");

  // 1. Get the token: arg > env > interactive prompt.
  let token = process.argv[2] || process.env.FIGMA_TOKEN;
  if (token && token.includes("xxxx")) token = undefined;

  if (!token) {
    console.log("  You need a Figma personal access token (one time).");
    console.log("  Get one at: https://www.figma.com/settings → Personal access tokens");
    console.log("  Scope needed: File content (Read).\n");
    if (!process.stdin.isTTY) {
      console.error("  No token given and no interactive terminal.");
      console.error("  Run:  npm run setup -- figd_yourtoken\n");
      process.exit(1);
    }
    token = await promptMasked("  Paste your Figma token (hidden): ");
  }
  token = (token || "").trim();
  if (!/^figd_/.test(token)) {
    console.log("\n  ⚠ That doesn't look like a Figma token (they start with 'figd_').");
    console.log("    Continuing anyway — re-run setup if it fails.\n");
  }

  // 2. Write .env (start from .env.example if present).
  let base = "";
  if (await exists(envPath)) base = await readFile(envPath, "utf8");
  else if (await exists(examplePath)) base = await readFile(examplePath, "utf8");
  const line = `FIGMA_TOKEN=${token}`;
  const next = /^FIGMA_TOKEN=.*$/m.test(base)
    ? base.replace(/^FIGMA_TOKEN=.*$/m, line)
    : (base ? base.trimEnd() + "\n" : "") + line + "\n";
  await writeFile(envPath, next);
  console.log(`\n  ✓ Saved token to .env`);

  // 3. Verify against the Figma API.
  process.stdout.write("  Checking token with Figma… ");
  try {
    const res = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": token },
    });
    if (res.ok) {
      const me = await res.json();
      console.log(`✓ valid (${me.email || me.handle || "authenticated"})`);
      console.log("\n  All set. Build a deliverable:\n");
      console.log('    npm run build -- "<figma-link>" --title "Your title" --subtitle "Entrega 2"\n');
      console.log("  …or just open this folder in Claude Code and ask it to build one.\n");
    } else {
      console.log(`✗ rejected (HTTP ${res.status})`);
      console.log("\n  The token was saved but Figma rejected it. Generate a new one and re-run:");
      console.log("    npm run setup\n");
      process.exit(1);
    }
  } catch (e) {
    console.log("✗");
    console.log(`\n  Could not reach Figma (${e.message}). Check your connection and re-run: npm run setup\n`);
    process.exit(1);
  }
}

function promptMasked(query) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = () => {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(query + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(query, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

main().catch((e) => {
  console.error("\n  Error:", e.message, "\n");
  process.exit(1);
});
