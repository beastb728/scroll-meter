import { dayKey, lastNDays, getDays, getSettings } from "../lib/store.js";
import { pxToMeters, formatDistance, compare } from "../lib/units.js";
import { sum, topSites, weekdayShort } from "../lib/stats.js";
import { drawBars } from "../ui/chart.js";
import { originPatterns, coversAllSites } from "../lib/sites.js";
import { normalizeDomain } from "../lib/store.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const settings = await getSettings();
  const units = settings.units;
  const today = dayKey();
  const keys = lastNDays(7);
  const { days } = await getDays(keys);

  // Hero
  const todayM = pxToMeters(sum(days[today]));
  $("today").textContent = formatDistance(todayM, units);
  if (todayM > 0) {
    const c = compare(todayM);
    $("compare").textContent = `${c.emoji} That's ${c.text}.`;
  } else {
    $("compare").textContent = "";
  }

  // Top sites
  const sites = topSites([days[today]], 5);
  const list = $("sites");
  list.replaceChildren();
  const maxPx = sites[0]?.px || 1;
  for (const s of sites) {
    const li = document.createElement("li");
    const name = Object.assign(document.createElement("span"), { className: "name", textContent: s.site });
    const dist = Object.assign(document.createElement("span"), {
      className: "dist",
      textContent: formatDistance(s.meters, units),
    });
    const bar = Object.assign(document.createElement("div"), { className: "bar" });
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(2, (s.px / maxPx) * 100)}%`;
    bar.append(fill);
    li.append(name, dist, bar);
    list.append(li);
  }
  $("sites-empty").hidden = sites.length > 0;

  // 7-day chart
  const bars = keys.map((k) => {
    const m = pxToMeters(sum(days[k]));
    return {
      label: k === today ? "Today" : weekdayShort(k),
      value: m,
      display: m > 0 ? formatDistance(m, units) : "",
      highlight: k === today,
    };
  });
  drawBars($("chart"), bars);
  const weekM = bars.reduce((a, b) => a + b.value, 0);
  $("week-total").textContent = weekM > 0 ? `${formatDistance(weekM, units)} total` : "";
}

// "Measure this site" for the current tab. activeTab lets us read its URL while the popup is open.
async function renderSiteStatus() {
  const box = $("site-status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { origins = [] } = await chrome.permissions.getAll();
  box.replaceChildren();
  box.hidden = false;

  let url = null;
  try {
    url = new URL(tab?.url);
  } catch {}
  const isWeb = url && (url.protocol === "http:" || url.protocol === "https:");

  if (!isWeb) {
    if (origins.length) return (box.hidden = true);
    box.append(text("You haven't picked any sites to measure yet."), button("Pick sites", () => chrome.runtime.openOptionsPage()));
    return;
  }

  const domain = normalizeDomain(url.hostname);
  const patterns = originPatterns(domain);
  const on = coversAllSites(origins) || (await chrome.permissions.contains({ origins: [`${url.origin}/*`] }));
  if (on) {
    const ok = text(`✓ Measuring ${domain}`);
    ok.className = "ok";
    box.append(ok);
  } else {
    box.append(
      text(`Not measuring ${domain}`),
      button("Measure this site", async () => {
        // The popup may close while Chrome shows its prompt; the background
        // worker picks up the new permission and starts measuring the tab.
        if (await chrome.permissions.request({ origins: patterns })) renderSiteStatus();
      }),
    );
  }
}

function text(t) {
  return Object.assign(document.createElement("span"), { textContent: t });
}
function button(label, onClick) {
  const b = Object.assign(document.createElement("button"), { className: "ghost", textContent: label });
  b.addEventListener("click", onClick);
  return b;
}

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage?.());
$("wrapped").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/wrapped/wrapped.html") });
  window.close();
});

// Live-update while the popup is open.
chrome.storage.onChanged.addListener((_, area) => area === "local" && render());

render();
renderSiteStatus();
