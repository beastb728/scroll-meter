import { dayKey, hourKey, normalizeDomain } from "./lib/store.js";

// Largest batch a single content-script message may report. Anything bigger
// is a bug or a hostile page, not a human thumb.
const MAX_BATCH_PX = 200_000;

// Writes are serialized so concurrent tabs never clobber each other's totals.
let queue = Promise.resolve();

function siteFor(msg, sender) {
  // Attribute iframe scrolling to the page the user is actually on.
  for (const url of [sender.tab?.url, sender.url]) {
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") return normalizeDomain(u.hostname);
    } catch {}
  }
  return normalizeDomain(msg.host);
}

async function addScroll(site, px) {
  const now = new Date();
  const day = dayKey(now);
  const hk = hourKey(day);
  const got = await chrome.storage.local.get([day, hk]);
  const sites = got[day] || {};
  const hours = got[hk] || new Array(24).fill(0);
  sites[site] = (sites[site] || 0) + px;
  hours[now.getHours()] += px;
  await chrome.storage.local.set({ [day]: sites, [hk]: hours });
  return Object.values(sites).reduce((a, b) => a + b, 0);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "scroll") return false;
  const px = Math.round(Number(msg.px));
  if (!Number.isFinite(px) || px <= 0 || px > MAX_BATCH_PX) return false;
  const site = siteFor(msg, sender);
  queue = queue
    .then(() => addScroll(site, px))
    .then((todayPx) => sendResponse({ todayPx }))
    .catch((err) => {
      console.error("Scroll Meter: failed to save", err);
      sendResponse({ error: true });
    });
  return true; // async response
});
