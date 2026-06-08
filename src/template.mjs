// The brandcasa "Review Document" template, drawn with pdfkit.
//
// Layout mirrors the Figma template:
//   - a header band (brandcasa logo left, "REVIEW DOCUMENT" right) on every page
//   - a title + subtitle block on the first page
//   - one rounded, black-bordered card per "Creative", each holding a grid of
//     the ad variations
//   - a matching footer band (logo + page number) on every page
//
// Text stays vector (crisp at any zoom); only the creative images are raster
// (already compressed by optimize.mjs before they reach here).

import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, "..", "assets");

export const DEFAULT_THEME = {
  // Layout: "continuous" (default) = one tall page like the Figma delivery exports;
  // set paged:true (CLI --paged) for fixed pages with page numbers, better for print.
  paged: false,
  page: { width: 960, height: 1280 },
  margin: { x: 37, top: 30, bottom: 30 },
  band: { height: 18, reviewSize: 10, reviewText: "REVIEW DOCUMENT" },
  colors: {
    bg: "#FAFAFA",
    text: "#0A0A0A",
    muted: "#7A7A7A",
    border: "#1A1A1A",
    dot: "#000000",
  },
  title: { size: 26, lineGap: 4, subSize: 17, gapBelow: 13 },
  card: {
    radius: 11,
    border: 0.75,
    padX: 13,
    padTop: 15,
    padBottom: 8,
    labelSize: 12,
    gapAfterLabel: 15,
    gapBetween: 28,
  },
  grid: { columns: 2, gap: 13 },
  texture: { enabled: true, step: 30, radius: 0.7, opacity: 0.05 },
  fonts: {
    regular: join(ASSETS, "fonts", "Inter-Regular.ttf"),
    semibold: join(ASSETS, "fonts", "Inter-SemiBold.ttf"),
    bold: join(ASSETS, "fonts", "Inter-Bold.ttf"),
  },
  logo: join(ASSETS, "brandcasa-logo.png"),
};

/**
 * Render the deliverable PDF.
 * @param {object} args
 * @param {{brand?:string,title:string,subtitle?:string,groups:Array<{name:string,images:Array<{buffer:Buffer,width:number,height:number}>}>}} args.manifest
 * @param {string} args.outPath
 * @param {object} [args.theme] partial theme overrides (merged over DEFAULT_THEME)
 * @returns {Promise<void>}
 */
