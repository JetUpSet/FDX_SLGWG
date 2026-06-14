// js/toolbar.js — the floating selection toolbar (recolor swatches, delete, reserve hours/day).
import { COLORS, DH_OPTIONS, DH_PLANE } from './config.js';
import { fmtCH, parseHpd } from './format.js';
import { getTrips, getSelectedId, pushHistory } from './store.js';
import { renderAll } from './render.js';

const toolbar = document.getElementById('toolbar');
const swatchesEl = document.getElementById('swatches');
const hpdGroup = document.getElementById('hpdGroup');
const hpdInput = document.getElementById('hpdInput');
const dhGroup = document.getElementById('dhGroup');
const dhBtnsEl = document.getElementById('dhBtns');

const DH_DISPLAY = {
  none: 'No DH',
  front: `${DH_PLANE} Front`,
  back: `Back ${DH_PLANE}`,
  double: `${DH_PLANE} Both ${DH_PLANE}`,
};

let onDelete = () => {};
export function setToolbarHandlers(h) { if (h.onDelete) onDelete = h.onDelete; }

export function initToolbar() {
  COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener('mousedown', e => e.stopPropagation());
    s.addEventListener('click', () => {
      if (getSelectedId() == null) return;
      const t = getTrips().find(t => t.id === getSelectedId());
      if (t && t.color !== c) { pushHistory(); t.color = c; renderAll(); updateToolbar(); }
    });
    swatchesEl.appendChild(s);
  });

  DH_OPTIONS.forEach(opt => {
    const b = document.createElement('button');
    b.className = 'dh-btn';
    b.dataset.dh = opt.id;
    b.textContent = DH_DISPLAY[opt.id] || opt.id;
    b.title = opt.title;
    b.addEventListener('mousedown', e => e.stopPropagation());
    b.addEventListener('click', () => {
      if (getSelectedId() == null) return;
      const t = getTrips().find(t => t.id === getSelectedId());
      if (!t || (t.dh || 'none') === opt.id) return;
      pushHistory();
      t.dh = opt.id;
      renderAll();
      updateToolbar();
    });
    dhBtnsEl.appendChild(b);
  });

  const deleteBtn = document.getElementById('deleteBtn');
  deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
  deleteBtn.addEventListener('click', () => onDelete());

  hpdInput.addEventListener('mousedown', e => e.stopPropagation());
  hpdInput.addEventListener('blur', commitHpd);
  hpdInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hpdInput.blur(); } });
}

function commitHpd() {
  if (getSelectedId() == null) return;
  const t = getTrips().find(t => t.id === getSelectedId());
  if (!t || t.type !== 'reserve') return;
  const v = parseHpd(hpdInput.value);
  if (v == null || v <= 0) {
    // Reject: restore previous value
    hpdInput.value = fmtCH(t.hoursPerDay);
    return;
  }
  if (v !== t.hoursPerDay) pushHistory();
  t.hoursPerDay = v;
  renderAll();
  hpdInput.value = fmtCH(t.hoursPerDay);
}

export function updateToolbar() {
  if (getSelectedId() == null) {
    toolbar.classList.remove('visible');
    return;
  }
  const t = getTrips().find(t => t.id === getSelectedId());
  if (!t) { toolbar.classList.remove('visible'); return; }
  toolbar.classList.add('visible');
  [...swatchesEl.children].forEach(s => {
    s.classList.toggle('active', s.dataset.color === t.color);
  });
  // Show the hours/day input only for reserves
  if (t.type === 'reserve') {
    hpdGroup.classList.add('visible');
    // Don't clobber while user is typing
    if (document.activeElement !== hpdInput) {
      hpdInput.value = fmtCH(t.hoursPerDay);
    }
  } else {
    hpdGroup.classList.remove('visible');
  }

  // Show the deadhead options for real trips (not the bracket markers)
  const isOverlay = t.type === 'workperiod' || t.type === 'departure';
  if (isOverlay) {
    dhGroup.classList.remove('visible');
  } else {
    dhGroup.classList.add('visible');
    const cur = t.dh || 'none';
    [...dhBtnsEl.children].forEach(b => b.classList.toggle('active', b.dataset.dh === cur));
  }
}
