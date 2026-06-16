// js/render.js — projects store state onto the DOM (the trip bars, pool, credit-hour badges).
import { BAR_H, DH_PLANE } from './config.js';
import { fmtCH } from './format.js';
import { getTrips, getSelectedId, getPilotCount, getBidStartDay } from './store.js';
import { getCellPos, getTripLayer, renderBidDivider } from './grid.js';
import { renderBank } from './bank.js';

let handlers = { onSelect() {}, onMove() {}, onResize() {} };
export function setRenderHandlers(h) { handlers = { ...handlers, ...h }; }

const TYPE_CLASS_NAMES = new Set([
  'carryover',
  'training',
  'reserve',
  'vacation',
  'leave',
  'absence',
  'workperiod',
  'departure',
]);
const LABEL_ONLY_TYPES = new Set(['leave', 'absence', 'workperiod']);
// Outline markers that draw on top of trips and carry no inline text label.
const OVERLAY_TYPES = new Set(['workperiod', 'departure']);

export function renderAll() {
  const layer = getTripLayer();
  if (layer) layer.innerHTML = '';
  const visibleTrips = getTrips().filter(t => !t.inPool);
  visibleTrips.filter(t => !OVERLAY_TYPES.has(t.type)).forEach(renderTrip);
  visibleTrips.filter(t => OVERLAY_TYPES.has(t.type)).forEach(renderTrip);
  updateCreditHours();
  renderPool();
  renderBank();
  renderBidDivider();
}

function formatTripLabel(t) {
  if (LABEL_ONLY_TYPES.has(t.type)) {
    const label = t.label || t.type;
    if (t.hoursPerDay > 0) {
      const ch = t.days * t.hoursPerDay;
      return t.days === 1 ? `${label} ${fmtCH(ch)}` : `${label} ${t.days}d · ${fmtCH(ch)}`;
    }
    return t.days === 1 ? label : `${label} ${t.days}d`;
  }

  const ch = t.days * t.hoursPerDay;
  const prefix = t.type === 'carryover' ? 'CO '
    : t.type === 'training' ? 'TR '
    : t.type === 'reserve' ? (t.subType ? t.subType + ' ' : 'RS ')
    : t.type === 'vacation' ? 'VAC '
    : '';
  return t.days === 1
    ? `${prefix}${fmtCH(ch)}`
    : `${prefix}${t.days}d · ${fmtCH(ch)}`;
}

function makePlane(side, color) {
  const el = document.createElement('span');
  el.className = 'dh-plane dh-' + side;
  el.textContent = DH_PLANE;
  el.style.color = color;
  return el;
}

function makeStrip(side) {
  const el = document.createElement('span');
  el.className = 'dh-strip dh-' + side;
  return el;
}

function renderTrip(t) {
  const pos = getCellPos(t.pilot, t.day);
  if (!pos) return;
  const el = document.createElement('div');
  const typeClass = TYPE_CLASS_NAMES.has(t.type) ? ' ' + t.type : '';
  el.className = 'trip' + typeClass + (t.id === getSelectedId() ? ' selected' : '');
  if (OVERLAY_TYPES.has(t.type)) el.style.color = t.color;
  else el.style.background = t.color;
  el.style.left = pos.left + 'px';
  el.style.top = (pos.top + (pos.height - BAR_H) / 2) + 'px';
  el.style.width = (t.days * pos.width - 2) + 'px';
  if (!OVERLAY_TYPES.has(t.type)) {
    const lbl = document.createElement('span');
    lbl.className = 'trip-label';
    lbl.textContent = formatTripLabel(t);
    el.appendChild(lbl);
  }
  el.dataset.id = t.id;

  // Deadhead planes: front (just before the start), back (just after the end), or both.
  if (!OVERLAY_TYPES.has(t.type) && t.dh && t.dh !== 'none') {
    if (t.dh === 'front' || t.dh === 'double') {
      el.appendChild(makeStrip('front'));
      el.appendChild(makePlane('front', t.color));
    }
    if (t.dh === 'back' || t.dh === 'double') {
      el.appendChild(makeStrip('back'));
      el.appendChild(makePlane('back', t.color));
    }
  }

  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  el.appendChild(handle);

  el.addEventListener('mousedown', e => {
    if (e.target === handle) return;
    e.preventDefault();
    handlers.onSelect(t.id);
    handlers.onMove(t.id, e);
  });

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    handlers.onSelect(t.id);
    handlers.onResize(t.id, e);
  });

  getTripLayer().appendChild(el);
}

function renderPool() {
  const poolBars = document.getElementById('poolBars');
  const poolEl = document.getElementById('tripPool');
  const poolCount = document.getElementById('poolCount');
  if (!poolBars || !poolEl) return;
  const poolTrips = getTrips().filter(t => t.inPool);
  if (poolTrips.length === 0) {
    poolEl.classList.remove('visible');
    poolBars.innerHTML = '';
    poolCount.textContent = '0';
    return;
  }
  poolEl.classList.add('visible');
  poolCount.textContent = poolTrips.length + (poolTrips.length === 1 ? ' bar' : ' bars');
  poolBars.innerHTML = '';
  poolTrips.forEach((t, i) => {
    const div = document.createElement('div');
    let cls = '';
    if (t.type === 'reserve') cls = ' reserve';
    div.className = 'pool-bar' + cls;
    div.style.background = t.color;
    div.style.animationDelay = (i * 0.04) + 's';
    const ch = t.days * t.hoursPerDay;
    const prefix = t.type === 'reserve' ? (t.subType ? t.subType + ' ' : 'RS ') : '';
    div.textContent = prefix + (t.days === 1 ? fmtCH(ch) : t.days + 'd · ' + fmtCH(ch));
    poolBars.appendChild(div);
  });
}

function updateCreditHours() {
  // Zero everything first
  for (let p = 1; p <= getPilotCount(); p++) {
    const badge = document.querySelector(`.ch-badge[data-ch-for="${p}"]`);
    if (!badge) continue;
    badge.textContent = '0:00';
    badge.classList.add('zero');
  }
  // Sum CH per pilot (skip trips that have been moved into the pool).
  // Days before the bid-month start earn no credit (they're carry-over).
  const start = getBidStartDay();
  const countedDays = t => {
    if (!start) return t.days;
    const last = t.day + t.days - 1;
    if (last < start) return 0;
    return last - Math.max(t.day, start) + 1;
  };
  const totals = {};
  getTrips().forEach(t => {
    if (t.inPool) return;
    totals[t.pilot] = (totals[t.pilot] || 0) + countedDays(t) * t.hoursPerDay;
  });
  Object.entries(totals).forEach(([pilot, ch]) => {
    const badge = document.querySelector(`.ch-badge[data-ch-for="${pilot}"]`);
    if (!badge) return;
    badge.textContent = fmtCH(ch);
    badge.classList.toggle('zero', ch === 0);
  });
}
