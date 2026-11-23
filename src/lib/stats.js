// Pure aggregation over stored day data. No chrome.* calls, so it is unit-testable.
import { pxToMeters } from "./units.js";
import { parseDayKey } from "./store.js";

export const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

/** Sites sorted by distance across one or more day objects. */
export function topSites(dayObjs, n = 5) {
  const totals = {};
  for (const d of dayObjs) for (const [site, px] of Object.entries(d || {})) totals[site] = (totals[site] || 0) + px;
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([site, px]) => ({ site, px, meters: pxToMeters(px) }));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayName = (key) => WEEKDAYS[parseDayKey(key).getDay()];
export const weekdayShort = (key) => weekdayName(key).slice(0, 3);

/**
 * Summary of a run of days.
 * @param keys   day keys, oldest first
 * @param days   { key: { site: px } }
 * @param hours  { key: number[24] }
 */
export function summarize(keys, days, hours = {}) {
  const perDay = keys.map((key) => ({ key, px: sum(days[key]), meters: pxToMeters(sum(days[key])) }));
  const totalPx = perDay.reduce((a, d) => a + d.px, 0);
  const worstDay = perDay.reduce((w, d) => (d.px > (w?.px ?? 0) ? d : w), null);
  const sites = topSites(keys.map((k) => days[k]), 50);

  // Late night = midnight to 5 AM.
  let latePx = 0;
  const byHour = new Array(24).fill(0);
  for (const k of keys) {
    (hours[k] || []).forEach((px, h) => {
      byHour[h] += px || 0;
      if (h < 5) latePx += px || 0;
    });
  }
  const peakHour = byHour.some((x) => x > 0) ? byHour.indexOf(Math.max(...byHour)) : null;
  const activeDays = perDay.filter((d) => d.px > 0).length;

  return {
    keys,
    perDay,
    totalPx,
    totalMeters: pxToMeters(totalPx),
    worstDay,
    worstSite: sites[0] || null,
    topSites: sites.slice(0, 5),
    siteCount: sites.length,
    lateMeters: pxToMeters(latePx),
    lateShare: totalPx ? latePx / totalPx : 0,
    peakHour,
    activeDays,
  };
}

const SITE_TITLES = [
  [/reddit\.com$/, "Reddit Archaeologist"],
  [/linkedin\.com$/, "LinkedIn Lurker"],
  [/(^|\.)x\.com$|twitter\.com$/, "Timeline Tourist"],
  [/youtube\.com$/, "Comment Section Spelunker"],
  [/instagram\.com$/, "Reel Life Addict"],
  [/tiktok\.com$/, "For You Page Fossil"],
  [/facebook\.com$/, "Status Update Historian"],
  [/pinterest\.com$/, "Professional Pinner"],
  [/news\.ycombinator\.com$/, "Hacker News Hermit"],
  [/(threads\.net|bsky\.app)$/, "Thread Unraveler"],
  [/(amazon|ebay|aliexpress|etsy)\./, "Window Shopping Olympian"],
  [/(wikipedia\.org)$/, "Wikipedia Rabbit-Holer"],
  [/(github\.com|stackoverflow\.com)$/, "Code Scroll Goblin"],
];

/** A roast title + one-line subtitle for the weekly card. */
export function roastTitle(s) {
  const m = s.totalMeters;
  if (m < 20) return { title: "Touch Grass Champion", line: "Barely scrolled. Who even are you?" };
  if (s.lateShare >= 0.25 && s.lateMeters >= 20)
    return { title: "3 AM Scroller", line: "A big chunk of your scrolling happened after midnight." };
  if (m >= 3000) return { title: "Professional Doomscroller", line: "This is no longer a hobby. It's a career." };
  const worst = s.worstSite;
  if (worst && s.totalPx && worst.px / s.totalPx >= 0.4) {
    for (const [re, title] of SITE_TITLES) if (re.test(worst.site)) return { title, line: `${worst.site} owns your thumb.` };
    return { title: "One-Site Wonder", line: `${worst.site} owns your thumb.` };
  }
  if (s.siteCount >= 15) return { title: "Tab Tornado", line: `You scrolled across ${s.siteCount} different sites.` };
  if (m >= 1000) return { title: "Thumb Marathoner", line: "Your thumb deserves a medal and a nap." };
  return { title: "Casual Thumb Athlete", line: "Respectable. Mostly." };
}
