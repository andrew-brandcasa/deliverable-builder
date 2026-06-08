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

Build the brandcasa creative **Review Document** PDF from a Figma link.

**This is built for the Claude Code desktop app — the teammate never uses a
terminal.** YOU (Claude) run every command with the Bash tool. The teammate only
chats, and pastes two things when asked: their Figma token (first time only) and a
Figma link. Keep your messages short and friendly; do the work, then hand back the PDF.

## What this produces
A multi-page PDF mirroring the brandcasa template: a header/footer band (brandcasa
logo + "REVIEW DOCUMENT"), a title + subtitle, and one rounded "Creative N" card per
group, each holding a grid of the ad variations. Every creative is downsized to
~1280px and re-encoded as JPEG, so the file stays small. Text stays vector-crisp.

## First: make sure the project is ready (do this silently, fix as needed)
Run these yourself; only involve the teammate if something needs their input.
1. Are you in the repo? Check that `package.json` + `src/cli.mjs` exist in the cwd.
   - If not, clone it and work there:
     `git clone https://github.com/andrew-brandcasa/deliverable-builder.git && cd deliverable-builder`
2. Dependencies: if `node_modules` is missing, run `npm install`.
3. Node: if `node -v` fails, tell the teammate to install Node LTS from nodejs.org
   (the one thing they may need to do once), then continue.

## Getting the creatives onto the template

**The brandcasa template is built into this tool (it's code) — nobody rebuilds it in
Figma.** The teammate just hands you the **creatives**; you drop them onto the template.
They arrive one of two ways — handle whichever they gave you.

### They gave you the files (the simplest path — no Figma, no token)
Image files dragged into the chat, or a folder of exported ads.
1. Work out how they group into "Creative N" cards. Infer if obvious, otherwise ask one
   short question:
   - subfolders `creative-1/`, `creative-2/` → those are the groups, or
   - filenames like `creative1-a.png`, `creative1-b.png` → group "Creative 1", or
   - the teammate tells you ("Creative 1 = these two variations"), or
   - default to one Creative per file.
2. Copy the files into `out/<slug>/images/creative-<n>/...`.
3. Write `out/<slug>/manifest.json`:
   ```json
   { "title": "<title>", "subtitle": "<subtitle>",
     "groups": [ { "name": "Creative 1", "images": ["images/creative-1/1.png", "images/creative-1/2.png"] } ] }
   ```
4. Build: `npm run build:manifest -- out/<slug>/manifest.json --out out/<slug>.pdf`

### They gave you a Figma link
The link just says *where* the creatives live; you still drop them on the same template.
Use the Figma connection if this Claude Code has it (no token); otherwise a token.

**Figma connected (no token):** from the link get fileKey + node-id (convert `-` to `:`).
Use `get_metadata` / `get_design_context` to find the "Creative N" groups + their variation
nodes, confirm briefly, then `get_screenshot` each variation (maxDimension ~1600) → `curl`
the PNG into `out/<slug>/images/creative-<n>/<k>.png` → write the manifest (above) → run
`npm run build:manifest`.

**Not connected (token):** if `npm run doctor` flags the token, ask for one (*figma.com/
settings → Security → Personal access tokens → Generate, read-only; starts with `figd_`*),
save + verify with `npm run setup -- "<token>"` (look for `✓ valid`), then build:
`npm run build -- "<figma-url>" --title "<title>" --subtitle "<subtitle>" --out "out/<slug>.pdf"`.
If the auto-detected grouping is wrong, inspect via the Figma MCP and pass
`--plan plan.json` = `{ "title":"...", "groups":[ { "name":"Creative 1", "nodeIds":["3:2","3:3"] } ] }`.

## Gather the title
- **Title** — e.g. "Summer Campaign — Variations — June 2026". If the teammate didn't
  give one, default to the Figma frame name and confirm.
- **Subtitle** (optional) — e.g. "Delivery 2".

## Finish
- Tell the teammate the **final size** and the compression win the build printed
  (e.g. "48 MB of creatives → 1.9 MB PDF"), and where the file is.
- Offer to open it (`open "out/<slug>.pdf"` on macOS) and to re-run lighter/crisper:
  smaller → `--quality 70 --max-width 1080`; crisper → `--quality 85 --max-width 1600`.

## Tips & troubleshooting
- **Heavy still?** Lower `--quality` / `--max-width`. **Blurry on 4K?** Raise them.
- **A creative missing / merged?** Auto-detect keyed off layer names — inspect via the
  Figma MCP and pass an explicit `--plan` (Path B) or fix the node list (Path A).
- **403 from Figma (Path B)?** Token is valid but lacks access to that file — the
  teammate needs access, or a token from an account that has it.
- **Video creative?** PDFs can't play video — use a poster frame (it shows as an image).
- Tuning flags: `--max-width`, `--quality`, `--columns`, `--scale`, `--keep`.
