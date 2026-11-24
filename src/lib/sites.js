// Opt-in site permissions. Scroll Meter only runs on sites the user picks.
import { normalizeDomain } from "./store.js";

export const PRESETS = [
  { name: "Reddit", domains: ["reddit.com"] },
  { name: "X / Twitter", domains: ["x.com", "twitter.com"] },
  { name: "YouTube", domains: ["youtube.com"] },
  { name: "Instagram", domains: ["instagram.com"] },
  { name: "TikTok", domains: ["tiktok.com"] },
  { name: "Facebook", domains: ["facebook.com"] },
  { name: "LinkedIn", domains: ["linkedin.com"] },
  { name: "Threads", domains: ["threads.com", "threads.net"] },
  { name: "Bluesky", domains: ["bsky.app"] },
  { name: "Pinterest", domains: ["pinterest.com"] },
  { name: "Tumblr", domains: ["tumblr.com"] },
  { name: "Hacker News", domains: ["news.ycombinator.com"] },
];

export const ALL_SITES = ["http://*/*", "https://*/*"];

/** Match patterns covering a domain and its subdomains. */
export function originPatterns(domains) {
  return [].concat(domains).flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]);
}

/** Cleans user input like "https://www.Example.com/foo" into "example.com". */
export function parseDomainInput(text) {
  let t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  if (!/^[a-z]+:\/\//.test(t)) t = `https://${t}`;
  try {
    const host = new URL(t).hostname;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
    return normalizeDomain(host);
  } catch {
    return null;
  }
}

export const coversAllSites = (origins = []) =>
  origins.some((o) => o === "<all_urls>" || o === "*://*/*" || o === "https://*/*" || o === "http://*/*");

/** Domains granted individually (outside the presets), from permission origins. */
export function customDomains(origins = []) {
  const preset = new Set(PRESETS.flatMap((p) => p.domains));
  const out = new Set();
  for (const o of origins) {
    const m = /^\*:\/\/(?:\*\.)?([^/]+)\/\*$/.exec(o);
    if (m && m[1] !== "*" && !preset.has(m[1])) out.add(m[1]);
  }
  return [...out].sort();
}
