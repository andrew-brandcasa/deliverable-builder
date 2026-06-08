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

## Pulling the creatives from Figma — two paths

Pick **Path A** if this Claude Code has Figma connected (you can see Figma MCP tools
like `get_metadata` / `get_screenshot`). It needs no token. Otherwise use **Path B**.

### Path A — Figma connected (no token, preferred in the desktop app)
1. From the Figma link, get the fileKey + node-id (convert `-` to `:`).
2. Use `get_metadata` / `get_design_context` to read the delivery frame and find the
   "Creative N" groups and the variation nodes inside each. Briefly confirm with the
   teammate: *"6 creatives, 2 variations each, title X — build it?"*
3. For every variation node, call `get_screenshot` (maxDimension ~1600) and download
   the returned PNG with `curl` into `out/<slug>/images/creative-<n>/<k>.png`.
4. Write `out/<slug>/manifest.json`:
   ```json
   {
     "title": "<title>", "subtitle": "<subtitle>",
     "groups": [
       { "name": "Creative 1", "images": ["images/creative-1/1.png", "images/creative-1/2.png"] }
     ]
   }
   ```
5. Build: `npm run build:manifest -- out/<slug>/manifest.json --out out/<slug>.pdf`

### Path B — Figma token (works anywhere, any Figma plan)
1. If setup is missing (`npm run doctor` flags the token), ask the teammate:
   *"Paste your Figma token — get one at figma.com/settings → Security → Personal
   access tokens → Generate (read-only is fine). It starts with `figd_`."*
2. Save + verify it for them (non-interactive): `npm run setup -- "<their-token>"`.
   Confirm you see `✓ valid`. (You may also just write `FIGMA_TOKEN=<token>` into `.env`.)
3. Build: `npm run build -- "<figma-url>" --title "<title>" --subtitle "<subtitle>" --out "out/<slug>.pdf"`
   - If auto-detect maps the Creatives wrong, inspect with the Figma MCP and pass an
     explicit plan: add `--plan plan.json` where plan.json is
     `{ "title": "...", "subtitle": "...", "groups": [ { "name": "Creative 1", "nodeIds": ["3:2","3:3"] } ] }`
     (node IDs in colon form).

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
