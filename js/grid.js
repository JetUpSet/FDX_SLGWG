// js/grid.js — builds the schedule grid and measures cell geometry.
import { DAY_COUNT } from './config.js';
import { getPilotCount, getBidStartDay, setBidStartDay } from './store.js';

const gridEl = document.getElementById('grid');
let tripLayer = null;
let onSenClick = () => false; // injected by main.js; returns true if it consumed the click
let onBidChange = () => {};   // injected by main.js; re-render after the bid start changes

export function setGridHandlers(h) {
  if (h.onSenClick) onSenClick = h.onSenClick;
  if (h.onBidChange) onBidChange = h.onBidChange;
}
export function getTripLayer() { return tripLayer; }

export function buildGrid() {
  gridEl.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'grid-table';

  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'corner-cell';
  corner.textContent = 'Seniority';
  headTr.appendChild(corner);
  for (let d = 1; d <= DAY_COUNT; d++) {
    const th = document.createElement('th');
    th.className = 'day-head';
    if (d % 7 === 6 || d % 7 === 0) th.classList.add('weekend');
    th.dataset.day = d;
    th.title = 'Click to mark the bid-month start';
    th.textContent = d;
    th.addEventListener('click', () => {
      const cur = getBidStartDay();
      setBidStartDay(cur === d ? null : d);
      markBidHeads();
      onBidChange(); // recompute credit hours + redraw divider
    });
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let p = 1; p <= getPilotCount(); p++) {
    const tr = document.createElement('tr');
    const sen = document.createElement('th');
    sen.className = 'sen-cell';
    sen.dataset.pilot = p;
    sen.title = 'Click to highlight this pilot\'s row';
    sen.innerHTML = `<span class="sen-num">#${p.toString().padStart(2, '0')}</span><span class="ch-badge zero" data-ch-for="${p}">0:00</span>`;
    sen.addEventListener('mousedown', e => e.stopPropagation());
    sen.addEventListener('click', () => {
      if (onSenClick(p)) return;
      tr.classList.toggle('row-highlighted');
    });
    tr.appendChild(sen);
    for (let d = 1; d <= DAY_COUNT; d++) {
      const td = document.createElement('td');
      td.className = 'day-cell';
      if (d % 7 === 6 || d % 7 === 0) td.classList.add('weekend');
      td.dataset.pilot = p;
      td.dataset.day = d;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  gridEl.appendChild(table);

  tripLayer = document.createElement('div');
  tripLayer.className = 'trip-layer';
  gridEl.appendChild(tripLayer);

  markBidHeads();
  renderBidDivider();
}

// Highlight the day header that marks the bid-month start.
function markBidHeads() {
  const day = getBidStartDay();
  gridEl.querySelectorAll('th.day-head').forEach(th => {
    th.classList.toggle('bid-start', +th.dataset.day === day);
  });
}

// Shade the carry-over region and draw a thick line at the bid-month start.
export function renderBidDivider() {
  if (!tripLayer) return;
  tripLayer.querySelectorAll('.bid-divider, .bid-shade').forEach(el => el.remove());
  const day = getBidStartDay();
  if (!day) return;
  const pos = getCellPos(1, day);
  const first = getCellPos(1, 1);
  const table = gridEl.querySelector('table');
  if (!pos || !first || !table) return;
  const gridRect = gridEl.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const top = tableRect.top - gridRect.top;
  const height = tableRect.height;

  // Shade everything left of the line (previous month / carry-over), behind trips.
  if (pos.left > first.left) {
    const shade = document.createElement('div');
    shade.className = 'bid-shade';
    shade.style.left = first.left + 'px';
    shade.style.top = top + 'px';
    shade.style.width = (pos.left - first.left) + 'px';
    shade.style.height = height + 'px';
    tripLayer.prepend(shade);
  }

  const div = document.createElement('div');
  div.className = 'bid-divider';
  div.style.left = pos.left + 'px';
  div.style.top = top + 'px';
  div.style.height = height + 'px';
  tripLayer.appendChild(div);
}

export function getCellPos(pilot, day) {
  const cell = gridEl.querySelector(`td.day-cell[data-pilot="${pilot}"][data-day="${day}"]`);
  if (!cell) return null;
  const cellRect = cell.getBoundingClientRect();
  const gridRect = gridEl.getBoundingClientRect();
  return {
    left: cellRect.left - gridRect.left,
    top: cellRect.top - gridRect.top,
    width: cellRect.width,
    height: cellRect.height
  };
}

export function pointToCell(clientX, clientY) {
  // Walk cells in row p=1 to map x → day; then any row's td to map y → pilot.
  // Simpler: hit-test via elementsFromPoint.
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    if (el.classList && el.classList.contains('day-cell')) {
      return { pilot: +el.dataset.pilot, day: +el.dataset.day };
    }
  }
  return null;
}
