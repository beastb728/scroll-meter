// Minimal canvas bar chart for the 7-day view.

/**
 * @param canvas  <canvas> element (CSS-sized; we scale for devicePixelRatio)
 * @param bars    [{ label, value, display, highlight }]
 */
export function drawBars(canvas, bars) {
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const top = 18;
  const bottom = 18;
  const plotH = h - top - bottom;
  const max = Math.max(...bars.map((b) => b.value), 1e-9);
  const slot = w / bars.length;
  const barW = Math.min(26, slot * 0.6);

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";

  bars.forEach((b, i) => {
    const x = slot * i + slot / 2;
    const bh = b.value > 0 ? Math.max(3, (b.value / max) * plotH) : 2;
    const y = top + plotH - bh;
    ctx.fillStyle = b.highlight ? color("--accent") : b.value > 0 ? color("--bar") : color("--line");
    roundRect(ctx, x - barW / 2, y, barW, bh, Math.min(6, bh / 2));
    ctx.fill();

    ctx.fillStyle = b.highlight ? color("--ink") : color("--muted");
    ctx.fillText(b.label, x, h - 4);
    if (b.display && (b.highlight || b.value === max)) {
      ctx.fillStyle = color("--ink");
      ctx.fillText(b.display, x, Math.max(11, y - 5));
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
