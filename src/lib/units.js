// Pixel → real distance, formatting, and the comparison ladder.

/** 1 CSS px = 1/96 inch = 0.026458 cm. */
export const CM_PER_PX = 2.54 / 96;
export const pxToMeters = (px) => (px * CM_PER_PX) / 100;

const M_PER_FT = 0.3048;
const M_PER_MI = 1609.344;

function trim(n, digits) {
  return n.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** Human-readable distance, e.g. "142 m", "1.24 km", "38 cm", "0.8 mi". */
export function formatDistance(meters, units = "metric") {
  const m = Math.max(0, meters || 0);
  if (units === "imperial") {
    const ft = m / M_PER_FT;
    if (ft < 1000) return `${trim(ft, ft < 10 ? 1 : 0)} ft`;
    const mi = m / M_PER_MI;
    return `${trim(mi, mi < 10 ? 2 : 1)} mi`;
  }
  if (m < 1) return `${trim(m * 100, 0)} cm`;
  if (m < 1000) return `${trim(m, m < 10 ? 1 : 0)} m`;
  const km = m / 1000;
  return `${trim(km, km < 10 ? 2 : 1)} km`;
}

/** Very short form for the toolbar badge (max ~4 chars). */
export function formatBadge(meters, units = "metric") {
  const m = Math.max(0, meters || 0);
  if (units === "imperial") {
    const ft = m / M_PER_FT;
    if (ft < 1000) return `${Math.round(ft)}'`;
    const mi = m / M_PER_MI;
    return mi < 10 ? `${trim(mi, 1)}mi` : `${Math.round(mi)}mi`;
  }
  if (m < 1000) return `${Math.round(m)}m`;
  const km = m / 1000;
  return km < 10 ? `${trim(km, 1)}k` : `${Math.round(km)}k`;
}

// Sorted ascending by meters. `milestone` landmarks trigger a celebration when passed.
export const LANDMARKS = [
  { id: "phone", emoji: "📱", one: "phone", many: "phones", meters: 0.15, tail: "stacked end to end" },
  { id: "paper", emoji: "📄", one: "sheet of A4 paper", many: "sheets of A4 paper", meters: 0.297, tail: "end to end" },
  { id: "giraffe", emoji: "🦒", one: "giraffe", many: "giraffes", meters: 5.5, tail: "stacked on each other" },
  { id: "bus", emoji: "🚌", one: "double-decker bus", many: "double-decker buses", meters: 11.2, tail: "end to end", milestone: true },
  { id: "whale", emoji: "🐋", one: "blue whale", many: "blue whales", meters: 30, tail: "nose to tail", milestone: true },
  { id: "pool", emoji: "🏊", one: "Olympic pool", many: "Olympic pools", meters: 50, tail: "", milestone: true },
  { id: "pitch", emoji: "⚽", one: "football pitch", many: "football pitches", meters: 105, tail: "", milestone: true },
  { id: "pyramid", emoji: "🔺", one: "Great Pyramid", many: "Great Pyramids", meters: 139, tail: "", milestone: true },
  { id: "eiffel", emoji: "🗼", one: "Eiffel Tower", many: "Eiffel Towers", meters: 330, tail: "", milestone: true },
  { id: "empire", emoji: "🏙️", one: "Empire State Building", many: "Empire State Buildings", meters: 443, tail: "", milestone: true },
  { id: "burj", emoji: "🌆", one: "Burj Khalifa", many: "Burj Khalifas", meters: 828, tail: "", milestone: true },
  { id: "goldengate", emoji: "🌉", one: "Golden Gate Bridge", many: "Golden Gate Bridges", meters: 2737, tail: "", milestone: true },
  { id: "everest", emoji: "🏔️", one: "Mount Everest", many: "Mount Everests", meters: 8849, tail: "", milestone: true },
  { id: "marathon", emoji: "🏃", one: "marathon", many: "marathons", meters: 42195, tail: "", milestone: true },
  { id: "iss", emoji: "🛰️", one: "trip to the Space Station", many: "trips to the Space Station", meters: 408000, tail: "", milestone: true },
];

function formatCount(n) {
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  if (n >= 10) return String(Math.round(n));
  return trim(n, 1);
}

/** Phrase for `meters` measured in a specific landmark. */
export function phrase(meters, landmark) {
  const n = meters / landmark.meters;
  const tail = landmark.tail ? ` ${landmark.tail}` : "";
  if (n < 1) {
    const pct = Math.max(1, Math.round(n * 100));
    return `${pct}% of ${/^[aeiou]/i.test(landmark.one) ? "an" : "a"} ${landmark.one}`;
  }
  const count = formatCount(n);
  return `${count} ${count === "1" ? landmark.one : landmark.many}${n >= 2 ? tail : ""}`;
}

/** Best-fitting comparison: the biggest landmark you've covered at least once. */
export function compare(meters) {
  const m = Math.max(0, meters || 0);
  let pick = LANDMARKS[0];
  for (const l of LANDMARKS) if (m >= l.meters) pick = l;
  return { landmark: pick, text: phrase(m, pick), emoji: pick.emoji };
}

/** Landmarks bracketing `meters` for progress: { prev, next, progress 0..1 }. */
export function climb(meters) {
  const ladder = LANDMARKS.filter((l) => l.milestone);
  let prev = null;
  for (const l of ladder) {
    if (meters < l.meters) {
      const base = prev ? prev.meters : 0;
      return { prev, next: l, progress: (meters - base) / (l.meters - base) };
    }
    prev = l;
  }
  return { prev, next: null, progress: 1 };
}

/** Milestone landmarks crossed when going from `before` to `after` meters. */
export function crossed(before, after) {
  return LANDMARKS.filter((l) => l.milestone && before < l.meters && after >= l.meters);
}
