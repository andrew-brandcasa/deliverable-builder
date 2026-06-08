# Setup — for anyone on the team

> **Using the Claude Code desktop app? You don't have to do these by hand.** Paste the
> kickoff prompt from the [README](README.md) and Claude runs the setup for you, pausing
> only so you can paste your Figma token (step 4 below). This page is the manual
> reference — handy if you hit a snag or prefer the terminal.

This is the one-time setup. It takes about 5 minutes. After this, building a
deliverable is one sentence to Claude Code (or one command).

You'll do five things: install Node, get the project, install it, connect Figma,
and verify.

---

## 1. Install Node.js (one time)

Node is the engine this tool runs on.

- **Mac:** download the **LTS** installer from <https://nodejs.org> and run it.
  (Or, if you use Homebrew: `brew install node`.)
- **Windows:** download the **LTS** installer from <https://nodejs.org> and run it.

Verify it worked — open **Terminal** (Mac) or **PowerShell** (Windows) and run:
```bash
node -v
```
You should see `v18` or higher.

---

## 2. Get the project

Clone it (it's a public repo — no access needed):
```bash
git clone https://github.com/andrew-brandcasa/deliverable-builder.git
cd deliverable-builder
```

## 3. Install it
```bash
npm install
```
This downloads the two libraries it needs (image compression + PDF). No browser,
no system packages.

---

## 4. Connect Figma (get your access token — one time, ~60 sec)

The tool reads your creatives straight from Figma using a **personal access token**
tied to your own account. It only needs *read* access.

1. Open **<https://www.figma.com/settings>** (or in Figma: your avatar, top-left → **Settings**).
2. Click the **Security** tab.
3. Find **Personal access tokens** → click **Generate new token**.
4. Name it `deliverable-builder`. Leave the scopes at the default —
   **File content: Read-only** is all it needs. (Expiration: your call.)
5. Click **Generate token**, then **Copy** it. It starts with `figd_…`.
   👉 Copy it right away — Figma shows it only once.

Now hand it to the tool with one command:
```bash
npm run setup
```
Paste the token when asked (your typing stays hidden), and it saves + verifies it
automatically. You should see **`✓ valid`**. Done.

> 🔒 Your token is private — treat it like a password for your Figma. It's saved to a
> local `.env` file that's git-ignored, so it's never committed or shared. Every
> teammate uses their own token.

**Shortcut for Claude Code users:** if your Claude Code already has the Figma (MCP)
connection set up, you can skip the token entirely — just open this folder in Claude
Code and ask it to build; it'll read the creatives through that connection. The token
above is the recommended default, because it works for everyone, on any Figma plan,
in or out of Claude Code.

---

## 5. Verify (optional)
`npm run setup` already verified your token. If you ever want to re-check the whole
setup:
```bash
npm run doctor
```
Everything should be a green ✓.

---

## You're ready — build a deliverable

**Option A — in Claude Code (recommended):**
Open this folder in Claude Code and say:

> "Build the deliverable for `<paste Figma link>`, title 'Summer Campaign —
> Variations — June 2026', subtitle 'Delivery 2'."

The `deliverable-builder` skill handles the rest and gives you the PDF.

**Option B — command line:**
```bash
npm run build -- "<figma-link>" --title "Your title" --subtitle "Entrega 2"
```

Want to see it work right now without a Figma link? Build the bundled example:
```bash
npm run build:manifest -- examples/sample-delivery/manifest.json --out out/example.pdf
open out/example.pdf      # Mac  (Windows: start out/example.pdf)
```

---

## About the Claude Code skill

Because the skill lives in this repo (`.claude/skills/deliverable-builder/`), it
loads automatically whenever you open **this folder** in Claude Code — nothing to
install.

If you'd rather have it available in **every** folder, copy it into your global
skills directory once:
```bash
# Mac/Linux
cp -R .claude/skills/deliverable-builder ~/.claude/skills/
```
Then it works from anywhere, and it'll `cd` into the project to run.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `node: command not found` | Node isn't installed — redo step 1, then reopen the terminal. |
| `doctor` says token rejected | Generate a fresh token (step 4); make sure there are no spaces in `.env`. |
| `Figma API 403` | Your token is fine but your account can't open that file — ask for access. |
| `Figma API 404` | The link is wrong, or points at a deleted node — paste a fresh link. |
| PDF still feels big | Lower quality/size: add `--quality 70 --max-width 1080`. |
| A creative looks blurry on a 4K screen | Add `--max-width 1600 --quality 85`. |
| Auto-detect grabbed the wrong layers | Ask Claude to inspect the file and build an explicit `--plan` (see README). |
