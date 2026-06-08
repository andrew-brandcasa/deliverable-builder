# Setup — for anyone on the team

This is the one-time setup. It takes about 5 minutes. After this, building a
deliverable is one command (or one sentence to Claude Code).

You'll do five things: install Node, get the project, install it, get a Figma
token, and verify.

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

Clone it (ask Andrew for access — it's a private repo):
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

## 4. Get your Figma token (one time)

The tool reads creatives from Figma using a personal token tied to your account.

1. Go to <https://www.figma.com/settings>.
2. Scroll to **Personal access tokens** → **Generate new token**.
3. Name it `deliverable-builder`. For scopes, **File content: Read** is enough.
4. Copy the token (starts with `figd_`). You won't be able to see it again.

Now hand it to the project with one command:
```bash
npm run setup
```
It asks for your token (the typing is hidden), saves it to `.env`, and checks it
with Figma right away. You should see `✓ valid`.

> Keep this token private — it's like a password for your Figma. The `.env` file is
> git-ignored so it never gets committed or shared.

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

> "Build the deliverable for `<paste Figma link>`, title 'Anuncios en Inglés
> Variaciones de Junio 2026', subtitle 'Entrega 2'."

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
