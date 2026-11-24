import { dayKey, lastNDays, getDays, getSettings, normalizeDomain } from "../lib/store.js";
import { pxToMeters, formatDistance, formatSpeed, formatDuration, compare, compareSpeed, climb } from "../lib/units.js";
import { sum, topSites, weekdayShort } from "../lib/stats.js";
import { drawBars } from "../ui/chart.js";
import { originPatterns, coversAllSites } from "../lib/sites.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const settings = await getSettings();
  const units = settings.units;
  const today = dayKey();
  const keys = lastNDays(7);
  const { days, metas } = await getDays(keys);

  // Hero
  $("date").textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const todayM = pxToMeters(sum(days[today]));
  setMeasure($("today"), formatDistance(todayM, units));
  $("compare").textContent = todayM > 0 ? `That's ${compare(todayM).text}.` : "Clean slate. Your thumb is rested.";

  // Ruler to the next landmark
  const c = climb(todayM);
  $("climb").hidden = !c.next;
  if (c.next) {
    $("climb-fill").style.width = `${Math.max(0.5, c.progress * 100)}%`;
    $("climb-from").textContent = c.prev ? `${c.prev.one} · ${formatDistance(c.prev.meters, units)}` : "Start";
    $("climb-to").textContent = `${c.next.one} · ${formatDistance(c.next.meters, units)}`;
    $("climb-left").textContent = `${formatDistance(c.next.meters - todayM, units)} to go until ${c.next.one}.`;
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
      className: "dist num",
      textContent: formatDistance(s.meters, units),
    });
    const bar = Object.assign(document.createElement("div"), { className: "bar-track" });
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(2, (s.px / maxPx) * 100)}%`;
    bar.append(fill);
    li.append(name, dist, bar);
    list.append(li);
  }
  $("sites-empty").hidden = sites.length > 0;

  // Records
  const meta = metas[today];
  $("records-block").hidden = !meta || todayM < 1;
  if (meta && todayM >= 1) {
    const mps = pxToMeters(meta.peakPxS || 0);
    $("rec-speed").textContent = formatSpeed(mps, units);
    $("rec-speed-sub").textContent = compareSpeed(mps);
    $("rec-binge").textContent = meta.binge ? formatDuration(meta.binge.ms) : "–";
    $("rec-binge-sub").textContent = meta.binge?.site || "";
    $("rec-up").textContent = `${Math.round(((meta.upPx || 0) / sum(days[today])) * 100)}%`;
  }

  // 7-day chart
  const bars = keys.map((k) => {
    const m = pxToMeters(sum(days[k]));
    return {
      label: k === today ? "Today" : weekdayShort(k).toUpperCase(),
      value: m,
      display: m > 0 ? formatDistance(m, units) : "",
      highlight: k === today,
    };
  });
  drawBars($("chart"), bars);
  const weekM = bars.reduce((a, b) => a + b.value, 0);
  $("week-total").textContent = weekM > 0 ? `${formatDistance(weekM, units)} total` : "";
}

/** Renders "147 m" as a big number with a smaller unit. */
function setMeasure(el, text) {
  const i = text.lastIndexOf(" ");
  const unit = Object.assign(document.createElement("span"), { className: "unit", textContent: text.slice(i + 1) });
  el.replaceChildren(text.slice(0, i), unit);
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
    const ok = text(`Measuring ${domain}`);
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
  const b = Object.assign(document.createElement("button"), { className: "btn", textContent: label });
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
