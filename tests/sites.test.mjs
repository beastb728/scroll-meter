import { test } from "node:test";
import assert from "node:assert/strict";
import { originPatterns, parseDomainInput, coversAllSites, customDomains } from "../src/lib/sites.js";

test("originPatterns covers domain and subdomains", () => {
  assert.deepEqual(originPatterns("reddit.com"), ["*://reddit.com/*", "*://*.reddit.com/*"]);
  assert.equal(originPatterns(["x.com", "twitter.com"]).length, 4);
});

test("parseDomainInput accepts URLs and bare domains", () => {
  assert.equal(parseDomainInput("https://www.Medium.com/some/post"), "medium.com");
  assert.equal(parseDomainInput("  news.ycombinator.com "), "news.ycombinator.com");
  assert.equal(parseDomainInput("not a site"), null);
  assert.equal(parseDomainInput("localhost"), null);
  assert.equal(parseDomainInput(""), null);
});

test("coversAllSites detects broad grants", () => {
  assert.ok(coversAllSites(["https://*/*"]));
  assert.ok(!coversAllSites(["*://*.reddit.com/*"]));
});

test("customDomains lists non-preset grants once", () => {
  const o = ["*://reddit.com/*", "*://*.reddit.com/*", "*://medium.com/*", "*://*.medium.com/*", "https://*/*"];
  assert.deepEqual(customDomains(o), ["medium.com"]);
});