export function renderDeliverable({ manifest, outPath, theme: overrides = {} }) {
  const t = mergeTheme(DEFAULT_THEME, overrides);
  const { width: PW, height: PH } = t.page;
  const contentLeft = t.margin.x;
  const contentRight = PW - t.margin.x;
  const contentWidth = contentRight - contentLeft;

  const headerY = t.margin.top;
  const contentTop = t.margin.top + t.band.height + 28;
  const footerY = PH - t.margin.bottom - t.band.height;
  const contentBottom = footerY - 20;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PW, PH],
      margin: 0, // we position everything by absolute coords; 0 margin disables pdfkit auto-pagination
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: [manifest.brand, manifest.title].filter(Boolean).join(" — "),
        Author: "brandcasa",
        Subject: manifest.subtitle || "Creative review",
      },
    });

    doc.registerFont("regular", t.fonts.regular);
    doc.registerFont("semibold", t.fonts.semibold);
    doc.registerFont("bold", t.fonts.bold);

    const stream = createWriteStream(outPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    // ---- shared group layout -------------------------------------------
    const columnsFor = (group) =>
      group.images.length <= 1 ? 1 : Math.min(t.grid.columns, group.images.length);
    const layoutGroup = (group, maxRowH) => {
      const columns = columnsFor(group);
      const innerW = contentWidth - 2 * t.card.padX; // images live inside the card padding
      const colW = (innerW - (columns - 1) * t.grid.gap) / columns;
      const boxes = group.images.map((img) => fitBox(img, colW, maxRowH));
      const rows = chunk(boxes, columns).map((row) => ({
        cells: row,
        height: Math.max(...row.map((b) => b.h)),
      }));
      const labelH = t.card.labelSize + t.card.gapAfterLabel;
      const cardH =
        t.card.padTop +
        labelH +
        rows.reduce((s, r, i) => s + r.height + (i ? t.grid.gap : 0), 0) +
        t.card.padBottom;
      return { group, columns, colW, rows, cardH };
    };

    // ---- continuous layout: ONE tall page, like the Figma delivery ------
    const renderContinuous = () => {
      const groups = manifest.groups.map((g) => layoutGroup(g, Infinity));
      doc.font("bold").fontSize(t.title.size);
      let titleH = doc.heightOfString(manifest.title, { width: contentWidth, lineGap: t.title.lineGap });
      if (manifest.subtitle) {
        doc.font("semibold").fontSize(t.title.subSize);
        titleH += 7 + doc.heightOfString(manifest.subtitle, { width: contentWidth });
      }
      titleH += t.title.gapBelow;
      const cardsH = groups.reduce((s, g, i) => s + g.cardH + (i ? t.card.gapBetween : 0), 0);
      const totalH = contentTop + titleH + cardsH + 20 + t.band.height + t.margin.bottom;
      if (totalH > 14000) return renderPaged(); // exceeds the PDF single-page limit → paginate

      doc.addPage({ size: [PW, totalH], margin: 0 });
      drawBackground(doc, t, PW, totalH);
      drawHeader(doc, t, contentLeft, contentRight, headerY);
      let y = contentTop;
      drawTitleBlock(doc, t, manifest, contentLeft, contentWidth, () => y, (ny) => (y = ny));
      for (const g of groups) {
        drawCard(doc, t, { ...g, contentLeft, contentWidth, y });
        y += g.cardH + t.card.gapBetween;
      }
      // matching footer band (logo + REVIEW DOCUMENT), like the template's bottom band
      drawHeader(doc, t, contentLeft, contentRight, totalH - t.margin.bottom - t.band.height);
      doc.end();
    };

    // ---- paginated layout: fixed pages (use --paged, good for printing) -
    const renderPaged = () => {
      let cursorY = 0;
      const startPage = () => {
        doc.addPage();
        drawBackground(doc, t, PW, PH);
        cursorY = contentTop;
      };
      startPage();
      drawTitleBlock(doc, t, manifest, contentLeft, contentWidth, () => cursorY, (y) => (cursorY = y));
      const maxRowH =
        contentBottom - contentTop -
        (t.card.padTop + t.card.labelSize + t.card.gapAfterLabel + t.card.padBottom);
      for (const group of manifest.groups) {
        const { columns, colW, rows } = layoutGroup(group, maxRowH);
        renderGroup(doc, t, {
          group, rows, columns, colW, contentLeft, contentWidth, contentTop, contentBottom,
          getY: () => cursorY, setY: (y) => (cursorY = y), startPage,
        });
      }
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        drawHeader(doc, t, contentLeft, contentRight, headerY);
        drawFooter(doc, t, contentLeft, contentRight, footerY, i + 1, range.count, manifest);
      }
      doc.flushPages();
      doc.end();
    };

    (t.paged ? renderPaged : renderContinuous)();
  });
}

// --------------------------------------------------------------------------
// drawing helpers
// --------------------------------------------------------------------------

function drawBackground(doc, t, PW, PH) {
  doc.save();
  doc.rect(0, 0, PW, PH).fill(t.colors.bg);
  if (t.texture.enabled) {
    doc.fillColor(t.colors.dot).fillOpacity(t.texture.opacity);
    const { step, radius } = t.texture;
    for (let y = step; y < PH; y += step) {
      for (let x = step; x < PW; x += step) {
        doc.circle(x, y, radius).fill();
      }
    }
    doc.fillOpacity(1);
  }
  doc.restore();
}

