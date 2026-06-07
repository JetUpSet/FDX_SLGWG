// js/grid.js — builds the schedule grid and measures cell geometry.
import { DAY_COUNT } from './config.js';
import { getPilotCount } from './store.js';

const gridEl = document.getElementById('grid');
let tripLayer = null;
let onSenClick = () => false; // injected by main.js; returns true if it consumed the click

export function setGridHandlers(h) { if (h.onSenClick) onSenClick = h.onSenClick; }
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
    th.textContent = d;
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
