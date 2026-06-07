// js/randomizer.js — builds a randomized schedule within a credit-hour range.
import { DAY_COUNT, COLORS, RESERVE_TEMPLATES } from './config.js';
import { randInt } from './format.js';
import { clearTrips, addTrip, setSelectedId, getPilotCount } from './store.js';
import { renderAll } from './render.js';
import { updateToolbar } from './toolbar.js';

export function randomizeSchedule(minCh, maxCh) {
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

  // Scale special-pilot counts proportionally to the current pilot count (baseline = 20)
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

export function initRandomizer() {
  document.getElementById('randomizeBtn').addEventListener('click', () => {
    const min = +document.getElementById('minCh').value;
    const max = +document.getElementById('maxCh').value;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
      alert('Enter valid CH numbers.');
      return;
    }
    randomizeSchedule(min, max);
  });
}
