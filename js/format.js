// js/format.js — pure formatting/number helpers. No imports.

// Parse "H:MM" or decimal hours; returns Number or null
export function parseHpd(text) {
  if (text == null) return null;
  text = String(text).trim();
  if (!text) return null;
  if (text.includes(':')) {
    const parts = text.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || m < 0 || m >= 60) return null;
    return h + m / 60;
  }
  const n = parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Format hours (e.g., 4.5) as "H:MM"
export function fmtCH(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h + ':' + m.toString().padStart(2, '0');
}

export function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
