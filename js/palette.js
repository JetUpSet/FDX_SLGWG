// js/palette.js — builds the draggable trip-template palette and the clear-all button.
import {
  CH_PER_DAY,
  TRIP_TEMPLATES,
  CARRY_OVER_TEMPLATES,
  TRAINING_TEMPLATES,
  RESERVE_TEMPLATES,
  VACATION_TEMPLATES,
  LEAVE_TEMPLATES,
  ABSENCE_TEMPLATES,
  WORK_PERIOD_TEMPLATES,
  DEPARTURE_TEMPLATES,
} from './config.js';
import { fmtCH } from './format.js';
import { getTrips, clearTrips, setSelectedId, pushHistory } from './store.js';
import { renderAll } from './render.js';
import { updateToolbar } from './toolbar.js';

export function initPalette() {
  // -------- Build palette --------
  const paletteEl = document.getElementById('palette');
  const paletteHeader = document.createElement('h2');
  paletteHeader.textContent = 'Trip Templates';
  paletteEl.appendChild(paletteHeader);

  TRIP_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML = `<span>${t.days}-day trip</span><span class="days-badge">${t.days}d</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'trip', days: t.days,
        hoursPerDay: CH_PER_DAY, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Carry Over section ----
  const carryHeader = document.createElement('h2');
  carryHeader.className = 'subsequent';
  carryHeader.textContent = 'Carry Over';
  paletteEl.appendChild(carryHeader);

  CARRY_OVER_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item carryover';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>Carry over</span>` +
      `<span class="days-badge">CO</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'carryover', days: 1,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Training section ----
  const trainHeader = document.createElement('h2');
  trainHeader.className = 'subsequent';
  trainHeader.textContent = 'Training';
  paletteEl.appendChild(trainHeader);

  TRAINING_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item training';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>Training day</span>` +
      `<span class="days-badge">${fmtCH(t.hoursPerDay)}</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'training', days: 1,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Reserve section ----
  const reserveHeader = document.createElement('h2');
  reserveHeader.className = 'subsequent';
  reserveHeader.textContent = 'Reserve';
  paletteEl.appendChild(reserveHeader);

  RESERVE_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item reserve';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>${t.label}</span>` +
      `<span class="days-badge">${t.subType}</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'reserve', subType: t.subType, days: 1,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Vacation section ----
  const vacationHeader = document.createElement('h2');
  vacationHeader.className = 'subsequent';
  vacationHeader.textContent = 'Vacation';
  paletteEl.appendChild(vacationHeader);

  VACATION_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item vacation';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>Vacation</span>` +
      `<span class="days-badge">${t.days}d</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'vacation', days: t.days,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Leave section ----
  const leaveHeader = document.createElement('h2');
  leaveHeader.className = 'subsequent';
  leaveHeader.textContent = 'Leave';
  paletteEl.appendChild(leaveHeader);

  LEAVE_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item leave';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>${t.label}</span>` +
      `<span class="days-badge">${t.days}d</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'leave', label: t.label, days: t.days,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Absence section ----
  const absenceHeader = document.createElement('h2');
  absenceHeader.className = 'subsequent';
  absenceHeader.textContent = 'Absence';
  paletteEl.appendChild(absenceHeader);

  ABSENCE_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item absence';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>${t.label}</span>` +
      `<span class="days-badge">${t.days}d</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'absence', label: t.label, days: t.days,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Work Period section ----
  const workPeriodHeader = document.createElement('h2');
  workPeriodHeader.className = 'subsequent';
  workPeriodHeader.textContent = 'Work Period';
  paletteEl.appendChild(workPeriodHeader);

  WORK_PERIOD_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item workperiod';
    div.draggable = true;
    div.innerHTML =
      `<span>${t.label}</span>` +
      `<span class="days-badge">${t.days}d</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'workperiod', label: t.label, days: t.days,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  // ---- Departure section ----
  const departureHeader = document.createElement('h2');
  departureHeader.className = 'subsequent';
  departureHeader.textContent = 'Departure';
  paletteEl.appendChild(departureHeader);

  DEPARTURE_TEMPLATES.forEach(t => {
    const div = document.createElement('div');
    div.className = 'palette-item departure';
    div.style.background = t.color;
    div.draggable = true;
    div.innerHTML =
      `<span>${t.label}</span>` +
      `<span class="days-badge">${t.days}d</span>`;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'new', type: 'departure', label: t.label, days: t.days,
        hoursPerDay: t.hoursPerDay, color: t.color
      }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(div);
  });

  const hint = document.createElement('div');
  hint.className = 'palette-hint';
  hint.textContent = 'Drop a trip or carry-over onto a row. Drag the right edge to resize days; use the toolbar to change carry-over hours/day.';
  paletteEl.appendChild(hint);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'clear-btn';
  clearBtn.textContent = 'Clear all trips';
  clearBtn.addEventListener('click', () => {
    if (getTrips().length === 0) return;
    if (confirm('Remove all trips from the schedule?')) {
      pushHistory();
      clearTrips();
      setSelectedId(null);
      renderAll();
      updateToolbar();
    }
  });
  paletteEl.appendChild(clearBtn);
}
