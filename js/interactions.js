// js/interactions.js — pointer/keyboard interactions: create (drop), move, resize, select, delete.
import { DAY_COUNT } from './config.js';
import { getTrips, getSelectedId, setSelectedId, removeTrip, addTrip, getPilotCount } from './store.js';
import { renderAll } from './render.js';
import { getCellPos, pointToCell } from './grid.js';
import { updateToolbar } from './toolbar.js';

const gridEl = document.getElementById('grid');

export function selectTrip(id) {
  setSelectedId(id);
  renderAll();
  updateToolbar();
}

export function deleteSelected() {
  if (getSelectedId() == null) return;
  removeTrip(getSelectedId());
  setSelectedId(null);
  renderAll();
  updateToolbar();
}

export function startMove(id, ev) {
  const trip = getTrips().find(t => t.id === id);
  if (!trip) return;
  const cellPos = getCellPos(trip.pilot, trip.day);
  if (!cellPos) return;
  const cellW = cellPos.width;
  const cellH = cellPos.height;
  const startX = ev.clientX;
  const startY = ev.clientY;
  const origDay = trip.day;
  const origPilot = trip.pilot;

  function onMove(e) {
    const dayDelta = Math.round((e.clientX - startX) / cellW);
    const pilotDelta = Math.round((e.clientY - startY) / cellH);
    let newDay = origDay + dayDelta;
    let newPilot = origPilot + pilotDelta;
    newDay = Math.max(1, Math.min(DAY_COUNT - trip.days + 1, newDay));
    newPilot = Math.max(1, Math.min(getPilotCount(), newPilot));
    if (newDay !== trip.day || newPilot !== trip.pilot) {
      trip.day = newDay;
      trip.pilot = newPilot;
      renderAll();
    }
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

export function startResize(id, ev) {
  const trip = getTrips().find(t => t.id === id);
  if (!trip) return;
  const cellPos = getCellPos(trip.pilot, trip.day);
  if (!cellPos) return;
  const cellW = cellPos.width;
  const startX = ev.clientX;
  const origDays = trip.days;

  function onMove(e) {
    const dayDelta = Math.round((e.clientX - startX) / cellW);
    let newDays = origDays + dayDelta;
    newDays = Math.max(1, Math.min(DAY_COUNT - trip.day + 1, newDays));
    if (newDays !== trip.days) {
      trip.days = newDays;
      renderAll();
    }
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

export function initInteractions() {
  // -------- Drop from palette --------
  gridEl.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  gridEl.addEventListener('drop', e => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    if (payload.kind !== 'new') return;

    const cell = pointToCell(e.clientX, e.clientY);
    if (!cell) return;
    const day = Math.max(1, Math.min(DAY_COUNT - payload.days + 1, cell.day));
    const id = addTrip({
      type: payload.type || 'trip',
      label: payload.label,
      subType: payload.subType,
      pilot: cell.pilot, day,
      days: payload.days,
      hoursPerDay: payload.hoursPerDay,
      color: payload.color
    });
    selectTrip(id);
  });

  // -------- Click-outside deselect --------
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.trip')) return;
    if (e.target.closest('.toolbar')) return;
    if (e.target.closest('.palette')) return;
    setSelectedId(null);
    renderAll();
    updateToolbar();
  });

  // -------- Selection keyboard handler --------
  document.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && getSelectedId() != null) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      deleteSelected();
    }
    if (e.key === 'Escape') {
      setSelectedId(null);
      renderAll();
      updateToolbar();
    }
  });
}
