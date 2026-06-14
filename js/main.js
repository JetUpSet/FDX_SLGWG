import { buildGrid, setGridHandlers } from './grid.js';
import { renderAll, setRenderHandlers } from './render.js';
import { initToolbar, updateToolbar, setToolbarHandlers } from './toolbar.js';
import { selectTrip, startMove, startResize, deleteSelected, initInteractions } from './interactions.js';
import { initPalette } from './palette.js';
import { initBank } from './bank.js';
import { initAnnotate } from './annotate.js';
import { initRandomizer } from './randomizer.js';
import { initFeasibility, handleFeasibilitySenClick, exitFeasibility } from './feasibility.js';
import { getTrips, setTrips, getPilotCount, setPilotCount, setSelectedId } from './store.js';

  // -------- Build palette --------
  initPalette();

  // -------- Trip Bank --------
  initBank();

  // -------- Annotations --------
  initAnnotate();

  // -------- Build grid --------
  setGridHandlers({ onSenClick: handleFeasibilitySenClick, onBidChange: renderAll });
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
  initFeasibility();

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
    exitFeasibility();
    buildGrid();
    renderAll();
    updateToolbar();
  }
  pilotCountInput.addEventListener('change', applyPilotCount);
  pilotCountInput.addEventListener('blur', applyPilotCount);

  // Reposition trips if the window resizes (cell sizes shouldn't change but be safe).
  window.addEventListener('resize', renderAll);
