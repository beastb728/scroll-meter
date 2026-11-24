// Draws the shareable weekly card onto a canvas.
// Formats: "story" 1080x1920 (Instagram / WhatsApp Status), "square" 1080x1080 (posts, X, Reddit).
// Themes:  "tape" (a strip of measuring tape scaled to your week) and "receipt" (itemized receipt of shame).

export const FORMATS = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

// Bundled fonts (see src/ui/base.css). wrapped.js waits for them before drawing.
const SANS = '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const TAPE = "#ffcb05";
const INK = "#1b1a17";
const RED = "#c8321f";
const PAPER = "#f5f2ea";

export const CARD_FONTS = [
  `400 100px ${SERIF}`,
  `italic 400 100px ${SERIF}`,
  `500 100px ${SANS}`,
  `700 100px ${SANS}`,
  `500 100px ${MONO}`,
  `800 100px ${MONO}`,
];

/** Fine grain so flat colour reads as printed paper. Deterministic, so re-renders don't shimmer. */
function grain(ctx, w, h, alpha = 0.06) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.fillStyle = INK;
  for (let i = 0; i < (w * h) / 22; i++) {
    ctx.globalAlpha = rnd() * alpha;
    ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  }
  ctx.restore();
}

/**
 * @param data {
 *   range, total, totalMeters, units, compare, title, line,
 *   stats: [{label, value, receipt?}], // receipt: short value, shown on the receipt too
 *   days: [{label, dist}], sites: [{site, dist, frac}]
 * }
 */
export function drawCard(canvas, data, { theme = "tape", format = "story" } = {}) {
  const { w, h } = FORMATS[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  if (theme === "receipt") drawReceipt(ctx, w, h, data, format);
  else drawTape(ctx, w, h, data, format);
}

// ---------- helpers ----------

function font(ctx, weight, size, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`;
}

/** Shrinks the font until `text` fits `maxW`. Returns the size used. */
function fitText(ctx, text, weight, size, maxW, family = SANS, min = 20) {
  let s = size;
  font(ctx, weight, s, family);
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    font(ctx, weight, s, family);
  }
  return s;
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(ctx, text, x, y, spacing) {
  ctx.save();
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A "nice" ruler step (1, 2, 5 x 10^n) giving roughly `count` labelled marks. */
function niceStep(total, count) {
  const raw = Math.max(total, 1e-6) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

function trimNum(n) {
  return n >= 100 ? String(Math.round(n)) : String(+n.toFixed(n >= 10 ? 0 : 1));
}

// ---------- tape ----------

function drawTape(ctx, w, h, d, format) {
  const story = format === "story";
  const k = story ? 1 : 0.82; // type scale

  ctx.fillStyle = TAPE;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h);

  // Ruler down the left edge, scaled so the whole card is your week.
  const footerH = story ? 150 : 110;
  const rulerH = h - footerH;
  const unitM = d.units === "imperial" ? 0.3048 : 1; // label in ft or m
  const unitLabel = d.units === "imperial" ? "ft" : "m";
  const total = Math.max(d.totalMeters / unitM, 1);
  const step = niceStep(total, story ? 14 : 9);
  const pxPer = rulerH / total;
  const minorEvery = step / 10;
  ctx.fillStyle = INK;
  for (let i = 0, v = 0; v <= total + 1e-9; i++, v = i * minorEvery) {
    const y = Math.round(v * pxPer);
    const major = i % 10 === 0;
    const mid = i % 5 === 0;
    const len = major ? 64 : mid ? 42 : 24;
    if (minorEvery * pxPer >= 5 || mid) ctx.fillRect(0, y, len, major ? 4 : 2.5);
    if (major && i > 0) {
      const n = i / 10;
      ctx.fillStyle = n % 5 === 0 ? RED : INK;
      font(ctx, 700, 28 * k, MONO);
      ctx.fillText(trimNum(v), 76, y + 11);
      ctx.fillStyle = INK;
    }
  }
  font(ctx, 700, 22 * k, MONO);
  ctx.fillText(unitLabel, 76, 34);

  const x = story ? 230 : 210;
  const right = w - 80;
  const inner = right - x;
  let y = story ? 150 : 104;

  ctx.fillStyle = INK;
  font(ctx, 800, 30 * k, MONO);
  spaced(ctx, "SCROLL WRAPPED", x, y, 6);
  y += 46 * k;
  font(ctx, 500, 28 * k, MONO);
  ctx.fillText(d.range, x, y);

  y += story ? 170 : 104;
  font(ctx, "italic 400", 64 * k, SERIF);
  ctx.fillText("This week I scrolled", x, y);

  // Big number in the serif, unit in italic.
  const [num, unit] = splitUnit(d.total);
  y += story ? 290 : 220;
  const numSize = fitText(ctx, num, 400, story ? 360 : 280, inner - 170, SERIF);
  ctx.save();
  ctx.letterSpacing = `${-numSize * 0.03}px`;
  ctx.fillText(num, x - 10, y);
  const numW = ctx.measureText(num).width;
  ctx.restore();
  font(ctx, "italic 400", numSize * 0.4, SERIF);
  ctx.fillText(unit, x + numW + numSize * 0.06, y);

  y += story ? 92 : 72;
  font(ctx, 400, 60 * k, SERIF);
  for (const line of wrap(ctx, `That's ${d.compare}.`, inner).slice(0, 2)) {
    ctx.fillText(line, x, y);
    y += 64 * k;
  }

  // Title on a label-maker strip.
  y += story ? 60 : 22;
  font(ctx, 600, 22 * k, MONO);
  spaced(ctx, "OFFICIAL TITLE", x, y, 4);
  y += 22;
  const titleSize = fitText(ctx, d.title.toUpperCase(), 800, 60 * k, inner - 56, MONO, 30);
  const stripH = titleSize * 1.75;
  const stripW = Math.min(inner, ctx.measureText(d.title.toUpperCase()).width + 56);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.018);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, stripW, stripH);
  ctx.fillStyle = TAPE;
  ctx.fillText(d.title.toUpperCase(), 28, stripH * 0.68);
  ctx.restore();
  y += stripH + (story ? 54 : 30);

  if (story) {
    ctx.fillStyle = INK;
    font(ctx, "italic 400", 40, SERIF);
    for (const line of wrap(ctx, d.line, inner).slice(0, 2)) {
      ctx.fillText(line, x, y);
      y += 46;
    }
    y += 26;
  }

  // Stats as a ruled table.
  const rows = d.stats.slice(0, story ? 6 : 3);
  // Stretch rows to use the free space above the footer.
  const free = h - footerH - (story ? 90 : 50) - y;
  const rowH = rows.length ? Math.max(story ? 84 : 64, Math.min(story ? 112 : 76, free / rows.length)) : 0;
  ctx.fillStyle = INK;
  for (const r of rows) {
    ctx.fillRect(x, y, inner, 2);
    font(ctx, 600, 21 * k, MONO);
    spaced(ctx, r.label.toUpperCase(), x, y + rowH * 0.6, 3);
    ctx.textAlign = "right";
    fitText(ctx, r.value, 600, 40 * k, inner * 0.6);
    ctx.fillText(r.value, right, y + rowH * 0.64);
    ctx.textAlign = "left";
    y += rowH;
  }
  if (rows.length) ctx.fillRect(x, y, inner, 2);

  // Footer band.
  ctx.fillStyle = INK;
  ctx.fillRect(0, h - footerH, w, footerH);
  ctx.fillStyle = TAPE;
  font(ctx, 700, 30 * k, MONO);
  spaced(ctx, "SCROLL METER", x, h - footerH / 2 + 11, 6);
  font(ctx, "italic 400", 40 * k, SERIF);
  ctx.textAlign = "right";
  ctx.fillText("How far do you scroll?", right, h - footerH / 2 + 11);
  ctx.textAlign = "left";
}

