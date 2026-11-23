import { dayKey, lastNDays, getDays, getSettings } from "../lib/store.js";
import { pxToMeters, formatDistance, compare } from "../lib/units.js";
import { sum, topSites, weekdayShort } from "../lib/stats.js";
import { drawBars } from "../ui/chart.js";

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

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage?.());

// Live-update while the popup is open.
chrome.storage.onChanged.addListener((_, area) => area === "local" && render());

render();
