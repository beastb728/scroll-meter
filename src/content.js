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

  const IS_TOP = window === window.top;
  const M_PER_PX = 2.54 / 96 / 100;

  const lastY = new WeakMap();
  let pending = 0;
  let localPx = 0; // everything this frame has counted, for the live overlay
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
    localPx += delta;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
    if (overlay) updateOverlay();
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
    const sentAt = localPx - pending;
    send({ type: "scroll", px, host: location.hostname }, sentAt);
  }

  function send(msg, sentAt = localPx) {
    try {
      chrome.runtime.sendMessage(msg).then((r) => onReply(r, sentAt), () => {});
    } catch {
      // Extension was reloaded or removed: this script is orphaned.
      teardown();
    }
  }

  function onReply(reply, sentAt) {
    if (!reply || !alive) return;
    if (reply.stop) return teardown(); // site permission was revoked
    if (!IS_TOP) return;
    if ("overlay" in reply) overlay = reply.overlay;
    if (overlay && typeof reply.todayM === "number") {
      base = { todayM: reply.todayM, localPx: sentAt };
    }
    if (reply.nudge) showNudge(reply.nudge);
    if (overlay && reply.passed) celebrate(reply.passed);
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
      .pill {
        position: fixed; right: 18px; bottom: 18px; display: flex; align-items: center; gap: 10px;
        min-width: 230px; max-width: min(380px, calc(100vw - 36px)); padding: 9px 14px 9px 10px; border-radius: 999px;
        color: #fff; background: rgba(29, 26, 25, .88); backdrop-filter: blur(8px);
        box-shadow: 0 10px 30px -8px rgba(0,0,0,.4); font-size: 12.5px; font-weight: 650;
        opacity: 0; transform: translateY(12px) scale(.96); transition: opacity .25s, transform .25s;
      }
      .pill.show { opacity: 1; transform: none; }
      .pill.party { background: linear-gradient(135deg, #ff5a36, #f43f5e); transform: scale(1.04); }
      .p-emoji { font-size: 22px; line-height: 1; }
      .p-main { flex: 1; min-width: 0; }
      .p-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .p-track { height: 5px; margin-top: 5px; border-radius: 3px; background: rgba(255,255,255,.22); overflow: hidden; }
      .p-track i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #ff7a45, #f43f5e); transition: width .2s; }
      .party .p-track i { background: #fff; }
      .p-dist { font-variant-numeric: tabular-nums; font-weight: 800; opacity: .95; }
      @media (prefers-color-scheme: dark) {
        .nudge { background: #221c1a; color: #f7efe9; box-shadow: 0 24px 60px -12px rgba(0,0,0,.6), 0 0 0 1px rgba(255,106,72,.35); }
        .body, .later { color: #b8aaa1; }
      }
    </style><div class="slot"></div>`;
    (document.body || document.documentElement).append(host);
    ui = shadow; // shadow.host is the element, used by teardown()
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
    ui?.host.remove();
    document.removeEventListener("scroll", onScroll, true);
    for (const t of INPUT_EVENTS) document.removeEventListener(t, noteInput, true);
  }

  // ---------- live climb overlay ----------
  // A small pill that shows progress towards the next landmark while you scroll.

  let overlay = null; // { units, ladder: [{emoji, one, meters}] } when enabled
  let base = { todayM: 0, localPx: 0 }; // last total confirmed by the background
  let hideTimer = null;
  let celebrating = false;

  const estimateM = () => base.todayM + (localPx - base.localPx) * M_PER_PX;

  function fmt(m) {
    if (overlay?.units === "imperial") {
      const ft = m / 0.3048;
      return ft < 1000 ? `${Math.round(ft)} ft` : `${(m / 1609.344).toFixed(2)} mi`;
    }
    if (m < 1) return `${Math.round(m * 100)} cm`;
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  function pill() {
    const root = uiRoot();
    let el = root.querySelector(".pill");
    if (!el) {
      el = document.createElement("div");
      el.className = "pill";
      el.innerHTML = `<div class="p-emoji"></div><div class="p-main"><div class="p-label"></div><div class="p-track"><i></i></div></div><div class="p-dist"></div>`;
      root.querySelector(".slot").append(el);
    }
    return el;
  }

  function updateOverlay() {
    if (!overlay || !IS_TOP || celebrating) return;
    const m = estimateM();
    const ladder = overlay.ladder;
    const i = ladder.findIndex((l) => l.meters > m);
    const next = ladder[i];
    const prevM = i > 0 ? ladder[i - 1].meters : 0;
    const el = pill();
    el.classList.remove("party");
    el.querySelector(".p-emoji").textContent = next ? next.emoji : "🚀";
    el.querySelector(".p-label").textContent = next ? `Next: ${next.one}` : "Off the charts";
    const progress = next ? (m - prevM) / (next.meters - prevM) : 1;
    el.querySelector(".p-track i").style.width = `${Math.min(100, Math.max(2, progress * 100)).toFixed(1)}%`;
    el.querySelector(".p-dist").textContent = fmt(m);
    show(el, 2500);
  }

  function celebrate(landmark) {
    const el = pill();
    celebrating = true;
    el.classList.add("party");
    el.querySelector(".p-emoji").textContent = landmark.emoji;
    el.querySelector(".p-label").textContent = `You just scrolled past ${landmark.a} ${landmark.one}!`;
    el.querySelector(".p-track i").style.width = "100%";
    el.querySelector(".p-dist").textContent = "🎉";
    show(el, 4000, () => (celebrating = false));
  }

  function show(el, ms, after) {
    el.classList.add("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      el.classList.remove("show");
      after?.();
    }, ms);
  }

  const INPUT_EVENTS = ["wheel", "touchmove", "keydown", "pointerdown"];
  for (const t of INPUT_EVENTS) document.addEventListener(t, noteInput, { capture: true, passive: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  window.addEventListener("pagehide", flush);

  const root = rootEl();
  if (root) lastY.set(root, window.scrollY);

  if (IS_TOP) send({ type: "hello" });
})();