function splitUnit(text) {
  const i = text.lastIndexOf(" ");
  return i > 0 ? [text.slice(0, i), text.slice(i + 1)] : [text, ""];
}

// ---------- receipt ----------

function drawReceipt(ctx, w, h, d, format) {
  const story = format === "story";
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  // Rows: [kind, left, right?]
  const rows = [
    ["center-big", "SCROLL METER"],
    ["center", "RECEIPT OF SHAME"],
    ["center", d.range.toUpperCase()],
    ["rule"],
  ];
  if (story) {
    for (const day of d.days) rows.push(["item", day.label.toUpperCase(), day.dist]);
    rows.push(["rule"]);
  }
  for (const s of d.sites.slice(0, story ? 5 : 3)) rows.push(["item", s.site, s.dist]);
  rows.push(["rule"]);
  rows.push(["total", "TOTAL", d.total]);
  rows.push(["wrap", `= ${d.compare}`.toUpperCase()]);
  if (story) {
    for (const s of d.stats) if (s.receipt) rows.push(["item", s.label.toUpperCase(), s.receipt]);
  }
  rows.push(["rule"]);
  rows.push(["left", "CUSTOMER TYPE:"]);
  rows.push(["title", d.title.toUpperCase()]);
  rows.push(["rule"]);
  rows.push(["barcode"]);
  rows.push(["center", "THANK YOU FOR SCROLLING"]);
  rows.push(["center", "NO REFUNDS ON TIME SPENT"]);

  const paperW = story ? 860 : 760;
  const px = (w - paperW) / 2;
  const padX = 56;
  const innerW = paperW - padX * 2;

  // Pick a font size that fits everything on the paper.
  const maxPaperH = h - (story ? 240 : 120);
  let size = story ? 38 : 34;
  let layout;
  for (; size >= 18; size -= 1) {
    layout = layoutReceipt(ctx, rows, size, innerW);
    if (layout.height + 120 <= maxPaperH) break;
  }
  const paperH = layout.height + 120;
  const py = (h - paperH) / 2 - (story ? 20 : 0);

  // Paper with zig-zag bottom edge.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + paperW, py);
  ctx.lineTo(px + paperW, py + paperH);
  const tooth = 20;
  for (let x = px + paperW; x > px; x -= tooth) {
    ctx.lineTo(x - tooth / 2, py + paperH - tooth * 0.7);
    ctx.lineTo(Math.max(px, x - tooth), py + paperH);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = INK;
  let y = py + 60;
  for (const item of layout.items) {
    y += item.h;
    renderRow(ctx, item, px + padX, innerW, y, size);
  }

  // Tagline under the receipt (story only).
  if (story) {
    ctx.fillStyle = TAPE;
    font(ctx, 700, 28, MONO);
    ctx.textAlign = "center";
    spaced(ctx, "SCROLL METER · HOW FAR DO YOU SCROLL?", w / 2, h - 70, 2);
    ctx.textAlign = "left";
  }
}

function layoutReceipt(ctx, rows, size, innerW) {
  const items = [];
  let height = 0;
  for (const [kind, a, b] of rows) {
    let lines = null;
    let h = size * 1.45;
    if (kind === "center-big") h = size * 2;
    if (kind === "rule") h = size * 1.1;
    if (kind === "barcode") h = size * 3.2;
    if (kind === "wrap" || kind === "title") {
      font(ctx, kind === "title" ? 800 : 500, kind === "title" ? size * 1.25 : size, MONO);
      lines = wrap(ctx, a, innerW);
      h = lines.length * (kind === "title" ? size * 1.6 : size * 1.45);
    }
    items.push({ kind, a, b, lines, h });
    height += h;
  }
  return { items, height };
}

function renderRow(ctx, { kind, a, b, lines }, x, innerW, y, size) {
  const right = x + innerW;
  ctx.textAlign = "left";
  switch (kind) {
    case "center-big":
      font(ctx, 800, size * 1.5, MONO);
      ctx.textAlign = "center";
      ctx.fillText(a, x + innerW / 2, y - size * 0.3);
      break;
    case "center":
      font(ctx, 500, size * 0.85, MONO);
      ctx.textAlign = "center";
      ctx.fillText(a, x + innerW / 2, y - size * 0.35);
      break;
    case "left":
      font(ctx, 500, size, MONO);
      ctx.fillText(a, x, y - size * 0.35);
      break;
    case "rule":
      ctx.save();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 9]);
      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.5);
      ctx.lineTo(right, y - size * 0.5);
      ctx.stroke();
      ctx.restore();
      break;
    case "item":
    case "total": {
      const weight = kind === "total" ? 800 : 500;
      const s = kind === "total" ? size * 1.2 : size;
      font(ctx, weight, s, MONO);
      const rightW = ctx.measureText(b).width;
      let left = a;
      while (left.length > 3 && ctx.measureText(left).width > innerW - rightW - s * 2) left = left.slice(0, -2) + "…";
      ctx.fillText(left, x, y - size * 0.35);
      ctx.textAlign = "right";
      ctx.fillText(b, right, y - size * 0.35);
      const dotsFrom = x + ctx.measureText(left).width + s * 0.5;
      const dotsTo = right - rightW - s * 0.5;
      ctx.textAlign = "left";
      if (kind === "item") {
        const dot = ctx.measureText(".").width;
        const n = Math.max(0, Math.floor((dotsTo - dotsFrom) / dot));
        ctx.globalAlpha = 0.45;
        ctx.fillText(".".repeat(n), dotsFrom, y - size * 0.35);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "wrap":
    case "title": {
      const isTitle = kind === "title";
      font(ctx, isTitle ? 800 : 500, isTitle ? size * 1.25 : size, MONO);
      const lh = isTitle ? size * 1.6 : size * 1.45;
      let ly = y - lines.length * lh;
      for (const line of lines) {
        ly += lh;
        ctx.fillText(line, x, ly - size * 0.4);
      }
      break;
    }
    case "barcode": {
      // Deterministic pseudo-barcode.
      let seed = 7;
      const top = y - size * 2.9;
      const bh = size * 2.2;
      for (let bx = x; bx < right; ) {
        seed = (seed * 9301 + 49297) % 233280;
        const bw = 2 + (seed % 4) * 2;
        ctx.fillRect(bx, top, bw, bh);
        bx += bw + 3 + ((seed >> 3) % 3) * 2;
      }
      break;
    }
  }
  ctx.textAlign = "left";
}
