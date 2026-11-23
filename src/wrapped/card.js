// Draws the shareable weekly card onto a canvas.
// Formats: "story" 1080x1920 (Instagram / WhatsApp Status), "square" 1080x1080 (posts, X, Reddit).
// Themes:  "poster" (bold gradient) and "receipt" (itemized receipt of shame).

export const FORMATS = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

/**
 * @param data {
 *   range, total, compare, emoji, title, line,
 *   worstDay: {name, dist} | null, worstSite: {site, dist} | null, late: string | null,
 *   days: [{label, dist}], sites: [{site, dist, frac}]
 * }
 */
export function drawCard(canvas, data, { theme = "poster", format = "story" } = {}) {
  const { w, h } = FORMATS[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  if (theme === "receipt") drawReceipt(ctx, w, h, data, format);
  else drawPoster(ctx, w, h, data, format);
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function brandMark(ctx, x, y, size) {
  // Mini version of the icon: white rounded square, coral arrow + ticks.
  const k = size / 128;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "#fff";
  roundRect(ctx, 4, 4, 120, 120, 28);
  ctx.fill();
  ctx.fillStyle = "#ff5a36";
  roundRect(ctx, 66, 26, 16, 54, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(50, 74);
  ctx.lineTo(98, 74);
  ctx.lineTo(74, 104);
  ctx.closePath();
  ctx.fill();
  for (const [ty, len] of [[30, 46], [44, 38], [58, 46], [72, 38], [86, 46], [100, 38]]) {
    roundRect(ctx, 20, ty - 3, len - 20, 6, 3);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- poster ----------

function drawPoster(ctx, w, h, d, format) {
  const story = format === "story";
  const pad = 96;
  const inner = w - pad * 2;

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#ff7a45");
  g.addColorStop(0.55, "#f43f5e");
  g.addColorStop(1, "#be185d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Ruler down the left edge.
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let y = 24, i = 0; y < h; y += 24, i++) {
    const len = i % 10 === 0 ? 52 : i % 5 === 0 ? 36 : 20;
    ctx.fillRect(0, y, len, 4);
  }

  // Big faint arrow in the background.
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#fff";
  const ax = w - 250, ay = story ? 260 : 140, aw = story ? 140 : 100, ah = story ? 900 : 560;
  ctx.fillRect(ax - aw / 2, ay, aw, ah);
  ctx.beginPath();
  ctx.moveTo(ax - aw * 1.6, ay + ah);
  ctx.lineTo(ax + aw * 1.6, ay + ah);
  ctx.lineTo(ax, ay + ah + aw * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  let y = story ? 170 : 116;

  font(ctx, 800, 40);
  ctx.save();
  ctx.letterSpacing = "8px";
  ctx.fillText("SCROLL WRAPPED", pad, y);
  ctx.restore();
  y += 52;
  ctx.globalAlpha = 0.85;
  font(ctx, 500, 34);
  ctx.fillText(d.range, pad, y);
  ctx.globalAlpha = 1;

  y += story ? 190 : 96;
  font(ctx, 600, story ? 52 : 44);
  ctx.fillText("This week I scrolled", pad, y);

  y += story ? 220 : 160;
  fitText(ctx, d.total, 900, story ? 240 : 190, inner);
  ctx.fillText(d.total, pad - 6, y);

  y += story ? 86 : 64;
  font(ctx, 650, story ? 50 : 40);
  for (const line of wrap(ctx, `${d.emoji} That's ${d.compare}.`, inner).slice(0, 2)) {
    ctx.fillText(line, pad, y);
    y += story ? 62 : 50;
  }

  // Title badge
  y += story ? 60 : 24;
  font(ctx, 900, story ? 76 : 60);
  const titleLines = wrap(ctx, d.title, inner - 80).slice(0, 2);
  const lineH = story ? 86 : 68;
  const badgeH = (story ? 96 : 76) + titleLines.length * lineH;
  ctx.fillStyle = "#fff";
  ctx.save();
  ctx.shadowColor = "rgba(80,0,30,0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, pad, y, inner, badgeH, 36);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#be185d";
  font(ctx, 800, story ? 28 : 24);
  ctx.save();
  ctx.letterSpacing = "5px";
  ctx.fillText("OFFICIAL TITLE", pad + 40, y + (story ? 62 : 50));
  ctx.restore();
  ctx.fillStyle = "#1d1a19";
  font(ctx, 900, story ? 76 : 60);
  titleLines.forEach((line, i) => ctx.fillText(line, pad + 40, y + (story ? 62 : 50) + (i + 1) * lineH));
  y += badgeH;

  if (story) {
    y += 52;
    ctx.fillStyle = "#fff";
    font(ctx, 500, 36);
    ctx.globalAlpha = 0.92;
    for (const line of wrap(ctx, d.line, inner).slice(0, 2)) {
      ctx.fillText(line, pad, y);
      y += 46;
    }
    ctx.globalAlpha = 1;
  }

  // Stat tiles
  const tiles = [
    d.worstDay && ["Worst day", d.worstDay.name, d.worstDay.dist],
    d.worstSite && ["Worst site", d.worstSite.site, d.worstSite.dist],
    d.late && ["After midnight", d.late, "0:00–5:00"],
  ].filter(Boolean);
  if (tiles.length) {
    y += story ? 50 : 30;
    const gap = 24;
    const tw = (inner - gap * (tiles.length - 1)) / tiles.length;
    const th = story ? 190 : 150;
    tiles.forEach(([label, value, sub], i) => {
      const x = pad + i * (tw + gap);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      roundRect(ctx, x, y, tw, th, 28);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.8;
      font(ctx, 700, 26);
      ctx.fillText(label.toUpperCase(), x + 28, y + 50);
      ctx.globalAlpha = 1;
      fitText(ctx, value, 800, 44, tw - 56);
      ctx.fillText(value, x + 28, y + (story ? 112 : 98));
      ctx.globalAlpha = 0.85;
      font(ctx, 500, 30);
      ctx.fillText(sub, x + 28, y + (story ? 156 : 132));
      ctx.globalAlpha = 1;
    });
    y += th;
  }

  // Top sites (story only)
  if (story && d.sites.length) {
    y += 64;
    ctx.fillStyle = "#fff";
    font(ctx, 800, 28);
    ctx.save();
    ctx.letterSpacing = "5px";
    ctx.globalAlpha = 0.85;
    ctx.fillText("WHERE IT WENT", pad, y);
    ctx.restore();
    y += 28;
    for (const s of d.sites.slice(0, 3)) {
      y += 50;
      font(ctx, 700, 34);
      ctx.textAlign = "left";
      ctx.fillText(s.site, pad, y);
      ctx.textAlign = "right";
      font(ctx, 500, 34);
      ctx.fillText(s.dist, w - pad, y);
      ctx.textAlign = "left";
      y += 18;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      roundRect(ctx, pad, y, inner, 12, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      roundRect(ctx, pad, y, Math.max(12, inner * s.frac), 12, 6);
      ctx.fill();
      y += 16;
    }
  }

  // Footer
  const fy = h - (story ? 110 : 56);
  brandMark(ctx, pad, fy - 46, 60);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  font(ctx, 800, 36);
  ctx.fillText("Scroll Meter", pad + 80, fy - 4);
  ctx.globalAlpha = 0.85;
  font(ctx, 500, 30);
  ctx.textAlign = "right";
  ctx.fillText("How far do you scroll?", w - pad, fy - 4);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

// ---------- receipt ----------

function drawReceipt(ctx, w, h, d, format) {
  const story = format === "story";
  ctx.fillStyle = "#2a2321";
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
  if (story && d.late) rows.push(["item", "AFTER MIDNIGHT", d.late]);
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
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = "#fbf7ee";
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

  ctx.fillStyle = "#2a2321";
  let y = py + 60;
  for (const item of layout.items) {
    y += item.h;
    renderRow(ctx, item, px + padX, innerW, y, size);
  }

  // Tagline under the receipt (story only).
  if (story) {
    ctx.fillStyle = "#fbf7ee";
    ctx.globalAlpha = 0.75;
    font(ctx, 600, 30, SANS);
    ctx.textAlign = "center";
    ctx.fillText("Scroll Meter · How far do you scroll?", w / 2, h - 70);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
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
      ctx.strokeStyle = "#2a2321";
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
