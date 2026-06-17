// js/interactions.js — pointer/keyboard interactions: create (drop), move, resize, select, delete.
import { DAY_COUNT } from './config.js';
import { getTrips, getSelectedId, setSelectedId, removeTrip, addTrip, getPilotCount, pushHistory, undo, removeBankTrip, addBankTrip } from './store.js';
import { renderAll } from './render.js';
import { getCellPos, pointToCell } from './grid.js';
import { updateToolbar } from './toolbar.js';
import { isPointOverBank, setBankDropActive } from './bank.js';

const gridEl = document.getElementById('grid');

export function selectTrip(id) {
  setSelectedId(id);
  renderAll();
  updateToolbar();
}

export function deleteSelected() {
  if (getSelectedId() == null) return;
  pushHistory();
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
  let snapped = false;

  function onMove(e) {
    const overBank = isPointOverBank(e.clientX, e.clientY);
    setBankDropActive(overBank);
    if (overBank) return; // hovering the bank: hold position, we'll un-assign on drop
    const dayDelta = Math.round((e.clientX - startX) / cellW);
    const pilotDelta = Math.round((e.clientY - startY) / cellH);
    let newDay = origDay + dayDelta;
    let newPilot = origPilot + pilotDelta;
    newDay = Math.max(1, Math.min(DAY_COUNT - trip.days + 1, newDay));
    newPilot = Math.max(1, Math.min(getPilotCount(), newPilot));
    if (newDay !== trip.day || newPilot !== trip.pilot) {
      if (!snapped) { pushHistory(); snapped = true; } // snapshot pre-move state once
      trip.day = newDay;
      trip.pilot = newPilot;
      renderAll();
    }
  }
  function onUp(e) {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    setBankDropActive(false);
    // Dropped over the bank → un-assign the trip (grid → bank)
    if (isPointOverBank(e.clientX, e.clientY)) {
      if (!snapped) pushHistory();
      removeTrip(trip.id);
      addBankTrip({
        type: trip.type, label: trip.label, subType: trip.subType, days: trip.days,
        hoursPerDay: trip.hoursPerDay, color: trip.color, dh: trip.dh,
      });
      setSelectedId(null);
      renderAll();
      updateToolbar();
    }
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
  let snapped = false;

  function onMove(e) {
    const dayDelta = Math.round((e.clientX - startX) / cellW);
    let newDays = origDays + dayDelta;
    newDays = Math.max(1, Math.min(DAY_COUNT - trip.day + 1, newDays));
    if (newDays !== trip.days) {
      if (!snapped) { pushHistory(); snapped = true; } // snapshot pre-resize state once
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

export function startResizeLeft(id, ev) {
  const trip = getTrips().find(t => t.id === id);
  if (!trip) return;
  const cellPos = getCellPos(trip.pilot, trip.day);
  if (!cellPos) return;
  const cellW = cellPos.width;
  const startX = ev.clientX;
  const origDay = trip.day;
  const fixedRight = trip.day + trip.days - 1; // right edge stays put
  let snapped = false;

  function onMove(e) {
    const dayDelta = Math.round((e.clientX - startX) / cellW);
    let newDay = origDay + dayDelta;
    newDay = Math.max(1, Math.min(fixedRight, newDay)); // clamp: day >= 1, min 1 day
    const newDays = fixedRight - newDay + 1;
    if (newDay !== trip.day || newDays !== trip.days) {
      if (!snapped) { pushHistory(); snapped = true; } // snapshot pre-resize state once
      trip.day = newDay;
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
    if (payload.kind !== 'new' && payload.kind !== 'bank') return;

    const cell = pointToCell(e.clientX, e.clientY);
    if (!cell) return;
    const day = Math.max(1, Math.min(DAY_COUNT - payload.days + 1, cell.day));
    pushHistory();
    if (payload.kind === 'bank') removeBankTrip(payload.id); // move out of the bank
    const id = addTrip({
      type: payload.type || 'trip',
      label: payload.label,
      subType: payload.subType,
      pilot: cell.pilot, day,
      days: payload.days,
      hoursPerDay: payload.hoursPerDay,
      color: payload.color,
      dh: payload.dh
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
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA';

    // Undo: Ctrl+Z / Cmd+Z (ignore while typing in an input so the field's own undo works)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (inField) return;
      e.preventDefault();
      if (undo()) { renderAll(); updateToolbar(); }
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && getSelectedId() != null) {
      if (inField) return;
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
