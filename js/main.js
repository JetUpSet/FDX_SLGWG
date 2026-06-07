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
      clearTrips();
      setSelectedId(null);
      renderAll();
      updateToolbar();
    }
  });
  paletteEl.appendChild(clearBtn);

  // -------- Build grid --------
  const gridEl = document.getElementById('grid');

  setGridHandlers({ onSenClick: handleFeasibilitySenClick });
  setRenderHandlers({ onSelect: selectTrip, onMove: startMove, onResize: startResize });
  buildGrid();

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
      subType: payload.subType,
      pilot: cell.pilot, day,
      days: payload.days,
      hoursPerDay: payload.hoursPerDay,
      color: payload.color
    });
    selectTrip(id);
  });

  // -------- Move --------
  function startMove(id, ev) {
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

  // -------- Resize --------
  function startResize(id, ev) {
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

  // -------- Toolbar --------
  initToolbar();
  setToolbarHandlers({ onDelete: deleteSelected });

  function deleteSelected() {
    if (getSelectedId() == null) return;
    removeTrip(getSelectedId());
    setSelectedId(null);
    renderAll();
    updateToolbar();
  }

  function selectTrip(id) {
    setSelectedId(id);
    renderAll();
    updateToolbar();
  }

  // -------- Click-outside deselect & keyboard --------
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.trip')) return;
    if (e.target.closest('.toolbar')) return;
    if (e.target.closest('.palette')) return;
    setSelectedId(null);
    renderAll();
    updateToolbar();
  });

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

  // -------- Randomizer --------
  function randomizeSchedule(minCh, maxCh) {
    if (maxCh < minCh) [minCh, maxCh] = [maxCh, minCh];
    clearTrips();
    setSelectedId(null);

    const CARRY_OVER_PROB = 0.4;
    const CARRY_OVER_COLOR = '#64748b';
    const TRAINING_DAYS = 3;
    const TRAINING_HPD = 4.5;
    const TRAINING_COLOR = '#b45309';
    const VACATION_DAYS = 7;
    const VACATION_HPD = 6;
    const VACATION_COLOR = '#7e22ce';

    // Scale special-pilot counts proportionally to current getPilotCount() (baseline = 20)
    // Baseline: 4 reserve, 2 vacation, 2 training out of 20.
    const reserveCount  = Math.max(1, Math.round(getPilotCount() * 0.20));
    const vacationCount = getPilotCount() >= 8 ? Math.max(1, Math.round(getPilotCount() * 0.10)) : 0;
    const trainingCount = getPilotCount() >= 8 ? Math.max(1, Math.round(getPilotCount() * 0.10)) : 0;

    // Last N pilots are reserve-only
    const reservePilots = new Set();
    for (let i = 0; i < Math.min(reserveCount, getPilotCount()); i++) {
      reservePilots.add(getPilotCount() - i);
    }

    // Eligible pool for training & vacation = everyone NOT in reserve
    const eligible = [];
    for (let p = 1; p <= getPilotCount(); p++) if (!reservePilots.has(p)) eligible.push(p);
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const vacationPilots = new Set(eligible.slice(0, vacationCount));
    const trainingPilots = new Set(
      eligible.slice(vacationCount, vacationCount + trainingCount)
    );

    // Helper — place a block of given length at a random free slot, starting at startMin or later.
    function tryPlace(taken, length, startMin) {
      const maxStart = DAY_COUNT - length + 1;
      if (startMin > maxStart) return null;
      for (let attempt = 0; attempt < 80; attempt++) {
        const start = randInt(startMin, maxStart);
        let ok = true;
        for (let d = start; d < start + length; d++) {
          if (taken[d]) { ok = false; break; }
        }
        if (ok) {
          for (let d = start; d < start + length; d++) taken[d] = true;
          return start;
        }
      }
      return null;
    }

    for (let p = 1; p <= getPilotCount(); p++) {
      const targetCh = randInt(minCh, maxCh);
      const taken = new Array(DAY_COUNT + 2).fill(false);
      let chSoFar = 0;

      // Optional carry-over starting day 1 (1-3 days)
      let carryOverDays = 0;
      if (Math.random() < CARRY_OVER_PROB) {
        carryOverDays = randInt(1, 3);
        // Don't let carry-over alone exceed maxCh
        while (carryOverDays * 6 > maxCh && carryOverDays > 1) carryOverDays--;
        if (carryOverDays * 6 <= maxCh) {
          addTrip({
            type: 'carryover',
            pilot: p, day: 1, days: carryOverDays,
            hoursPerDay: 6, color: CARRY_OVER_COLOR
          });
          for (let d = 1; d <= carryOverDays; d++) taken[d] = true;
          chSoFar += carryOverDays * 6;
        } else {
          carryOverDays = 0;
        }
      }
      const earliestDay = carryOverDays + 1;

      // RESERVE-only pilots: build with min 4-day reserve blocks
      if (reservePilots.has(p)) {
        const hpd = 4.75;
        // Pick a total reserve-day count that lands the pilot in [minCh, maxCh]
        let loR = Math.max(0, Math.ceil((minCh - chSoFar) / hpd));
        const hiR = Math.floor((maxCh - chSoFar) / hpd);
        if (loR > 0 && loR < 4) loR = 4;          // smallest valid block is 4
        let R;
        if (hiR >= 4 && loR <= hiR) {
          R = randInt(Math.max(4, loR), hiR);
        } else if (loR > 0) {
          R = Math.max(4, loR);                   // overshoot max slightly to hit min
        } else {
          R = 0;
        }
        // Split R into a series of 4-8 day blocks (preserving the 4-day minimum)
        const blocks = [];
        let remR = R;
        while (remR >= 4) {
          let len;
          if (remR <= 8) { len = remR; }
          else if (remR <= 11) { len = randInt(4, remR - 4); }
          else { len = randInt(4, 8); }
          blocks.push(len);
          remR -= len;
        }
        // Place each block
        for (const len of blocks) {
          const sub = RESERVE_TEMPLATES[randInt(0, RESERVE_TEMPLATES.length - 1)];
          const start = tryPlace(taken, len, earliestDay);
          if (start == null) continue;
          addTrip({
            type: 'reserve', subType: sub.subType,
            pilot: p, day: start, days: len,
            hoursPerDay: hpd, color: sub.color
          });
          chSoFar += len * hpd;
        }
        continue; // no trips for reserve-only pilots
      }

      // Vacation block (7 days). Counts toward CH budget.
      if (vacationPilots.has(p) && chSoFar + VACATION_DAYS * VACATION_HPD <= maxCh) {
        const start = tryPlace(taken, VACATION_DAYS, earliestDay);
        if (start != null) {
          addTrip({
            type: 'vacation',
            pilot: p, day: start, days: VACATION_DAYS,
            hoursPerDay: VACATION_HPD, color: VACATION_COLOR
          });
          chSoFar += VACATION_DAYS * VACATION_HPD;
        }
      }

      // Training block (3 days). Cannot push pilot past maxCh.
      if (trainingPilots.has(p) && chSoFar + TRAINING_DAYS * TRAINING_HPD <= maxCh) {
        const start = tryPlace(taken, TRAINING_DAYS, earliestDay);
        if (start != null) {
          addTrip({
            type: 'training',
            pilot: p, day: start, days: TRAINING_DAYS,
            hoursPerDay: TRAINING_HPD, color: TRAINING_COLOR
          });
          chSoFar += TRAINING_DAYS * TRAINING_HPD;
        }
      }

      // Fill the rest with 6 CH/day trips so total lands in [minCh, maxCh].
      // Trips are whole 6-CH days, so find the integer count satisfying both bounds.
      const minTripDays = Math.max(0, Math.ceil((minCh - chSoFar) / 6));
      const maxTripDays = Math.max(0, Math.floor((maxCh - chSoFar) / 6));
      let tripDays;
      if (minTripDays <= maxTripDays) {
        tripDays = randInt(minTripDays, maxTripDays);
      } else {
        // Range infeasible — prefer hitting min (slight overshoot of max)
        tripDays = minTripDays;
      }

      const segments = [];
      let remaining = tripDays;
      while (remaining > 0) {
        const len = Math.min(remaining, randInt(1, 5));
        segments.push(len);
        remaining -= len;
      }
      for (let i = segments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [segments[i], segments[j]] = [segments[j], segments[i]];
      }
      for (const seg of segments) {
        const start = tryPlace(taken, seg, earliestDay);
        if (start == null) continue;
        addTrip({
          type: 'trip',
          pilot: p, day: start, days: seg,
          hoursPerDay: 6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
      }
    }
    renderAll();
    updateToolbar();
  }

  document.getElementById('randomizeBtn').addEventListener('click', () => {
    const min = +document.getElementById('minCh').value;
    const max = +document.getElementById('maxCh').value;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
      alert('Enter valid CH numbers.');
      return;
    }
    randomizeSchedule(min, max);
  });

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