function drawHeader(doc, t, left, right, y) {
  const h = t.band.height;
  doc.image(t.logo, left, y, { height: h });
  doc
    .font("bold")
    .fontSize(t.band.reviewSize)
    .fillColor(t.colors.text)
    .text(t.band.reviewText, right - 240, y + (h - t.band.reviewSize) / 2, {
      width: 240,
      align: "right",
      characterSpacing: 0.6,
      lineBreak: false,
    });
}

function drawFooter(doc, t, left, right, y, pageNo, pageTotal, manifest) {
  const h = t.band.height;
  doc.image(t.logo, left, y, { height: h });
  const label = `${pageNo} / ${pageTotal}`;
  doc
    .font("semibold")
    .fontSize(10)
    .fillColor(t.colors.muted)
    .text(label, right - 240, y + (h - 10) / 2, {
      width: 240,
      align: "right",
      characterSpacing: 0.4,
      lineBreak: false,
    });
}

function drawTitleBlock(doc, t, manifest, left, width, getY, setY) {
  let y = getY();
  doc.font("bold").fontSize(t.title.size).fillColor(t.colors.text);
  doc.text(manifest.title, left, y, { width, lineGap: t.title.lineGap });
  y = doc.y;
  if (manifest.subtitle) {
    y += 7;
    doc.font("semibold").fontSize(t.title.subSize).fillColor(t.colors.text);
    doc.text(manifest.subtitle, left, y, { width });
    y = doc.y;
  }
  setY(y + t.title.gapBelow);
}

/** Draw one bordered card (border + label + image rows) at y. Returns its height. */
function drawCard(doc, t, { group, rows, columns, colW, contentLeft, contentWidth, y, first = true }) {
  const labelH = t.card.labelSize + t.card.gapAfterLabel;
  const rowsH = rows.reduce((s, r, i) => s + r.height + (i ? t.grid.gap : 0), 0);
  const segHeight = t.card.padTop + labelH + rowsH + t.card.padBottom;

  doc
    .roundedRect(contentLeft, y, contentWidth, segHeight, t.card.radius)
    .lineWidth(t.card.border)
    .strokeColor(t.colors.border)
    .stroke();

  let innerY = y + t.card.padTop;
  if (first) doc.font("bold").fontSize(t.card.labelSize).fillColor(t.colors.text);
  else doc.font("semibold").fontSize(t.card.labelSize - 1).fillColor(t.colors.muted);
  doc.text(first ? group.name : `${group.name} (cont.)`, contentLeft + t.card.padX, innerY, {
    width: contentWidth - 2 * t.card.padX,
    lineBreak: false,
  });
  innerY += labelH;

  const innerW = contentWidth - 2 * t.card.padX;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowTop = innerY;
    let x = contentLeft + t.card.padX;
    for (const box of row.cells) {
      const cellX = columns === 1 ? x + (innerW - box.w) / 2 : x + (colW - box.w) / 2;
      const cellY = rowTop + (row.height - box.h) / 2;
      doc.image(box.img.buffer, cellX, cellY, { width: box.w, height: box.h });
      x += colW + t.grid.gap;
    }
    innerY += row.height + (r < rows.length - 1 ? t.grid.gap : 0);
  }
  return segHeight;
}

/**
 * Render one creative group as a bordered card.
 *
 * A group is kept whole on a single page whenever it fits within one full page.
 * Only when a single group is physically taller than a page is it split into
 * bordered "segments", and continuation segments are labelled "<name> (cont.)".
 */
