import { lastNDays, getDays, getSettings, parseDayKey } from "../lib/store.js";
import { formatDistance, compare } from "../lib/units.js";
import { summarize, roastTitle, weekdayName, weekdayShort } from "../lib/stats.js";
import { drawCard } from "./card.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

const state = {
  week: 0, // 0 = the 7 days ending today, 1 = the 7 days before that...
  theme: params.get("theme") || "poster",
  format: params.get("format") || "story",
};

function weekKeys(offset) {
  const now = new Date();
  return lastNDays(7, new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * 7));
}

const fmtDay = (key, opts) => parseDayKey(key).toLocaleDateString("en-US", opts);
function rangeLabel(keys) {
  const a = parseDayKey(keys[0]);
  const b = parseDayKey(keys[keys.length - 1]);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = fmtDay(keys[0], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  const right = fmtDay(keys[keys.length - 1], { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

function demoData(keys) {
  const M = 3779.5276;
  const shape = [120, 60, 210, 40, 95, 150, 147];
  const days = {};
  const hours = {};
  keys.forEach((k, i) => {
    const m = shape[i];
    days[k] = { "reddit.com": m * 0.55 * M, "x.com": m * 0.25 * M, "youtube.com": m * 0.12 * M, "linkedin.com": m * 0.08 * M };
    const h = new Array(24).fill(0);
    h[1] = m * 0.3 * M;
    h[14] = m * 0.7 * M;
    hours[k] = h;
  });
  return { days, hours };
}

async function cardData(keys, units) {
  const { days, hours } = DEMO ? demoData(keys) : await getDays(keys);
  const s = summarize(keys, days, hours);
  const c = compare(s.totalMeters);
  const roast = roastTitle(s);
  const maxSite = s.topSites[0]?.px || 1;
  return {
    range: rangeLabel(keys),
    total: formatDistance(s.totalMeters, units),
    compare: c.text,
    emoji: c.emoji,
    title: roast.title,
    line: roast.line,
    worstDay: s.worstDay?.px > 0 ? { name: weekdayName(s.worstDay.key), dist: formatDistance(s.worstDay.meters, units) } : null,
    worstSite: s.worstSite ? { site: s.worstSite.site, dist: formatDistance(s.worstSite.meters, units) } : null,
    late: s.lateMeters >= 1 ? formatDistance(s.lateMeters, units) : null,
    days: s.perDay.map((d) => ({
      label: `${weekdayShort(d.key)} ${fmtDay(d.key, { day: "numeric" })}`,
      dist: formatDistance(d.meters, units),
    })),
    sites: s.topSites.map((t) => ({ site: t.site, dist: formatDistance(t.meters, units), frac: t.px / maxSite })),
  };
}

async function render() {
  const { units } = await getSettings();
  const keys = weekKeys(state.week);
  const data = await cardData(keys, units);
  await document.fonts?.ready;
  drawCard($("card"), data, state);
  $("range").textContent = state.week === 0 ? "This week" : data.range;
  $("range").title = data.range;
  $("next").disabled = state.week === 0;
  for (const group of document.querySelectorAll(".chips")) {
    for (const chip of group.children) chip.setAttribute("aria-pressed", String(state[group.dataset.key] === chip.dataset.value));
  }
}

function toast(msg) {
  $("toast").textContent = msg;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($("toast").textContent = ""), 2500);
}

const toBlob = () => new Promise((res) => $("card").toBlob(res, "image/png"));

$("download").addEventListener("click", async () => {
  const blob = await toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scroll-wrapped-${weekKeys(state.week).at(-1)}-${state.format}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Saved. Go post it.");
});

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": toBlob() })]);
    toast("Copied. Paste it anywhere.");
  } catch {
    toast("Couldn't copy. Try Download instead.");
  }
});

$("prev").addEventListener("click", () => {
  state.week += 1;
  render();
});
$("next").addEventListener("click", () => {
  state.week = Math.max(0, state.week - 1);
  render();
});
for (const group of document.querySelectorAll(".chips")) {
  group.addEventListener("click", (e) => {
    const v = e.target.closest(".chip")?.dataset.value;
    if (!v) return;
    state[group.dataset.key] = v;
    render();
  });
}

$("demo-note").hidden = !DEMO;
render();
