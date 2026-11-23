import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, roastTitle, topSites } from "../src/lib/stats.js";
import { lastNDays, dayKey, normalizeDomain } from "../src/lib/store.js";

const M = 3779.5276; // px per meter

test("dayKey and lastNDays use local dates, oldest first", () => {
  const keys = lastNDays(7, new Date(2026, 0, 3));
  assert.deepEqual(keys, ["2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.equal(dayKey(new Date(2026, 10, 4)), "2026-11-04");
});

test("normalizeDomain strips www/m and maps aliases", () => {
  assert.equal(normalizeDomain("www.Reddit.com"), "reddit.com");
  assert.equal(normalizeDomain("m.youtube.com"), "youtube.com");
  assert.equal(normalizeDomain("twitter.com"), "x.com");
  assert.equal(normalizeDomain("old.reddit.com"), "old.reddit.com");
  assert.equal(normalizeDomain(""), "unknown");
});

test("topSites merges days and sorts", () => {
  const t = topSites([{ a: 5, b: 1 }, { b: 10 }], 5);
  assert.deepEqual(t.map((s) => [s.site, s.px]), [["b", 11], ["a", 5]]);
});

test("summarize finds worst day, worst site and late-night share", () => {
  const keys = ["2026-11-23", "2026-11-24"];
  const days = { "2026-11-23": { "reddit.com": 400 * M }, "2026-11-24": { "reddit.com": 100 * M, "x.com": 50 * M } };
  const lateHours = new Array(24).fill(0);
  lateHours[2] = 200 * M;
  lateHours[14] = 200 * M;
  const s = summarize(keys, days, { "2026-11-23": lateHours });
  assert.equal(s.worstDay.key, "2026-11-23");
  assert.equal(s.worstSite.site, "reddit.com");
  assert.ok(Math.abs(s.totalMeters - 550) < 0.01);
  assert.ok(Math.abs(s.lateMeters - 200) < 0.01);
  assert.equal(s.activeDays, 2);
  assert.equal(s.peakHour, 2);
});

test("roastTitle covers the main personalities", () => {
  const base = { totalPx: 1, lateShare: 0, lateMeters: 0, siteCount: 3, worstSite: null };
  assert.equal(roastTitle({ ...base, totalMeters: 5 }).title, "Touch Grass Champion");
  assert.equal(roastTitle({ ...base, totalMeters: 5000 }).title, "Professional Doomscroller");
  assert.equal(roastTitle({ ...base, totalMeters: 500, lateShare: 0.4, lateMeters: 200 }).title, "3 AM Scroller");
  assert.equal(
    roastTitle({ ...base, totalMeters: 500, totalPx: 100, worstSite: { site: "reddit.com", px: 80 } }).title,
    "Reddit Archaeologist",
  );
  assert.equal(roastTitle({ ...base, totalMeters: 500, totalPx: 100, worstSite: { site: "foo.dev", px: 90 } }).title, "One-Site Wonder");
  assert.equal(roastTitle({ ...base, totalMeters: 300, totalPx: 100, worstSite: { site: "a", px: 10 } }).title, "Casual Thumb Athlete");
});
