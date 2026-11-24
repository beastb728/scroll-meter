import { dayKey, hourKey, normalizeDomain, getSettings } from "./lib/store.js";
import { pxToMeters, formatDistance, formatBadge, compare, crossed, LANDMARKS } from "./lib/units.js";

const SCRIPT_ID = "scroll-meter";
const SCRIPT_FILE = "src/content.js";

// Largest batch a single content-script message may report. Anything bigger
// is a bug or a hostile page, not a human thumb.
const MAX_BATCH_PX = 200_000;

// ---------- content script registration (opt-in sites only) ----------

async function grantedOrigins() {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((o) => /^(\*|https?):\/\//.test(o));
}

async function syncContentScripts() {
  const matches = await grantedOrigins();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const script = { id: SCRIPT_ID, matches, js: [SCRIPT_FILE], allFrames: true, runAt: "document_idle", persistAcrossSessions: true };
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

/** Start measuring right away in tabs that are already open on newly granted sites. */
async function injectIntoOpenTabs(origins) {
  if (!origins?.length) return;
  const tabs = await chrome.tabs.query({ url: origins }).catch(() => []);
  await Promise.all(
    tabs.map((t) => chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: [SCRIPT_FILE] }).catch(() => {})),
  );
}

chrome.permissions.onAdded.addListener(async ({ origins }) => {
  await syncContentScripts();
  await injectIntoOpenTabs(origins);
});
chrome.permissions.onRemoved.addListener(() => syncContentScripts());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncContentScripts();
  await refreshBadge();
  if (reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/settings/settings.html?welcome=1") });
  }
});
chrome.runtime.onStartup.addListener(() => {
  syncContentScripts();
  refreshBadge();
});

// ---------- toolbar badge ----------

async function todayMeters() {
  const day = dayKey();
  const { [day]: sites = {} } = await chrome.storage.local.get(day);
  return pxToMeters(Object.values(sites).reduce((a, b) => a + b, 0));
}

async function refreshBadge(todayM, settings) {
  settings ??= await getSettings();
  if (!settings.badge) return chrome.action.setBadgeText({ text: "" });
  todayM ??= await todayMeters();
  await chrome.action.setBadgeBackgroundColor({ color: "#ff5a36" });
  await chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  await chrome.action.setBadgeText({ text: todayM > 0 ? formatBadge(todayM, settings.units) : "" });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // Settings changed, or history was deleted from the settings page.
  if (changes.settings || Object.keys(changes).some((k) => /^\d{4}-/.test(k) && !changes[k].newValue)) refreshBadge();
});

// ---------- live overlay ----------

const LADDER = LANDMARKS.filter((l) => l.milestone).map((l) => ({
  emoji: l.emoji,
  one: l.one,
  a: /^[aeiou]/i.test(l.one) ? "an" : "a",
  meters: l.meters,
}));
const overlayFor = (settings) => (settings.overlay ? { units: settings.units, ladder: LADDER } : null);

// ---------- scroll accounting ----------

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

/** Drop reports from pages whose permission was revoked after the script started. */
async function senderAllowed(sender) {
  try {
    const origin = new URL(sender.url).origin;
    return await chrome.permissions.contains({ origins: [`${origin}/*`] });
  } catch {
    return false;
  }
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
  return { day, todayPx: Object.values(sites).reduce((a, b) => a + b, 0) };
}

// ---------- daily limit nudge ----------

/** Nudge once when the limit is crossed, then again every extra 50% of it. */
async function maybeNudge(day, todayM, settings) {
  const limit = settings.limitMeters;
  if (!limit || todayM < limit) return null;
  const level = Math.floor((todayM / limit) * 2) / 2; // 1, 1.5, 2, ...
  const { nudge } = await chrome.storage.local.get("nudge");
  if (nudge?.day === day && nudge.level >= level) return null;
  await chrome.storage.local.set({ nudge: { day, level } });
  const u = settings.units;
  const c = compare(todayM);
  return {
    title: level === 1 ? "You've reached the end." : "Still going, huh?",
    body:
      level === 1
        ? `Of today's scrolling budget, anyway. ${formatDistance(todayM, u)} of ${formatDistance(limit, u)}: that's ${c.text}.`
        : `${formatDistance(todayM, u)} today, ${Math.round(level * 100)}% of your ${formatDistance(limit, u)} limit. That's ${c.text}.`,
    emoji: level === 1 ? "🧱" : level < 2 ? "🫠" : "🚨",
  };
}

async function handleScroll(msg, sender) {
  if (!(await senderAllowed(sender))) return { stop: true };
  const site = siteFor(msg, sender);
  const { day, todayPx } = await addScroll(site, msg.px);
  const settings = await getSettings();
  const todayM = pxToMeters(todayPx);
  const passed = crossed(todayM - pxToMeters(msg.px), todayM).at(-1);
  refreshBadge(todayM, settings);
  return {
    todayM,
    overlay: overlayFor(settings),
    passed: passed && LADDER.find((l) => l.meters === passed.meters),
    nudge: await maybeNudge(day, todayM, settings),
  };
}

async function handleHello(sender) {
  if (!(await senderAllowed(sender))) return { stop: true };
  const settings = await getSettings();
  return { todayM: await todayMeters(), overlay: overlayFor(settings) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "hello") {
    handleHello(sender).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type !== "scroll") return false;
  const px = Math.round(Number(msg.px));
  if (!Number.isFinite(px) || px <= 0 || px > MAX_BATCH_PX) return false;
  const job = queue.then(() => handleScroll({ ...msg, px }, sender));
  queue = job.catch(() => {});
  job.then(sendResponse, (err) => {
    console.error("Scroll Meter: failed to save", err);
    sendResponse({ error: true });
  });
  return true; // async response
});
