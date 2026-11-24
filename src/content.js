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
      chrome.runtime.sendMessage(msg).then(onReply, () => {});
    } catch {
      // Extension was reloaded or removed: this script is orphaned.
      teardown();
    }
  }

  function onReply(reply) {
    if (!reply) return;
    if (reply.stop) return teardown(); // site permission was revoked
    if (reply.nudge && window === window.top) showNudge(reply.nudge);
  }

  // ---------- UI (shadow DOM so page styles can't leak in or out) ----------

  let ui = null;
  function uiRoot() {
    if (ui) return ui;
    const host = document.createElement("scroll-meter-ui");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; inset: auto 0 0 0; pointer-events: none;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .nudge {
        pointer-events: auto; position: fixed; left: 50%; bottom: 24px; width: min(440px, calc(100vw - 32px));
        transform: translate(-50%, 140%); transition: transform .45s cubic-bezier(.2,.9,.25,1.2);
        display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; align-items: start;
        padding: 18px 18px 16px; border-radius: 18px; color: #1d1a19; background: #fff8f1;
        box-shadow: 0 24px 60px -12px rgba(60, 20, 10, .45), 0 0 0 1px rgba(255, 90, 54, .25);
      }
      .nudge.show { transform: translate(-50%, 0); }
      .emoji { font-size: 34px; line-height: 1; grid-row: span 2; }
      .title { font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
      .body { font-size: 14px; line-height: 1.45; color: #5e5550; }
      .row { grid-column: 2; display: flex; gap: 8px; margin-top: 8px; }
      button { font: inherit; font-size: 13.5px; font-weight: 700; border: 0; border-radius: 10px; padding: 8px 14px; cursor: pointer; }
      .ok { color: #fff; background: linear-gradient(135deg, #ff5a36, #f43f5e); }
      .later { color: #5e5550; background: transparent; }
      @media (prefers-color-scheme: dark) {
        .nudge { background: #221c1a; color: #f7efe9; box-shadow: 0 24px 60px -12px rgba(0,0,0,.6), 0 0 0 1px rgba(255,106,72,.35); }
        .body, .later { color: #b8aaa1; }
      }
    </style><div class="slot"></div>`;
    (document.body || document.documentElement).append(host);
    ui = shadow;
    return ui;
  }

  function showNudge({ title, body, emoji }) {
    const root = uiRoot();
    root.querySelector(".nudge")?.remove();
    const el = document.createElement("div");
    el.className = "nudge";
    el.setAttribute("role", "status");
    const e = Object.assign(document.createElement("div"), { className: "emoji", textContent: emoji });
    const t = Object.assign(document.createElement("div"), { className: "title", textContent: title });
    const b = Object.assign(document.createElement("div"), { className: "body", textContent: body });
    const row = Object.assign(document.createElement("div"), { className: "row" });
    const ok = Object.assign(document.createElement("button"), { className: "ok", textContent: "I'm done for now" });
    const later = Object.assign(document.createElement("button"), { className: "later", textContent: "Five more minutes" });
    const close = () => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 500);
    };
    ok.onclick = close;
    later.onclick = close;
    row.append(ok, later);
    el.append(e, t, b, row);
    root.querySelector(".slot").append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
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
