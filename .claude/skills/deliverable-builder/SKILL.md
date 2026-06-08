---
name: deliverable-builder
description: >
  Turn a Figma delivery link into a lightweight, brandcasa-branded client
  "Review Document" PDF. Trigger when the user says "build a deliverable",
  "make the delivery PDF", "client review doc", "deliverable builder", or pastes
  a Figma link and asks for a PDF of the creatives. Reads the creatives from
  Figma, lays them into the brandcasa template, compresses the images, and
  exports a small PDF (typically 1-3 MB instead of 50 MB+).
---

# Deliverable Builder

Build the brandcasa creative **Review Document** PDF from a Figma link. The heavy
lifting (image compression + template layout) is done by the Node engine in this
repo; your job is to gather inputs, confirm the structure, run it, and hand back
the PDF.

## What this produces
A multi-page PDF that mirrors the brandcasa template: a header/footer band
(brandcasa logo + "REVIEW DOCUMENT"), a title + subtitle, and one rounded
"Creative N" card per group, each holding a grid of the ad variations. Every
creative is downsized to ~1280px and re-encoded as JPEG, so the file stays light.

## Prerequisites (one-time per teammate)
- Run from inside the `deliverable-builder` repo (so this project skill loads and
  `node src/...` resolves). If unsure where you are, check that `package.json` and
  `src/cli.mjs` exist in the current directory.
- **Fresh clone?** Get it ready in two commands: `npm install`, then `npm run setup`
  (it asks for the user's Figma token, saves it to `.env`, and verifies it).
- Already set up? Confirm with `npm run doctor` and fix anything it flags.

If the user gives you only a git URL (cold start), do this for them: clone it,
`cd` in, `npm install`, then `npm run setup` (let the user paste their token), then
proceed to the build.

## Workflow

### Step 1 — Gather inputs
Ask the user for (or extract from their message):
- **Figma link** to the delivery frame (the frame that contains the Creative cards).
  A node-specific link is best: `…?node-id=2-71332`.
- **Title** — e.g. "Anuncios en Inglés Variaciones de Junio 2026". If they don't
  give one, default to the Figma frame name and confirm it.
- **Subtitle** (optional) — e.g. "Entrega 2".

### Step 2 — Confirm setup
Run `npm run doctor`. If the Figma token is missing or invalid, walk the user
through `SETUP.md` (create a token at https://www.figma.com/settings, paste it into
`.env`). Don't proceed until doctor passes.

### Step 3 — (Recommended) Confirm the structure
Before exporting, sanity-check how the Figma frame maps to Creatives. You have the
Figma MCP available — use `get_metadata` / `get_design_context` on the frame to see
its child structure, and tell the user what you found, e.g.:

> "I see 6 Creative groups, each with 2 variations. Title: 'Anuncios en Inglés…',
> subtitle 'Entrega 2'. Build it?"

The engine auto-detects groups named like "Creative N". If the file is structured
differently (or auto-detect looks wrong), build an explicit **plan file** and pass
it with `--plan`:

```json
{
  "title": "Anuncios en Inglés Variaciones de Junio 2026",
  "subtitle": "Entrega 2",
  "groups": [
    { "name": "Creative 1", "nodeIds": ["3:2", "3:3"] },
    { "name": "Creative 2", "nodeIds": ["4:2", "4:3"] }
  ]
}
```
(Node IDs come from the Figma link or from `get_metadata`. Use the colon form, e.g. `3:2`.)

### Step 4 — Build
Run the one-shot command (auto-detect):
```bash
node src/cli.mjs "<figma-url>" --title "<title>" --subtitle "<subtitle>" --out "out/<name>.pdf"
```
Or with an explicit plan:
```bash
node src/cli.mjs "<figma-url>" --plan plan.json --out "out/<name>.pdf"
```

Useful flags: `--max-width 1280` (image cap), `--quality 80` (JPEG quality),
`--columns 2` (images per row), `--scale 2` (Figma export scale), `--keep` (keep
source images for inspection).

### Step 5 — Report
Tell the user the **output path** and **final size**, and the compression win the
command printed (e.g. "47 MB of images → 1.8 MB PDF"). Offer to open it
(`open "<path>"` on macOS) or to re-run lighter/heavier (`--quality 70` for smaller,
`--max-width 1600 --quality 85` for crisper).

## Tips & troubleshooting
- **Too heavy still?** Lower `--quality` (e.g. 70) or `--max-width` (e.g. 1080).
- **Blurry on a big screen?** Raise `--max-width 1600` and `--quality 85`.
- **A "Creative" came out missing / merged?** The auto-detector keyed off layer
  names — inspect with the Figma MCP and pass an explicit `--plan`.
- **403 from Figma?** The token is valid but lacks access to that file — the user
  needs access to the file, or a token from an account that has it.
- **Videos:** PDFs can't play video. If a creative is a video, export a poster
  frame in Figma (or drop a still into the plan) — it'll appear as an image.
- The PDF keeps text as vectors (crisp); only the creative images are raster.
