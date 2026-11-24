// Minimal canvas bar chart for the 7-day view: hatched past days, today in tape yellow.

/**
 * @param canvas  <canvas> element (CSS-sized; we scale for devicePixelRatio)
 * @param bars    [{ label, value, display, highlight }]
 */
export function drawBars(canvas, bars) {
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const mono = color("--mono");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const top = 16;
  const bottom = 18;
  const plotH = h - top - bottom;
  const baseY = top + plotH;
  const max = Math.max(...bars.map((b) => b.value), 1e-9);
  const slot = w / bars.length;
  const barW = Math.min(28, slot * 0.62);

  ctx.textAlign = "center";
  bars.forEach((b, i) => {
    const x = Math.round(slot * i + slot / 2);
    const bh = b.value > 0 ? Math.max(2, (b.value / max) * plotH) : 0;
    const left = Math.round(x - barW / 2);
    const y = Math.round(baseY - bh);
    if (bh) {
      if (b.highlight) {
        ctx.fillStyle = color("--tape");
        ctx.fillRect(left, y, barW, bh);
        ctx.strokeStyle = color("--on-tape");
        ctx.lineWidth = 1.5;
        ctx.strokeRect(left + 0.75, y + 0.75, barW - 1.5, bh - 0.75);
      } else {
        // Past days: pencil hatching inside a hairline box.
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, y, barW, bh);
        ctx.clip();
        ctx.strokeStyle = color("--ink-2");
        ctx.lineWidth = 1;
        for (let d = -bh; d < barW; d += 4) {
          ctx.moveTo(left + d, y + bh);
          ctx.lineTo(left + d + bh, y);
        }
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = color("--ink");
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, y + 0.5, barW - 1, bh);
      }
    }

    ctx.font = `${b.highlight ? 700 : 500} 9.5px ${mono}`;
    ctx.fillStyle = b.highlight ? color("--ink") : color("--muted");
    ctx.fillText(b.label, x, h - 3);
    if (b.display && (b.highlight || b.value === max)) {
      ctx.font = `600 10px ${mono}`;
      ctx.fillStyle = color("--ink");
      ctx.fillText(b.display, x, Math.max(10, y - 5));
    }
  });

  // Baseline with ticks under each day, like a ruler.
  ctx.fillStyle = color("--ink");
  ctx.fillRect(0, baseY, w, 1);
  bars.forEach((_, i) => ctx.fillRect(Math.round(slot * i + slot / 2), baseY, 1.5, 4));
}
