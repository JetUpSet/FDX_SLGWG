// js/bank.js — the user-configurable Trip Bank. The header has one count per
// trip length; each count IS the number of that trip staged in the pool, so
// raising/lowering it adds or removes bars live. Bars drag onto the grid to
// assign, and grid bars can be dragged back down to un-assign.
import { TRIP_TEMPLATES, CH_PER_DAY } from './config.js';
import {
  getBankTrips, addBankTrip, removeBankTrip, setBankTrips, pushHistory,
} from './store.js';

const bankEl = document.getElementById('tripBank');
const bankBars = document.getElementById('bankBars');

let countInputs = []; // [{ tmpl, input }]

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

// Build one labeled count column per trip length in TRIP_TEMPLATES.
function buildConfig() {
  const cfg = document.getElementById('bankConfig');
  if (!cfg) return;
  cfg.innerHTML = '';
  countInputs = [];
  TRIP_TEMPLATES.forEach(tmpl => {
    const col = document.createElement('div');
    col.className = 'bank-col';

    const dot = document.createElement('span');
    dot.className = 'bank-col-dot';
    dot.style.background = tmpl.color;

    const name = document.createElement('span');
    name.className = 'bank-col-label';
    name.textContent = `${tmpl.days}-Day`;

    const input = document.createElement('input');
    input.className = 'bank-col-count';
    input.type = 'number';
    input.min = '0';
    input.value = '0';
    input.addEventListener('change', () => applyCount(tmpl, input));

    col.appendChild(dot);
    col.appendChild(name);
    col.appendChild(input);
    cfg.appendChild(col);
    countInputs.push({ tmpl, input });
  });
}

// Count of staged trips of a given length (only the generic 'trip' type).
function poolCountFor(days) {
  return getBankTrips().filter(t => t.type === 'trip' && t.days === days).length;
}

// Reconcile the pool for one trip length to match the input value.
function applyCount(tmpl, input) {
  let target = parseInt(input.value, 10);
  if (!Number.isFinite(target) || target < 0) target = 0;
  input.value = target;

  const current = poolCountFor(tmpl.days);
  if (target === current) return;

  pushHistory();
  if (target > current) {
    for (let i = 0; i < target - current; i++) {
      addBankTrip({
        type: 'trip',
        label: `${tmpl.days}-Day`,
        days: tmpl.days,
        hoursPerDay: CH_PER_DAY,
        color: tmpl.color,
      });
    }
  } else {
    // Remove the most recently staged bars of this length.
    const matches = getBankTrips().filter(t => t.type === 'trip' && t.days === tmpl.days);
    matches.slice(target).forEach(t => removeBankTrip(t.id));
  }
  renderBank();
}

// Reflect the live pool counts back into the header inputs.
function syncInputs() {
  countInputs.forEach(({ tmpl, input }) => {
    if (input === document.activeElement) return; // don't fight the user mid-edit
    input.value = poolCountFor(tmpl.days);
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
