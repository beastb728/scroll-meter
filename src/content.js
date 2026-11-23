// Scroll Meter content script.
// Measures absolute vertical scroll movement (up and down) on the page and any
// inner scroll containers, and reports batched totals to the background worker.
// It reads scroll positions only. It never reads page content or URLs.
(() => {
  if (window.__scrollMeter) return;
  window.__scrollMeter = true;

  const MAX_JUMP_PX = 5000; // single jumps bigger than this are anchor links / programmatic
  const MIN_DELTA_PX = 0.5; // sub-pixel jitter
  const FLUSH_MS = 3000;

  const lastY = new WeakMap();
  let pending = 0;
  let timer = null;
  let alive = true;

  const rootEl = () => document.scrollingElement || document.documentElement;

  function scrollTarget(t) {
    if (t === document || t === window) return rootEl();
    return t instanceof Element ? t : null;
  }

  function readY(el) {
    return el === rootEl() ? window.scrollY : el.scrollTop;
  }

  function onScroll(e) {
    const el = scrollTarget(e.target);
    if (!el) return;
    const y = readY(el);
    const prev = lastY.get(el);
    lastY.set(el, y);
    let delta;
    if (prev === undefined) {
      const userDriven = performance.now() - lastInputAt < FIRST_SCROLL_WINDOW_MS;
      if (!userDriven || y > FIRST_SCROLL_MAX_PX) return; // baseline only
      delta = y;
    } else {
      delta = Math.abs(y - prev);
    }
    if (delta < MIN_DELTA_PX || delta > MAX_JUMP_PX) return;
    pending += delta;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  // Chrome scrolls on the compositor before input events reach the page, so we
  // can't snapshot an inner container's position before its first scroll. If
  // that first scroll follows recent user input, assume it started at the top.
  let lastInputAt = -Infinity;
  const FIRST_SCROLL_WINDOW_MS = 1000;
  const FIRST_SCROLL_MAX_PX = 1000;
  function noteInput() {
    lastInputAt = performance.now();
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    const px = Math.floor(pending);
    if (px < 1 || !alive) return;
    pending -= px;
    send({ type: "scroll", px, host: location.hostname });
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // Extension was reloaded or removed: this script is orphaned.
      teardown();
    }
  }

  function teardown() {
    alive = false;
    document.removeEventListener("scroll", onScroll, true);
    for (const t of INPUT_EVENTS) document.removeEventListener(t, noteInput, true);
  }

  const INPUT_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"];
  for (const t of INPUT_EVENTS) document.addEventListener(t, noteInput, { capture: true, passive: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  window.addEventListener("pagehide", flush);

  const root = rootEl();
  if (root) lastY.set(root, window.scrollY);
})();