function renderGroup(doc, t, ctx) {
  const {
    group,
    rows,
    columns,
    colW,
    contentLeft,
    contentWidth,
    contentTop,
    contentBottom,
    getY,
    setY,
    startPage,
  } = ctx;

  const labelH = t.card.labelSize + t.card.gapAfterLabel;
  const rowsHeight = (rs) => rs.reduce((s, r, i) => s + r.height + (i ? t.grid.gap : 0), 0);
  const fullPageContentH = contentBottom - contentTop;

  // Keep the whole card together: if it fits on a fresh page but not in the space
  // left here, move it to the next page rather than splitting it.
  const groupTotalH = t.card.padTop + labelH + rowsHeight(rows) + t.card.padBottom;
  if (groupTotalH <= fullPageContentH && getY() + groupTotalH > contentBottom) {
    startPage();
  }

  let remaining = [...rows];
  let first = true;

  while (remaining.length) {
    let y = getY();
    const minSegment = t.card.padTop + labelH + remaining[0].height + t.card.padBottom;

    // Not enough room on this page for the label + one row → new page.
    if (y + minSegment > contentBottom) {
      startPage();
      y = getY();
    }

    // Greedily pack rows into this segment.
    const avail = contentBottom - y;
    const fitRows = [];
    let used = t.card.padTop + labelH + t.card.padBottom;
    for (const row of remaining) {
      const add = (fitRows.length ? t.grid.gap : 0) + row.height;
      if (fitRows.length && used + add > avail) break;
      used += add;
      fitRows.push(row);
    }
    if (!fitRows.length) fitRows.push(remaining[0]); // safety: always place ≥1 row

    const segHeight = t.card.padTop + labelH + rowsHeight(fitRows) + t.card.padBottom;

    // Card border.
    doc
      .roundedRect(contentLeft, y, contentWidth, segHeight, t.card.radius)
      .lineWidth(t.card.border)
      .strokeColor(t.colors.border)
      .stroke();

    // Label (bold on the first segment, muted "(cont.)" on continuations).
    let innerY = y + t.card.padTop;
    if (first) {
      doc.font("bold").fontSize(t.card.labelSize).fillColor(t.colors.text);
      doc.text(group.name, contentLeft + t.card.padX, innerY, {
        width: contentWidth - 2 * t.card.padX,
        lineBreak: false,
      });
    } else {
      doc.font("semibold").fontSize(t.card.labelSize - 1).fillColor(t.colors.muted);
      doc.text(`${group.name} (cont.)`, contentLeft + t.card.padX, innerY, {
        width: contentWidth - 2 * t.card.padX,
        lineBreak: false,
      });
    }
    innerY += labelH;

    // Image rows.
    for (let r = 0; r < fitRows.length; r++) {
      const row = fitRows[r];
      const rowTop = innerY;
      let x = contentLeft + t.card.padX;
      const innerW = contentWidth - 2 * t.card.padX;
      // For a single-image row spanning one column, center it in the inner width.
      for (let c = 0; c < row.cells.length; c++) {
        const box = row.cells[c];
        const cellX = columns === 1 ? x + (innerW - box.w) / 2 : x + (colW - box.w) / 2;
        const cellY = rowTop + (row.height - box.h) / 2;
        doc.image(box.img.buffer, cellX, cellY, { width: box.w, height: box.h });
        x += colW + t.grid.gap;
      }
      innerY += row.height + (r < fitRows.length - 1 ? t.grid.gap : 0);
    }

    if (process.env.DB_DEBUG)
      console.error(
        `[seg] ${group.name} first=${first} y=${y.toFixed(0)} segH=${segHeight.toFixed(0)} ` +
          `rows=${fitRows.length}/${remaining.length} contentBottom=${contentBottom}`
      );

    setY(y + segHeight + t.card.gapBetween);
    remaining = remaining.slice(fitRows.length);
    first = false;
  }
}

// --------------------------------------------------------------------------
// math helpers
// --------------------------------------------------------------------------

/** Fit an image into a cell of width colW, capping height to maxH (letterbox, centered). */
function fitBox(img, colW, maxH) {
  const aspect = img.width / img.height;
  let w = colW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { img, w, h };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function mergeTheme(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...out[k], ...v } : v;
  }
  return out;
}
