// js/render.js — projects store state onto the DOM (the trip bars, pool, credit-hour badges).
import { BAR_H } from './config.js';
import { fmtCH } from './format.js';
import { getTrips, getSelectedId, getPilotCount } from './store.js';
import { getCellPos, getTripLayer } from './grid.js';

let handlers = { onSelect() {}, onMove() {}, onResize() {} };
export function setRenderHandlers(h) { handlers = { ...handlers, ...h }; }

export function renderAll() {
  const layer = getTripLayer();
  if (layer) layer.innerHTML = '';
  getTrips().filter(t => !t.inPool).forEach(renderTrip);
  updateCreditHours();
  renderPool();
}

function renderTrip(t) {
  const pos = getCellPos(t.pilot, t.day);
  if (!pos) return;
  const el = document.createElement('div');
  let typeClass = '';
  if (t.type === 'carryover') typeClass = ' carryover';
  else if (t.type === 'training') typeClass = ' training';
  else if (t.type === 'reserve') typeClass = ' reserve';
  else if (t.type === 'vacation') typeClass = ' vacation';
  el.className = 'trip' + typeClass + (t.id === getSelectedId() ? ' selected' : '');
  el.style.background = t.color;
  el.style.left = pos.left + 'px';
  el.style.top = (pos.top + (pos.height - BAR_H) / 2) + 'px';
  el.style.width = (t.days * pos.width - 2) + 'px';
  const ch = t.days * t.hoursPerDay;
  const prefix = t.type === 'carryover' ? 'CO '
    : t.type === 'training' ? 'TR '
    : t.type === 'reserve' ? (t.subType ? t.subType + ' ' : 'RS ')
    : t.type === 'vacation' ? 'VAC '
    : '';
  el.textContent = t.days === 1
    ? `${prefix}${fmtCH(ch)}`
    : `${prefix}${t.days}d · ${fmtCH(ch)}`;
  el.dataset.id = t.id;

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
  // Sum CH per pilot (skip trips that have been moved into the pool)
  const totals = {};
  getTrips().forEach(t => {
    if (t.inPool) return;
    totals[t.pilot] = (totals[t.pilot] || 0) + t.days * t.hoursPerDay;
  });
  Object.entries(totals).forEach(([pilot, ch]) => {
    const badge = document.querySelector(`.ch-badge[data-ch-for="${pilot}"]`);
    if (!badge) return;
    badge.textContent = fmtCH(ch);
    badge.classList.toggle('zero', ch === 0);
  });
}
