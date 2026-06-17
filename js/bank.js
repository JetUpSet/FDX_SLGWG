// js/bank.js — the user-configurable Trip Bank. The header has one count per
// trip length; each count IS the number of that trip staged in the pool, so
// raising/lowering it adds or removes bars live. Bars drag onto the grid to
// assign, and grid bars can be dragged back down to un-assign.
import { TRIP_TEMPLATES, RESERVE_TEMPLATES, CH_PER_DAY } from './config.js';
import {
  getBankTrips, addBankTrip, removeBankTrip, setBankTrips, pushHistory,
} from './store.js';

const bankEl = document.getElementById('tripBank');
const bankBars = document.getElementById('bankBars');

let countInputs = []; // [{ desc, input }]

// A counter descriptor knows how to label its column, match staged bars of its
// kind, and make a new one. Trips match by day-length; reserves by subtype.
function tripDescriptor(tmpl) {
  return {
    label: `${tmpl.days}-Day`,
    color: tmpl.color,
    match: t => t.type === 'trip' && t.days === tmpl.days,
    make: () => ({
      type: 'trip', label: `${tmpl.days}-Day`,
      days: tmpl.days, hoursPerDay: CH_PER_DAY, color: tmpl.color,
    }),
  };
}
function reserveDescriptor(tmpl) {
  return {
    label: tmpl.subType,
    color: tmpl.color,
    match: t => t.type === 'reserve' && t.subType === tmpl.subType,
    make: () => ({
      type: 'reserve', subType: tmpl.subType, label: tmpl.label,
      days: 1, hoursPerDay: tmpl.hoursPerDay, color: tmpl.color,
    }),
  };
}

export function initBank() {
  buildConfig();
  const clearBtn = document.getElementById('bankClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (getBankTrips().length === 0) return;
      pushHistory();
      setBankTrips([]);
      renderBank();
    });
  }
  renderBank();
}

// Build labeled count rows: one per trip length, one per reserve subtype.
function buildConfig() {
  const cfg = document.getElementById('bankConfig');
  if (!cfg) return;
  cfg.innerHTML = '';
  countInputs = [];
  addCountRow(cfg, 'Trips', TRIP_TEMPLATES.map(tripDescriptor));
  addCountRow(cfg, 'Reserve', RESERVE_TEMPLATES.map(reserveDescriptor));
}

function addCountRow(cfg, title, descriptors) {
  const row = document.createElement('div');
  row.className = 'bank-row';

  const heading = document.createElement('div');
  heading.className = 'bank-row-label';
  heading.textContent = title;
  row.appendChild(heading);

  const cols = document.createElement('div');
  cols.className = 'bank-cols';
  descriptors.forEach(desc => {
    const col = document.createElement('div');
    col.className = 'bank-col';

    const dot = document.createElement('span');
    dot.className = 'bank-col-dot';
    dot.style.background = desc.color;

    const name = document.createElement('span');
    name.className = 'bank-col-label';
    name.textContent = desc.label;

    const input = document.createElement('input');
    input.className = 'bank-col-count';
    input.type = 'number';
    input.min = '0';
    input.value = '0';
    input.addEventListener('change', () => applyCount(desc, input));

    col.appendChild(dot);
    col.appendChild(name);
    col.appendChild(input);
    cols.appendChild(col);
    countInputs.push({ desc, input });
  });
  row.appendChild(cols);
  cfg.appendChild(row);
}

// Count of staged bars matching a descriptor.
function poolCountFor(desc) {
  return getBankTrips().filter(desc.match).length;
}

// Reconcile the staged count for one descriptor to match the input value.
function applyCount(desc, input) {
  let target = parseInt(input.value, 10);
  if (!Number.isFinite(target) || target < 0) target = 0;
  input.value = target;

  const current = poolCountFor(desc);
  if (target === current) return;

  pushHistory();
  if (target > current) {
    for (let i = 0; i < target - current; i++) addBankTrip(desc.make());
  } else {
    // Remove the most recently staged matching bars.
    const matches = getBankTrips().filter(desc.match);
    matches.slice(target).forEach(t => removeBankTrip(t.id));
  }
  renderBank();
}

// Reflect the live staged counts back into the header inputs.
function syncInputs() {
  countInputs.forEach(({ desc, input }) => {
    if (input === document.activeElement) return; // don't fight the user mid-edit
    input.value = poolCountFor(desc);
  });
}

export function renderBank() {
  syncInputs();
  if (!bankBars) return;
  const trips = getBankTrips();
  bankBars.innerHTML = '';
  if (trips.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bank-empty';
    empty.textContent = 'No trips staged — set counts above, or drag a bar down here from the grid.';
    bankBars.appendChild(empty);
    return;
  }
  trips.forEach(t => bankBars.appendChild(buildBankItem(t)));
}

function buildBankItem(t) {
  const item = document.createElement('div');
  item.className = 'bank-item';
  item.style.background = t.color;
  item.draggable = true;
  item.dataset.id = t.id;

  const label = document.createElement('span');
  label.className = 'bank-item-label';
  // Reserves show the bare subtype (e.g. 'RA') to match the grid chip style.
  label.textContent = t.type === 'reserve' && t.subType
    ? t.subType
    : (t.label || (t.days === 1 ? '1-Day' : `${t.days}-Day`));
  item.appendChild(label);

  const remove = document.createElement('button');
  remove.className = 'bank-remove';
  remove.textContent = '×';
  remove.title = 'Remove';
  remove.draggable = false;
  remove.addEventListener('mousedown', e => e.stopPropagation());
  remove.addEventListener('click', () => {
    pushHistory();
    removeBankTrip(t.id);
    renderBank();
  });
  item.appendChild(remove);

  // Drag onto the grid to assign (handled by the grid drop listener)
  item.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      kind: 'bank', id: t.id,
      type: t.type, label: t.label, subType: t.subType, days: t.days,
      hoursPerDay: t.hoursPerDay, color: t.color, dh: t.dh,
    }));
    e.dataTransfer.effectAllowed = 'copyMove'; // must include 'copy' to match the grid's dropEffect
  });

  return item;
}

// True if the viewport point (x, y) is over the bank drop zone.
export function isPointOverBank(x, y) {
  if (!bankEl) return false;
  const r = bankEl.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// Highlight the bank while a grid bar is being dragged over it.
export function setBankDropActive(active) {
  if (bankEl) bankEl.classList.toggle('drop-active', !!active);
}
