# Deliverable Builder

Turn a **Figma link** into a lightweight, brandcasa-branded **client review PDF** —
automatically, in seconds, with files small enough to actually email.

It rebuilds the brandcasa "Review Document" template (header/footer band, title,
rounded **Creative N** cards with the ad variations) and exports a PDF that's
typically **1–3 MB instead of 50 MB+**.

---

## Why it exists

Exporting the delivery doc straight from Figma (or "Print → PDF") embeds every
creative at full resolution, so a 15-creative delivery balloons to 50–100 MB and
bounces from inboxes.

This tool re-exports each creative at screen resolution (~1280px), re-encodes it as
a JPEG, and lays it into the template. **Text stays vector-crisp; only the images
are compressed** — so it looks identical on screen at a fraction of the size.

> In practice a delivery that exports from Figma at 50–100 MB comes out around **1–3 MB** here — identical on screen.

---

## How the team uses it — in the Claude Code desktop app (no terminal)

Your team never touches a command line. They open the **Claude Code desktop app**,
talk to it, and Claude runs everything (clone, install, setup, build) behind the scenes.

**First time — once per person (~2 min).** Paste this to Claude Code:

> Clone https://github.com/andrew-brandcasa/deliverable-builder and set it up so I can
> build client deliverables. Walk me through connecting Figma.

Claude clones the repo, installs it, and gets Figma connected — it asks you to paste a
**Figma access token** once (or uses your existing Figma connection if you have one).
The only thing you may need installed first is **Node** (free, from nodejs.org → LTS).

**Every time after — just ask:**

> Build a deliverable from this Figma link <paste link>, title "Summer Campaign —
> June 2026", subtitle "Delivery 2".

…and Claude hands back the finished PDF (typically 1–3 MB). That's the whole workflow.

<details>
<summary><b>Prefer the command line?</b> (optional — same engine)</summary>

```bash
git clone https://github.com/andrew-brandcasa/deliverable-builder.git
cd deliverable-builder
npm install
npm run setup        # paste your Figma token when asked (hidden), auto-verified
npm run build -- "<figma-link>" --title "Summer Campaign — June 2026" --subtitle "Delivery 2"
```
First-time details (installing Node, creating a Figma token) are in **[SETUP.md](SETUP.md)**.
</details>

---

## Under the hood

The **`deliverable-builder` skill** (in `.claude/skills/`) is what Claude Code follows:
it reads the creatives from Figma, confirms how they map to "Creative N" cards, runs the
build, and hands back the PDF — adapting if the Figma layer naming is unusual. If your
Claude Code has Figma connected, it can pull creatives through that connection with no
token at all; otherwise it uses a Figma access token (same lightweight result either way).

---

## Options

| Flag | Default | What it does |
|------|---------|--------------|
| `--title` | Figma frame name | Big title line |
| `--subtitle` | — | Small line under the title (e.g. `Entrega 2`) |
| `--out` | `out/<title>.pdf` | Output path |
| `--max-width` | `1280` | Longest edge per image, in px (lower = smaller file) |
| `--quality` | `80` | JPEG quality 1–100 (lower = smaller file) |
| `--columns` | `2` | Creatives per row inside each card |
| `--scale` | `2` | Figma export scale (1–4) |
| `--plan` | — | Explicit structure file (see below) |
| `--keep` | off | Keep the downloaded source images |

**Tuning weight vs. crispness:** smaller → `--quality 70 --max-width 1080`;
crisper for big screens → `--quality 85 --max-width 1600`.

---

## Don't have a Figma link? Build from files

You can skip Figma entirely and build from a folder of images + a small manifest:

```bash
npm run build:manifest -- examples/sample-delivery/manifest.json
```

```jsonc
// manifest.json
{
  "brand": "Northwind",
  "title": "Summer Campaign — Variations — June 2026",
  "subtitle": "Delivery 2",
  "groups": [
    { "name": "Creative 1", "images": ["creative-1/a.png", "creative-1/b.png"] },
    { "name": "Creative 2", "images": ["creative-2/a.png", "creative-2/b.png"] }
  ]
}
```
Image paths are relative to the manifest file. See `examples/sample-delivery/`.

---

## Explicit Figma plan (when auto-detect isn't right)

Auto-detect looks for layers named like "Creative N". If your file is structured
differently, hand it an exact plan:

```json
{
  "title": "…",
  "subtitle": "Entrega 2",
  "groups": [
    { "name": "Creative 1", "nodeIds": ["3:2", "3:3"] },
    { "name": "Creative 2", "nodeIds": ["4:2", "4:3"] }
  ]
}
```
```bash
npm run build -- "<figma-url>" --plan plan.json
```

---

## How it works

```
Figma link ──▶ fetch-figma.mjs ──▶ manifest + exported PNGs
                                         │
                                         ▼
                       optimize.mjs (resize ≤1280px, JPEG q80)
                                         │
                                         ▼
                       template.mjs (pdfkit: bands, title, cards, grids)
                                         │
                                         ▼
                                  out/<title>.pdf
```

## Project structure
```
deliverable-builder/
├── src/
│   ├── cli.mjs          # one command: Figma link → PDF
│   ├── fetch-figma.mjs  # Figma REST: read structure + export creatives
│   ├── build-pdf.mjs    # orchestrate: optimize + render (also manifest mode)
│   ├── optimize.mjs     # sharp image compression (the size win)
│   ├── template.mjs     # the brandcasa template, drawn with pdfkit
│   └── doctor.mjs       # `npm run doctor` setup check
├── assets/              # brandcasa logo + Inter fonts (bundled)
├── examples/            # a runnable example (no token needed)
├── .claude/skills/      # the deliverable-builder Claude Code skill
├── .env.example         # copy to .env, add FIGMA_TOKEN
└── SETUP.md             # first-time setup for any teammate
```

## Requirements
- **Node 18+** (ships with everything else via `npm install`; no headless browser,
  no system libraries).
- A **Figma personal access token** (free) for the Figma-link workflow.
