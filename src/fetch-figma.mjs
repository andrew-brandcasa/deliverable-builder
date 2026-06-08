// Figma fetch layer — turn a Figma delivery link into a manifest + exported images.
//
// Flow:
//   1. parse the link  → fileKey + nodeId
//   2. read the node subtree via the Figma REST API
//   3. work out the structure (title, "Creative N" groups, the variations inside)
//   4. export each variation as a PNG and download it
//   5. write manifest.json next to the images
//
// The engine (build-pdf.mjs) then compresses + lays them out.
//
// Auth: a Figma personal access token (https://www.figma.com/settings).
// Pass it as the FIGMA_TOKEN env var, or to the functions directly.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const API = "https://api.figma.com/v1";

// ---- URL parsing ----------------------------------------------------------

/** Extract { fileKey, nodeId } from a Figma design URL (or a raw key). */
export function parseFigmaUrl(input) {
  if (!input) throw new Error("No Figma URL or file key provided.");
  // Already a bare file key?
  if (/^[A-Za-z0-9]{10,}$/.test(input) && !input.includes("/")) {
    return { fileKey: input, nodeId: null };
  }
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Not a valid Figma URL: ${input}`);
  }
  // /design/:fileKey/...  or  /file/:fileKey/...  or  /design/:fileKey/branch/:branchKey/...
  const parts = url.pathname.split("/").filter(Boolean);
  const kind = parts[0]; // design | file | board | slides
  let fileKey = parts[1];
  const branchIdx = parts.indexOf("branch");
  if (branchIdx !== -1 && parts[branchIdx + 1]) fileKey = parts[branchIdx + 1];
  if (!fileKey) throw new Error(`Could not find a file key in URL: ${input}`);
  if (kind && !["design", "file"].includes(kind)) {
    // board (FigJam) / slides aren't supported for this workflow, but don't hard-fail on /file.
    // We still try; the API will reject if truly unsupported.
  }
  const nodeRaw = url.searchParams.get("node-id");
  const nodeId = nodeRaw ? nodeRaw.replace(/-/g, ":") : null;
  return { fileKey, nodeId };
}

// ---- REST helpers ---------------------------------------------------------

function authHeaders(token) {
  const t = token || process.env.FIGMA_TOKEN;
  if (!t) {
    throw new Error(
      "No Figma token. Set FIGMA_TOKEN (see .env.example) or pass { token }.\n" +
        "Create one at https://www.figma.com/settings → Personal access tokens."
    );
  }
  // Figma personal access tokens use the X-Figma-Token header.
  return { "X-Figma-Token": t };
}

async function figmaGet(path, token) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 403
        ? " — token is valid but lacks access to this file (ask for file access, or check the token's scope)."
        : res.status === 404
        ? " — file or node not found (check the link)."
        : res.status === 401
        ? " — token missing or invalid."
        : "";
    throw new Error(`Figma API ${res.status}${hint}\n${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Fetch the document subtree for a node (or the whole file if nodeId is null). */
export async function getNode(fileKey, nodeId, token) {
  if (nodeId) {
    const data = await figmaGet(
      `/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
      token
    );
    const entry = data.nodes[nodeId] || Object.values(data.nodes)[0];
    if (!entry || !entry.document)
      throw new Error(`Node ${nodeId} not found in file ${fileKey}.`);
    return entry.document;
  }
  const data = await figmaGet(`/files/${fileKey}?depth=4`, token);
  return data.document;
}

// ---- structure detection --------------------------------------------------

const RENDERABLE = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "RECTANGLE",
  "VECTOR",
]);
const GROUP_NAME_RE = /\b(creative|creativo|anuncio|ad|asset|variant|variaci[oó]n|concepto|concept)\b/i;

const visible = (n) => n && n.visible !== false;
const nodeWidth = (n) => n.absoluteBoundingBox?.width || n.size?.x || 0;
const nodeHeight = (n) => n.absoluteBoundingBox?.height || n.size?.y || 0;

/**
 * Build an export plan from a node tree.
 * Returns { title, groups: [{ name, nodeIds: [...] }] }.
 *
 * Heuristics, in order:
 *  A) If descendants named like "Creative N" exist → each is a group, and its
 *     visible renderable children are the variations.
 *  B) Otherwise → the target's direct visible children are the groups, and each
 *     group's visible renderable children are the variations (or the child
 *     itself if it has none).
 */
export function autoPlan(root) {
  const title = cleanName(root.name);
  const creativeNodes = [];
  (function find(n, insideCreative) {
    if (!visible(n)) return;
    const isGroup = GROUP_NAME_RE.test(n.name || "") && !insideCreative;
    if (isGroup) creativeNodes.push(n);
    for (const c of n.children || []) find(c, insideCreative || isGroup);
  })(root, false);

  let groups;
  if (creativeNodes.length) {
    groups = creativeNodes.map((g) => ({
      name: cleanName(g.name),
      nodeIds: variationIds(g),
    }));
  } else {
    const children = (root.children || []).filter(visible).filter((c) => RENDERABLE.has(c.type));
    groups = children.map((c, i) => {
      const kids = (c.children || []).filter(visible).filter((k) => RENDERABLE.has(k.type) && nodeWidth(k) > 40);
      return {
        name: cleanName(c.name) || `Creative ${i + 1}`,
        nodeIds: kids.length ? kids.map((k) => k.id) : [c.id],
      };
    });
  }

  groups = groups.filter((g) => g.nodeIds.length > 0);
  if (!groups.length)
    throw new Error(
      "Couldn't find any creatives under that node. Point the link at the delivery frame " +
        "(the one containing the Creative cards), or build a plan explicitly."
    );
  return { title, groups };
}

function variationIds(groupNode) {
  const kids = (groupNode.children || [])
    .filter(visible)
    .filter((k) => RENDERABLE.has(k.type) && nodeWidth(k) > 40 && nodeHeight(k) > 40);
  // If the "creative" node has real child frames, those are the variations.
  if (kids.length) return kids.map((k) => k.id);
  // Otherwise the creative node itself is a single image.
  return [groupNode.id];
}

function cleanName(name) {
  return (name || "").replace(/\s+/g, " ").trim();
}

/** Flat summary of a tree for inspection / debugging (depth-limited). */
export function summarize(node, depth = 2, level = 0) {
  const line = {
    id: node.id,
    name: cleanName(node.name),
    type: node.type,
    w: Math.round(nodeWidth(node)),
    h: Math.round(nodeHeight(node)),
    children: (node.children || []).length,
  };
  if (level >= depth) return line;
  line.kids = (node.children || []).filter(visible).map((c) => summarize(c, depth, level + 1));
  return line;
}

// ---- image export ---------------------------------------------------------

/**
 * Export node ids as PNGs and return { id: url }. Scale is chosen per request so
 * the rendered width lands near targetWidth (kept modest to limit download size;
 * the engine compresses further).
 */
export async function exportImageUrls(fileKey, ids, token, scale = 2) {
  const out = {};
  for (const batch of chunk(ids, 40)) {
    const data = await figmaGet(
      `/images/${fileKey}?ids=${batch.map(encodeURIComponent).join(",")}&format=png&scale=${scale}`,
      token
    );
    if (data.err) throw new Error(`Figma image export error: ${data.err}`);
    Object.assign(out, data.images);
  }
  return out;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

// ---- top-level ------------------------------------------------------------

/**
 * Fetch a Figma delivery and write a manifest + images into outDir.
 * @returns {Promise<{manifestPath:string, imagesDir:string, manifest:object}>}
 */
export async function fetchDeliverable({
  url,
  fileKey: fileKeyIn,
  nodeId: nodeIdIn,
  token,
  plan: planIn,
  title,
  subtitle,
  outDir,
  scale = 2,
  log = () => {},
}) {
  const parsed = url ? parseFigmaUrl(url) : { fileKey: fileKeyIn, nodeId: nodeIdIn };
  const fileKey = fileKeyIn || parsed.fileKey;
  const nodeId = nodeIdIn || parsed.nodeId;
  if (!fileKey) throw new Error("Missing Figma file key.");

  let plan = planIn;
  if (!plan) {
    log(`Reading Figma structure (${fileKey}${nodeId ? " @ " + nodeId : ""})…`);
    const root = await getNode(fileKey, nodeId, token);
    plan = autoPlan(root);
    log(`Detected: "${plan.title}" with ${plan.groups.length} creative group(s).`);
  }

  const finalTitle = title || plan.title || "Delivery";
  const dir = resolve(outDir || join("out", slug(finalTitle)));
  const imagesDir = join(dir, "images");
  await mkdir(imagesDir, { recursive: true });

  // Export every variation id in one batched call.
  const allIds = plan.groups.flatMap((g) => g.nodeIds);
  log(`Exporting ${allIds.length} image(s) from Figma…`);
  const urls = await exportImageUrls(fileKey, allIds, token, scale);

  // Download + assign file paths back into the manifest groups.
  const manifestGroups = [];
  let idx = 0;
  for (const g of plan.groups) {
    const images = [];
    for (const id of g.nodeIds) {
      const url = urls[id];
      if (!url) {
        log(`  ! no render for node ${id} (skipped)`);
        continue;
      }
      const rel = join("images", `${String(++idx).padStart(3, "0")}-${safe(id)}.png`);
      await download(url, join(dir, rel));
      images.push(rel);
    }
    if (images.length) manifestGroups.push({ name: g.name, images });
  }
  if (!manifestGroups.length) throw new Error("No images could be exported from Figma.");

  const manifest = { title: finalTitle, subtitle, groups: manifestGroups };
  const manifestPath = join(dir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  log(`Wrote ${manifestPath}`);
  return { manifestPath, imagesDir: dir, manifest };
}

// ---- small utils ----------------------------------------------------------

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function slug(s) {
  return (
    String(s)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "delivery"
  );
}
function safe(id) {
  return String(id).replace(/[^A-Za-z0-9]+/g, "_");
}
