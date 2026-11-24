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
  // Only count scrolling that follows real input. Long enough to cover momentum
  // and touch flings, short enough to ignore pages that scroll themselves
  // (live chats, tickers, feeds shifting while you read).
  const INPUT_WINDOW_MS = 3000;
  const FIRST_SCROLL_MAX_PX = 1000;
  const SPEED_WINDOW_MS = 500;
  const MAX_SPEED_PX_S = 40_000;

  const IS_TOP = window === window.top;
  const M_PER_PX = 2.54 / 96 / 100;

  const lastY = new WeakMap();
  let pending = 0; // px not yet reported
  let pendingUp = 0; // of which scrolled upwards
  let pendingPeak = 0; // fastest px/s since last report
  let localPx = 0; // everything this frame has counted, for the live overlay
  let timer = null;
  let alive = true;
  let lastInputAt = -Infinity;
  const recent = []; // [time, px] within SPEED_WINDOW_MS

  const rootEl = () => document.scrollingElement || document.documentElement;
  const now = () => performance.now();

  function scrollTarget(t) {
    if (t === document || t === window) return rootEl();
    return t instanceof Element ? t : null;
  }

  function readY(el) {
    return el === rootEl() ? window.scrollY : el.scrollTop;
  }

  function noteInput(e) {
    // Mouse movement only counts while a button is held (dragging a scrollbar).
    if (e.type === "pointermove" && !e.buttons) return;
    lastInputAt = now();
  }

  function onScroll(e) {
    const el = scrollTarget(e.target);
    if (!el) return;
    const y = readY(el);
    const prev = lastY.get(el);
    lastY.set(el, y);
    const t = now();
    if (t - lastInputAt > INPUT_WINDOW_MS) return; // the page scrolled itself

    let delta;
    let up = false;
    if (prev === undefined) {
      // Chrome scrolls on the compositor before input events reach the page,
      // so we never see an inner container's position before its first scroll.
      // Assume it started at the top, within reason.
      if (y > FIRST_SCROLL_MAX_PX) return;
      delta = y;
    } else {
      delta = Math.abs(y - prev);
      up = y < prev;
    }
    if (delta < MIN_DELTA_PX || delta > MAX_JUMP_PX) return;

    pending += delta;
    if (up) pendingUp += delta;
    localPx += delta;
    trackSpeed(t, delta);
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
    if (overlay) updateOverlay();
  }

  function trackSpeed(t, delta) {
    recent.push([t, delta]);
    while (recent.length && t - recent[0][0] > SPEED_WINDOW_MS) recent.shift();
    if (recent.length < 3) return; // a single event says nothing about speed
    const px = recent.reduce((a, r) => a + r[1], 0);
    const speed = px / (SPEED_WINDOW_MS / 1000);
    if (speed <= MAX_SPEED_PX_S && speed > pendingPeak) pendingPeak = speed;
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    const px = Math.floor(pending);
    if (px < 1 || !alive) return;
    const up = Math.min(px, Math.round(pendingUp));
    const peak = Math.round(pendingPeak);
    pending -= px;
    pendingUp = 0;
    pendingPeak = 0;
    const sentAt = localPx - pending;
    send({ type: "scroll", px, up, peak, host: location.hostname }, sentAt);
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
    if (overlay && typeof reply.todayM === "number") base = { todayM: reply.todayM, localPx: sentAt };
    if (reply.nudge) showNudge(reply.nudge);
    if (overlay && reply.passed) celebrate(reply.passed);
  }

  // ---------- UI (shadow DOM so page styles can't leak in or out) ----------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; }
    .ui { font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #161513; }
    .mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace; }

    /* Tape: yellow strip with tick marks along the top edge. */
    .tape {
      --tick: rgba(22, 21, 19, .9);
      background:
        repeating-linear-gradient(90deg, var(--tick) 0 1.5px, transparent 1.5px 40px) 0 0 / 100% 9px no-repeat,
        repeating-linear-gradient(90deg, var(--tick) 0 1px, transparent 1px 8px) 0 0 / 100% 5px no-repeat,
        #ffcb05;
    }

    .pill {
      position: fixed; right: 16px; bottom: 16px; width: 272px; padding: 14px 12px 10px;
      border-radius: 4px; box-shadow: 3px 3px 0 #161513, 0 8px 24px rgba(0,0,0,.18);
      opacity: 0; transform: translateY(10px); transition: opacity .2s, transform .2s;
    }
    .pill.show { opacity: 1; transform: none; }
    .p-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .p-label { font-size: 12px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p-dist { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .p-track { position: relative; height: 4px; margin-top: 7px; background: rgba(22,21,19,.18); }
    .p-track i { position: absolute; inset: 0 auto 0 0; background: #161513; transition: width .15s linear; }
    .pill.party { background: #161513; color: #ffcb05; --tick: rgba(255, 203, 5, .85);
      background-image:
        repeating-linear-gradient(90deg, var(--tick) 0 1.5px, transparent 1.5px 40px),
        repeating-linear-gradient(90deg, var(--tick) 0 1px, transparent 1px 8px);
      background-size: 100% 9px, 100% 5px; background-repeat: no-repeat; box-shadow: 3px 3px 0 #ffcb05, 0 8px 24px rgba(0,0,0,.25); }
    .pill.party .p-track { background: rgba(255,203,5,.25); }
    .pill.party .p-track i { background: #ffcb05; }

    .nudge {
      pointer-events: auto; position: fixed; left: 50%; bottom: 20px; width: min(430px, calc(100vw - 32px));
      display: grid; grid-template-columns: 16px 1fr; overflow: hidden;
      background: #f5f2ea; border: 2px solid #161513; border-radius: 6px; box-shadow: 5px 5px 0 #161513;
      transform: translate(-50%, calc(100% + 40px)); transition: transform .4s cubic-bezier(.2,.9,.3,1.15);
    }
    .nudge.show { transform: translate(-50%, 0); }
    .n-tape { --tick: rgba(22,21,19,.9);
      background:
        repeating-linear-gradient(180deg, var(--tick) 0 1.5px, transparent 1.5px 40px) 0 0 / 9px 100% no-repeat,
        repeating-linear-gradient(180deg, var(--tick) 0 1px, transparent 1px 8px) 0 0 / 5px 100% no-repeat,
        #ffcb05; border-right: 2px solid #161513; }
    .n-body { padding: 16px 18px 14px; }
    .n-title { font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
    .n-text { margin-top: 4px; font-size: 14px; color: #4a463f; }
    .n-row { display: flex; gap: 8px; margin-top: 12px; }
    button { font: inherit; font-size: 13px; font-weight: 700; border-radius: 4px; padding: 7px 12px; cursor: pointer; }
    .ok { color: #f5f2ea; background: #161513; border: 2px solid #161513; }
    .ok:hover { color: #161513; background: #ffcb05; }
    .later { color: #4a463f; background: transparent; border: 2px solid transparent; }
    .later:hover { border-color: #161513; color: #161513; }
  `;

  let ui = null;
  function uiRoot() {
    if (ui) return ui;
    const host = document.createElement("scroll-meter-ui");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; inset: auto 0 0 0; pointer-events: none;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>${CSS}</style><div class="ui"></div>`;
    (document.body || document.documentElement).append(host);
    ui = shadow; // shadow.host is the element, used by teardown()
    return ui;
  }

  const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text ?? "" });

  function showNudge({ title, body }) {
    const root = uiRoot();
    root.querySelector(".nudge")?.remove();
    const card = el("div", "nudge");
    card.setAttribute("role", "status");
    const content = el("div", "n-body");
    const row = el("div", "n-row");
    const ok = el("button", "ok", "I'm done for now");
    const later = el("button", "later", "Five more minutes");
    const close = () => {
      card.classList.remove("show");
      setTimeout(() => card.remove(), 450);
    };
    ok.onclick = close;
    later.onclick = close;
    row.append(ok, later);
    content.append(el("div", "n-title", title), el("div", "n-text", body), row);
    card.append(el("div", "n-tape"), content);
    root.querySelector(".ui").append(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("show")));
  }

  function teardown() {
    alive = false;
    ui?.host.remove();
    document.removeEventListener("scroll", onScroll, true);
    for (const t of INPUT_EVENTS) document.removeEventListener(t, noteInput, true);
  }

  // ---------- live climb overlay ----------
  // A strip of tape in the corner showing progress to the next landmark.

  let overlay = null; // { units, ladder: [{one, a, meters}] } when enabled
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
    return m < 1000 ? `${m.toFixed(m < 100 ? 1 : 0)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  function pill() {
    const root = uiRoot();
    let p = root.querySelector(".pill");
    if (!p) {
      p = el("div", "pill tape");
      const top = el("div", "p-top");
      top.append(el("div", "p-label"), el("div", "p-dist mono"));
      const track = el("div", "p-track");
      track.append(document.createElement("i"));
      p.append(top, track);
      root.querySelector(".ui").append(p);
    }
    return p;
  }

  function updateOverlay() {
    if (!overlay || !IS_TOP || celebrating) return;
    const m = estimateM();
    const ladder = overlay.ladder;
    const i = ladder.findIndex((l) => l.meters > m);
    const next = ladder[i];
    const prevM = i > 0 ? ladder[i - 1].meters : 0;
    const p = pill();
    p.classList.remove("party");
    p.querySelector(".p-label").textContent = next ? `${fmt(next.meters - m)} to ${next.a} ${next.one}` : "Past the Space Station";
    const progress = next ? (m - prevM) / (next.meters - prevM) : 1;
    p.querySelector(".p-track i").style.width = `${Math.min(100, Math.max(1, progress * 100)).toFixed(1)}%`;
    p.querySelector(".p-dist").textContent = fmt(m);
    show(p, 2500);
  }

  function celebrate(landmark) {
    const p = pill();
    celebrating = true;
    p.classList.add("party");
    p.querySelector(".p-label").textContent = `You just passed ${landmark.a} ${landmark.one}`;
    p.querySelector(".p-track i").style.width = "100%";
    p.querySelector(".p-dist").textContent = fmt(landmark.meters);
    show(p, 4000, () => (celebrating = false));
  }

  function show(p, ms, after) {
    p.classList.add("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      p.classList.remove("show");
      after?.();
    }, ms);
  }

  const INPUT_EVENTS = ["wheel", "touchstart", "touchmove", "touchend", "keydown", "pointerdown", "pointermove"];
  for (const t of INPUT_EVENTS) document.addEventListener(t, noteInput, { capture: true, passive: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  window.addEventListener("pagehide", flush);

  const root = rootEl();
  if (root) lastY.set(root, window.scrollY);

  if (IS_TOP) send({ type: "hello" });
})();
