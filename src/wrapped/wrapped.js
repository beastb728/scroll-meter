import { lastNDays, getDays, getSettings, parseDayKey } from "../lib/store.js";
import { formatDistance, formatSpeed, formatDuration, compare } from "../lib/units.js";
import { summarize, roastTitle, weekdayName, weekdayShort } from "../lib/stats.js";
import { drawCard } from "./card.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

const state = {
  week: 0, // 0 = the 7 days ending today, 1 = the 7 days before that...
  theme: params.get("theme") || "tape",
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
  const metas = {};
  keys.forEach((k, i) => {
    const m = shape[i];
    days[k] = { "reddit.com": m * 0.55 * M, "x.com": m * 0.25 * M, "youtube.com": m * 0.12 * M, "linkedin.com": m * 0.08 * M };
    const h = new Array(24).fill(0);
    h[1] = m * 0.3 * M;
    h[14] = m * 0.7 * M;
    hours[k] = h;
    metas[k] = { upPx: m * 0.12 * M, peakPxS: 6000 + i * 400, binge: { site: "reddit.com", ms: (12 + i * 4) * 60000, px: m * 0.4 * M } };
  });
  return { days, hours, metas };
}

async function cardData(keys, units) {
  const { days, hours, metas } = DEMO ? demoData(keys) : await getDays(keys);
  const s = summarize(keys, days, hours, metas);
  const c = compare(s.totalMeters);
  const roast = roastTitle(s);
  const maxSite = s.topSites[0]?.px || 1;
  return {
    range: rangeLabel(keys),
    total: formatDistance(s.totalMeters, units),
    totalMeters: s.totalMeters,
    units,
    compare: c.text,
    title: roast.title,
    line: roast.line,
    stats: [
      s.worstDay?.px > 0 && { label: "Worst day", value: `${weekdayName(s.worstDay.key)} · ${formatDistance(s.worstDay.meters, units)}` },
      s.worstSite && { label: "Worst site", value: `${s.worstSite.site} · ${formatDistance(s.worstSite.meters, units)}` },
      s.binge && { label: "Longest binge", value: `${formatDuration(s.binge.ms)} on ${s.binge.site}`, receipt: formatDuration(s.binge.ms) },
      s.topSpeed > 0 && { label: "Top speed", value: formatSpeed(s.topSpeed, units), receipt: formatSpeed(s.topSpeed, units) },
      s.lateMeters >= 1 && { label: "After midnight", value: formatDistance(s.lateMeters, units), receipt: formatDistance(s.lateMeters, units) },
      s.upShare > 0 && { label: "Scrolled back up", value: `${Math.round(s.upShare * 100)}%` },
    ].filter(Boolean),
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
