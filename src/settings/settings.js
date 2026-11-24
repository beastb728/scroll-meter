import { getSettings, saveSettings } from "../lib/store.js";
import { formatDistance } from "../lib/units.js";
import { PRESETS, ALL_SITES, originPatterns, parseDomainInput, coversAllSites, customDomains } from "../lib/sites.js";

const $ = (id) => document.getElementById(id);
const LIMITS = [0, 50, 100, 200, 300, 500, 1000, 2000];

$("welcome").hidden = !new URLSearchParams(location.search).has("welcome");

// ---------- sites ----------

const request = (origins) => chrome.permissions.request({ origins });
const remove = (origins) => chrome.permissions.remove({ origins });

async function renderSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  const all = coversAllSites(origins);
  $("all-sites").checked = all;
  $("presets").classList.toggle("disabled", all);

  const wrap = $("presets");
  wrap.replaceChildren();
  for (const p of PRESETS) {
    const on = all || (await chrome.permissions.contains({ origins: originPatterns(p.domains) }));
    const b = Object.assign(document.createElement("button"), { className: "preset", textContent: p.name, type: "button" });
    b.setAttribute("aria-pressed", String(on));
    b.title = p.domains.join(", ");
    b.disabled = all;
    b.addEventListener("click", async () => {
      const patterns = originPatterns(p.domains);
      if (on) await remove(patterns);
      else await request(patterns);
      renderSites();
    });
    wrap.append(b);
  }

  const list = $("custom");
  list.replaceChildren();
  for (const d of customDomains(origins)) {
    const li = document.createElement("li");
    const name = Object.assign(document.createElement("span"), { textContent: d });
    const x = Object.assign(document.createElement("button"), { textContent: "Remove", type: "button" });
    x.addEventListener("click", async () => {
      await remove(originPatterns(d));
      renderSites();
    });
    li.append(name, x);
    list.append(li);
  }
}

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = parseDomainInput($("add-input").value);
  $("add-error").hidden = !!domain;
  if (!domain) {
    $("add-error").textContent = "That doesn't look like a website. Try something like example.com.";
    return;
  }
  if (await request(originPatterns(domain))) $("add-input").value = "";
  renderSites();
});

$("all-sites").addEventListener("change", async (e) => {
  if (e.target.checked) await request(ALL_SITES);
  else await remove(ALL_SITES);
  renderSites();
});

chrome.permissions.onAdded.addListener(renderSites);
chrome.permissions.onRemoved.addListener(renderSites);

// ---------- limit + units ----------

async function renderPrefs() {
  const s = await getSettings();
  $("units").value = s.units;
  $("overlay").checked = s.overlay;
  $("badge").checked = s.badge;
  const sel = $("limit");
  sel.replaceChildren();
  const values = LIMITS.includes(s.limitMeters) ? LIMITS : [...LIMITS, s.limitMeters].sort((a, b) => a - b);
  for (const m of values) {
    sel.append(new Option(m === 0 ? "No limit" : formatDistance(m, s.units), String(m)));
  }
  sel.value = String(s.limitMeters);
}

$("units").addEventListener("change", async (e) => {
  await saveSettings({ units: e.target.value });
  renderPrefs();
});
$("overlay").addEventListener("change", (e) => saveSettings({ overlay: e.target.checked }));
$("badge").addEventListener("change", (e) => saveSettings({ badge: e.target.checked }));
$("limit").addEventListener("change", (e) => saveSettings({ limitMeters: Number(e.target.value) }));

// ---------- data ----------

function status(msg) {
  $("data-status").textContent = msg;
  setTimeout(() => ($("data-status").textContent = ""), 3000);
}

$("export").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scroll-meter-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status("Exported.");
});

$("wipe").addEventListener("click", async () => {
  if (!confirm("Delete all Scroll Meter history? Your settings and site choices stay. This can't be undone.")) return;
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.clear();
  if (settings) await chrome.storage.local.set({ settings });
  status("All scroll history deleted.");
});

renderSites();
renderPrefs();
