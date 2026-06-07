import {
  DAY_COUNT, BAR_H, CH_PER_DAY, COLORS,
  TRIP_TEMPLATES, CARRY_OVER_TEMPLATES, TRAINING_TEMPLATES,
  RESERVE_TEMPLATES, VACATION_TEMPLATES,
} from './config.js';
import { parseHpd, fmtCH, randInt } from './format.js';
import {
  getTrips, setTrips, clearTrips, addTrip, removeTrip,
  getSelectedId, setSelectedId, getPilotCount, setPilotCount,
} from './store.js';
import { buildGrid, getCellPos, pointToCell, getTripLayer, setGridHandlers } from './grid.js';
import { renderAll, setRenderHandlers } from './render.js';
import { initToolbar, updateToolbar, setToolbarHandlers } from './toolbar.js';
import { selectTrip, startMove, startResize, deleteSelected, initInteractions } from './interactions.js';
import { initPalette } from './palette.js';
import { initRandomizer } from './randomizer.js';

  // -------- Build palette --------
  initPalette();

  // -------- Build grid --------
  const gridEl = document.getElementById('grid');

  setGridHandlers({ onSenClick: handleFeasibilitySenClick });
  setRenderHandlers({ onSelect: selectTrip, onMove: startMove, onResize: startResize });
  buildGrid();

  // -------- Toolbar --------
  initToolbar();
  setToolbarHandlers({ onDelete: deleteSelected });

  // -------- Interactions --------
  initInteractions();

  // -------- Randomizer --------
  initRandomizer();

  // -------- Feasibility mode --------
  // States: 'off' | 'first' (waiting for bidding pilot) | 'second' (waiting for upper bound)
  let feasibilityMode = 'off';
  let feasibilityFirst = null;
  let feasibilitySecond = null;
  const feasibilityBtn = document.getElementById('feasibilityBtn');
  const feasibilityBanner = document.getElementById('feasibilityBanner');

  function clearFeasibilityShading() {
    gridEl.querySelectorAll('tr.feasibility-below, tr.feasibility-unlocked, tr.feasibility-boundary')
      .forEach(tr => {
        tr.classList.remove('feasibility-below', 'feasibility-unlocked', 'feasibility-boundary');
      });
  }

  function applyFeasibilityShading() {
    clearFeasibilityShading();
    if (feasibilityFirst == null) return;
    const rows = gridEl.querySelectorAll('tbody tr');
    rows.forEach((tr, idx) => {
      const p = idx + 1;
      if (p > feasibilityFirst) {
        tr.classList.add('feasibility-below');
      }
      if (p === feasibilityFirst) {
        tr.classList.add('feasibility-boundary');
      }
      if (feasibilitySecond != null) {
        const top = Math.min(feasibilityFirst, feasibilitySecond);
        const bottom = Math.max(feasibilityFirst, feasibilitySecond);
        // Range between the two selections (exclusive of the bidding pilot itself)
        if (p >= top && p < bottom) {
          tr.classList.add('feasibility-unlocked');
        }
        if (p === feasibilitySecond) {
          tr.classList.add('feasibility-boundary');
        }
      }
    });
  }

  function updateFeasibilityBanner() {
    if (feasibilityMode === 'off') {
      feasibilityBanner.classList.remove('visible');
      feasibilityBanner.innerHTML = '';
      return;
    }
    feasibilityBanner.classList.add('visible');
    if (feasibilityMode === 'first') {
      feasibilityBanner.innerHTML =
        '<strong>Feasibility:</strong> click a pilot\'s seniority number to set the bidding pilot. ' +
        'Press <em>Esc</em> or click Feasibility again to exit.';
    } else if (feasibilityMode === 'second') {
      feasibilityBanner.innerHTML =
        '<strong>Trips unlocked</strong> for pilots below #' + feasibilityFirst.toString().padStart(2,'0') +
        '. Now click a more senior pilot to set the upper bound of the unlocked range.';
    } else if (feasibilityMode === 'done') {
      const top = Math.min(feasibilityFirst, feasibilitySecond);
      const bottom = Math.max(feasibilityFirst, feasibilitySecond);
      const unlockedTop = top;
      const unlockedBottom = bottom - 1;
      const rangeText = unlockedBottom >= unlockedTop
        ? '#' + unlockedTop.toString().padStart(2,'0') + '–#' + unlockedBottom.toString().padStart(2,'0')
        : 'no pilots';
      feasibilityBanner.innerHTML =
        '<strong>Feasibility complete.</strong> Bidding pilot: #' + feasibilityFirst.toString().padStart(2,'0') +
        '. Trips unlocked for ' + rangeText + '. ' +
        '<button class="pool-action-btn" id="sendToPoolBtn">Send affected trips to pool</button>';
      const btn = document.getElementById('sendToPoolBtn');
      if (btn) btn.addEventListener('click', sendAffectedToPool);
    }
  }

  function sendAffectedToPool() {
    if (feasibilityFirst == null) return;
    // Find trip + reserve bars on pilots BELOW the bidding pilot
    const toMove = getTrips().filter(t =>
      !t.inPool &&
      t.pilot > feasibilityFirst &&
      (t.type === 'trip' || t.type === 'reserve')
    );
    if (toMove.length === 0) {
      feasibilityBanner.innerHTML +=
        ' <em>(nothing to move — affected pilots have no trip/reserve bars)</em>';
      return;
    }
    // Play a brief dissolve animation on each grid bar, then move into the pool
    toMove.forEach(t => {
      const el = gridEl.querySelector(`.trip[data-id="${t.id}"]`);
      if (el) el.classList.add('dissolving');
    });
    setTimeout(() => {
      toMove.forEach(t => { t.inPool = true; });
      setSelectedId(null);
      renderAll();
      updateToolbar();
      feasibilityBanner.innerHTML =
        '<strong>' + toMove.length + ' bar' + (toMove.length === 1 ? '' : 's') +
        '</strong> moved to the Trip Pool. Click Feasibility to reset.';
    }, 320);
  }

  function exitFeasibility() {
    feasibilityMode = 'off';
    feasibilityFirst = null;
    feasibilitySecond = null;
    feasibilityBtn.classList.remove('active');
    clearFeasibilityShading();
    updateFeasibilityBanner();
  }

  feasibilityBtn.addEventListener('click', () => {
    if (feasibilityMode === 'off') {
      feasibilityMode = 'first';
      feasibilityBtn.classList.add('active');
      // Clear any plain row highlights so they don't compete visually
      gridEl.querySelectorAll('tr.row-highlighted')
        .forEach(tr => tr.classList.remove('row-highlighted'));
      updateFeasibilityBanner();
    } else {
      exitFeasibility();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && feasibilityMode !== 'off') {
      exitFeasibility();
    }
  });

  // Called by the seniority-cell click handler. Returns true if the click was consumed by feasibility mode.
  function handleFeasibilitySenClick(pilot) {
    if (feasibilityMode === 'off') return false;
    if (feasibilityMode === 'first') {
      feasibilityFirst = pilot;
      feasibilityMode = 'second';
      applyFeasibilityShading();
      updateFeasibilityBanner();
      return true;
    }
    if (feasibilityMode === 'second') {
      if (pilot === feasibilityFirst) return true; // ignore self-click
      feasibilitySecond = pilot;
      feasibilityMode = 'done';
      applyFeasibilityShading();
      updateFeasibilityBanner();
      return true;
    }
    if (feasibilityMode === 'done') {
      // Restart selection
      feasibilityFirst = pilot;
      feasibilitySecond = null;
      feasibilityMode = 'second';
      applyFeasibilityShading();
      updateFeasibilityBanner();
      return true;
    }
    return false;
  }

  // Pilot count input — rebuild grid when it changes
  const pilotCountInput = document.getElementById('pilotCount');
  function applyPilotCount() {
    let n = parseInt(pilotCountInput.value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 50) n = 50;
    if (n === getPilotCount()) return;
    setPilotCount(n);
    pilotCountInput.value = n;
    // Drop any trips assigned to pilots that no longer exist
    setTrips(getTrips().filter(t => t.pilot <= getPilotCount()));
    setSelectedId(null);
    // Reset feasibility — rows have been recreated
    if (feasibilityMode !== 'off') exitFeasibility();
    buildGrid();
    renderAll();
    updateToolbar();
  }
  pilotCountInput.addEventListener('change', applyPilotCount);
  pilotCountInput.addEventListener('blur', applyPilotCount);

  // Reposition trips if the window resizes (cell sizes shouldn't change but be safe).
  window.addEventListener('resize', renderAll);
