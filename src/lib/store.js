// Storage helpers shared by the background worker and extension pages.
//
// Storage shape (chrome.storage.local):
//   "YYYY-MM-DD":       { "reddit.com": px, "x.com": px, ... }   distance per site per day
//   "hours:YYYY-MM-DD": [px x 24]                                 distance per local hour
//   "settings":         { ... }                                   user settings
//
// Only domain names and pixel counts are ever stored. No URLs, no page content.

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const hourKey = (day) => `hours:${day}`;

export function parseDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Day keys for the `n` days ending on `end`, oldest first. */
export function lastNDays(n, end = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

const ALIASES = { "twitter.com": "x.com", "youtu.be": "youtube.com" };

export function normalizeDomain(host) {
  let h = String(host || "").toLowerCase().replace(/\.$/, "");
  h = h.replace(/^(www\d?|m|mobile)\./, "");
  return ALIASES[h] || h || "unknown";
}

export const DEFAULT_SETTINGS = Object.freeze({
  units: "metric", // "metric" | "imperial"
  limitMeters: 0, // 0 = no daily limit
  overlay: true, // live climb pill while scrolling
  badge: true, // today's distance on the toolbar icon
});

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

/** Returns { days: {key: {domain: px}}, hours: {key: number[24]} } for the given keys. */
export async function getDays(keys) {
  const got = await chrome.storage.local.get([...keys, ...keys.map(hourKey)]);
  const days = {};
  const hours = {};
  for (const k of keys) {
    days[k] = got[k] || {};
    hours[k] = got[hourKey(k)] || new Array(24).fill(0);
  }
  return { days, hours };
}
