import { test } from "node:test";
import assert from "node:assert/strict";
import { pxToMeters, formatDistance, formatBadge, compare, climb, crossed, phrase, LANDMARKS } from "../src/lib/units.js";

test("1 CSS px is 1/96 inch", () => {
  assert.ok(Math.abs(pxToMeters(96) - 0.0254) < 1e-12);
  assert.ok(Math.abs(pxToMeters(3_779_528) - 1000) < 0.01);
});

test("formatDistance picks sensible units", () => {
  assert.equal(formatDistance(0.38), "38 cm");
  assert.equal(formatDistance(4.25), "4.3 m");
  assert.equal(formatDistance(142.4), "142 m");
  assert.equal(formatDistance(1240), "1.24 km");
  assert.equal(formatDistance(12_340), "12.3 km");
  assert.equal(formatDistance(100, "imperial"), "328 ft");
  assert.equal(formatDistance(1609.344, "imperial"), "1 mi");
});

test("formatBadge stays short", () => {
  for (const m of [0, 5, 999, 1000, 9_999, 54_000, 999_000]) assert.ok(formatBadge(m).length <= 4, formatBadge(m));
  assert.equal(formatBadge(1234), "1.2k");
});

test("landmarks are sorted ascending", () => {
  for (let i = 1; i < LANDMARKS.length; i++) assert.ok(LANDMARKS[i].meters > LANDMARKS[i - 1].meters);
});

test("compare picks the biggest landmark covered", () => {
  assert.equal(compare(142).landmark.id, "pyramid");
  assert.equal(compare(462).landmark.id, "empire");
  assert.equal(compare(462).text, "1 Empire State Building");
  assert.equal(compare(90).text, "3 Olympic pools".replace("3", "1.8"));
  assert.equal(compare(0.05).text, "33% of a phone");
});

test("phrase pluralises and adds tails only for 2+", () => {
  const whale = LANDMARKS.find((l) => l.id === "whale");
  assert.equal(phrase(30, whale), "1 blue whale");
  assert.equal(phrase(45, whale), "1.5 blue whales");
  assert.equal(phrase(141, whale), "4.7 blue whales nose to tail");
  const eiffel = LANDMARKS.find((l) => l.id === "eiffel");
  assert.equal(phrase(200, eiffel), "61% of an Eiffel Tower");
});

test("climb reports progress to the next milestone", () => {
  const c = climb(217.5);
  assert.equal(c.prev.id, "pyramid");
  assert.equal(c.next.id, "eiffel");
  assert.ok(Math.abs(c.progress - 0.411) < 0.01);
  assert.equal(climb(0).next.id, "bus");
  assert.equal(climb(1e9).next, null);
});

test("crossed lists milestones passed in one step", () => {
  assert.deepEqual(crossed(25, 55).map((l) => l.id), ["whale", "pool"]);
  assert.deepEqual(crossed(1, 5), []);
});

test("compare handles zero without inventing a phone fraction", async () => {
  assert.equal(compare(0).text, "not even the length of a phone");
  assert.equal(compare(0).landmark, null);
});

test("speed and duration formatting", async () => {
  const { formatSpeed, compareSpeed, formatDuration } = await import("../src/lib/units.js");
  assert.equal(formatSpeed(1.94), "1.9 m/s");
  assert.equal(formatSpeed(1, "imperial"), "2.2 mph");
  assert.equal(compareSpeed(1.5), "faster than a walking human");
  assert.equal(compareSpeed(0.001), "slower than a snail");
  assert.equal(formatDuration(45_000), "45 s");
  assert.equal(formatDuration(23 * 60_000), "23 min");
  assert.equal(formatDuration(65 * 60_000), "1 h 5 min");
});
