// js/randomizer.js — builds randomized schedules (domestic and international).
import { DAY_COUNT, COLORS, RESERVE_TEMPLATES } from './config.js';
import { randInt } from './format.js';
import { clearTrips, addTrip, setSelectedId, getPilotCount, pushHistory, getBidStartDay } from './store.js';
import { renderAll } from './render.js';
import { updateToolbar } from './toolbar.js';

// Shared constants
const CARRY_OVER_PROB = 0.4;
const CARRY_OVER_COLOR = '#64748b';
const TRAINING_DAYS = 3;
const TRAINING_HPD = 4.5;
const TRAINING_COLOR = '#b45309';
const VACATION_DAYS = 7;
const VACATION_HPD = 6;
const VACATION_COLOR = '#7e22ce';
const RESERVE_HPD = 4.75;

// Place a block of `length` days at a random free slot starting at startMin or later.
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

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Place a carry-over block and return { ch, earliest }.
//  - With a bid month set (B>1): only carry-over that CROSSES the divider —
//    starts in the prior month, bleeds into the bid month. Only the in-month
//    days earn credit. New flying then starts after it (>= B).
//  - Otherwise: legacy 1-3 day block at day 1, fully credited.
function placeCarryOver(taken, p, maxCh, B) {
  if (B && B > 1) {
    if (Math.random() >= CARRY_OVER_PROB) return { ch: 0, earliest: B };
    const preDays = randInt(1, Math.min(3, B - 1));
    let postDays = randInt(1, 3);
    while (postDays * 6 > maxCh && postDays > 1) postDays--;
    const start = B - preDays;
    const len = preDays + postDays;
    if (start + len - 1 > DAY_COUNT) return { ch: 0, earliest: B };
    addTrip({ type: 'carryover', pilot: p, day: start, days: len, hoursPerDay: 6, color: CARRY_OVER_COLOR });
    for (let d = start; d < start + len; d++) taken[d] = true;
    return { ch: postDays * 6, earliest: start + len }; // only in-month days credited
  }
  if (Math.random() >= CARRY_OVER_PROB) return { ch: 0, earliest: 1 };
  let days = randInt(1, 3);
  while (days * 6 > maxCh && days > 1) days--;
  if (days * 6 > maxCh) return { ch: 0, earliest: 1 };
  addTrip({ type: 'carryover', pilot: p, day: 1, days, hoursPerDay: 6, color: CARRY_OVER_COLOR });
  for (let d = 1; d <= days; d++) taken[d] = true;
  return { ch: days * 6, earliest: days + 1 };
}

export function randomizeSchedule(minCh, maxCh) {
  if (maxCh < minCh) [minCh, maxCh] = [maxCh, minCh];
  pushHistory(); // so a randomize can be undone
  clearTrips();
  setSelectedId(null);

  const N = getPilotCount();
  // Scale special-pilot counts proportionally to the current pilot count (baseline = 20)
  const reserveCount  = Math.max(1, Math.round(N * 0.20));
  const vacationCount = N >= 8 ? Math.max(1, Math.round(N * 0.10)) : 0;
  const trainingCount = N >= 8 ? Math.max(1, Math.round(N * 0.10)) : 0;

  // Last N pilots are reserve-only
  const reservePilots = new Set();
  for (let i = 0; i < Math.min(reserveCount, N); i++) reservePilots.add(N - i);

  const eligible = [];
  for (let p = 1; p <= N; p++) if (!reservePilots.has(p)) eligible.push(p);
  shuffle(eligible);
  const vacationPilots = new Set(eligible.slice(0, vacationCount));
  const trainingPilots = new Set(eligible.slice(vacationCount, vacationCount + trainingCount));

  const B = getBidStartDay();
  for (let p = 1; p <= N; p++) {
    const taken = new Array(DAY_COUNT + 2).fill(false);
    const co = placeCarryOver(taken, p, maxCh, B);
    let chSoFar = co.ch;
    const earliestDay = co.earliest;

    // RESERVE-only pilots: 4-8 day reserve blocks
    if (reservePilots.has(p)) {
      let loR = Math.max(0, Math.ceil((minCh - chSoFar) / RESERVE_HPD));
      const hiR = Math.floor((maxCh - chSoFar) / RESERVE_HPD);
      if (loR > 0 && loR < 4) loR = 4;
      let R;
      if (hiR >= 4 && loR <= hiR) R = randInt(Math.max(4, loR), hiR);
      else if (loR > 0) R = Math.max(4, loR);
      else R = 0;
      let remR = R;
      const blocks = [];
      while (remR >= 4) {
        let len;
        if (remR <= 8) len = remR;
        else if (remR <= 11) len = randInt(4, remR - 4);
        else len = randInt(4, 8);
        blocks.push(len);
        remR -= len;
      }
      for (const len of blocks) {
        const sub = RESERVE_TEMPLATES[randInt(0, RESERVE_TEMPLATES.length - 1)];
        const start = tryPlace(taken, len, earliestDay);
        if (start == null) continue;
        addTrip({ type: 'reserve', subType: sub.subType, pilot: p, day: start, days: len, hoursPerDay: RESERVE_HPD, color: sub.color });
      }
      continue;
    }

    if (vacationPilots.has(p) && chSoFar + VACATION_DAYS * VACATION_HPD <= maxCh) {
      const start = tryPlace(taken, VACATION_DAYS, earliestDay);
      if (start != null) {
        addTrip({ type: 'vacation', pilot: p, day: start, days: VACATION_DAYS, hoursPerDay: VACATION_HPD, color: VACATION_COLOR });
        chSoFar += VACATION_DAYS * VACATION_HPD;
      }
    }
    if (trainingPilots.has(p) && chSoFar + TRAINING_DAYS * TRAINING_HPD <= maxCh) {
      const start = tryPlace(taken, TRAINING_DAYS, earliestDay);
      if (start != null) {
        addTrip({ type: 'training', pilot: p, day: start, days: TRAINING_DAYS, hoursPerDay: TRAINING_HPD, color: TRAINING_COLOR });
        chSoFar += TRAINING_DAYS * TRAINING_HPD;
      }
    }

    // Fill the rest with 6 CH/day trips, scattered as 1-5 day segments.
    const minTripDays = Math.max(0, Math.ceil((minCh - chSoFar) / 6));
    const maxTripDays = Math.max(0, Math.floor((maxCh - chSoFar) / 6));
    const tripDays = minTripDays <= maxTripDays ? randInt(minTripDays, maxTripDays) : minTripDays;

    const segments = [];
    let remaining = tripDays;
    while (remaining > 0) {
      const len = Math.min(remaining, randInt(1, 5));
      segments.push(len);
      remaining -= len;
    }
    shuffle(segments);
    for (const seg of segments) {
      const start = tryPlace(taken, seg, earliestDay);
      if (start == null) continue;
      addTrip({ type: 'trip', pilot: p, day: start, days: seg, hoursPerDay: 6, color: COLORS[randInt(0, COLORS.length - 1)] });
    }
  }
  renderAll();
  updateToolbar();
}

// International bid pack — seniority-banded long-haul style at 6 CH/day:
//   ~70% single long trip (senior), ~10% two long trips (middle),
//   ~10% short week-on/week-off, last ~10% long reserve stretches.
export function randomizeInternational(minCh, maxCh) {
  if (maxCh < minCh) [minCh, maxCh] = [maxCh, minCh];
  pushHistory();
  clearTrips();
  setSelectedId(null);

  const N = getPilotCount();
  const reserveCount = Math.max(1, Math.round(N * 0.10));
  const shortCount   = Math.max(0, Math.round(N * 0.10));
  const twoLongCount = Math.max(0, Math.round(N * 0.10));

  // Bands assigned by seniority (pilot 1 = most senior).
  const bandFor = p => {
    if (p > N - reserveCount) return 'reserve';
    if (p > N - reserveCount - shortCount) return 'short';
    if (p > N - reserveCount - shortCount - twoLongCount) return 'two';
    return 'single';
  };

  // Vacation/training sprinkled among non-reserve pilots (like domestic).
  const vacationCount = N >= 8 ? Math.max(1, Math.round(N * 0.10)) : 0;
  const trainingCount = N >= 8 ? Math.max(1, Math.round(N * 0.10)) : 0;
  const eligible = [];
  for (let p = 1; p <= N; p++) if (bandFor(p) !== 'reserve') eligible.push(p);
  shuffle(eligible);
  const vacationPilots = new Set(eligible.slice(0, vacationCount));
  const trainingPilots = new Set(eligible.slice(vacationCount, vacationCount + trainingCount));

  const B = getBidStartDay();
  for (let p = 1; p <= N; p++) {
    const band = bandFor(p);
    const taken = new Array(DAY_COUNT + 2).fill(false);
    const co = placeCarryOver(taken, p, maxCh, B);
    let chSoFar = co.ch;
    const earliest = co.earliest;

    // Long reserve stretches (6-12 day blocks).
    if (band === 'reserve') {
      let loR = Math.max(0, Math.ceil((minCh - chSoFar) / RESERVE_HPD));
      const hiR = Math.floor((maxCh - chSoFar) / RESERVE_HPD);
      if (loR > 0 && loR < 6) loR = 6;
      let R;
      if (hiR >= 6 && loR <= hiR) R = randInt(Math.max(6, loR), hiR);
      else if (loR > 0) R = Math.max(6, loR);
      else R = 0;
      let rem = R;
      const blocks = [];
      while (rem >= 6) {
        let len;
        if (rem <= 12) len = rem;
        else if (rem <= 18) len = randInt(6, rem - 6);
        else len = randInt(6, 12);
        blocks.push(len);
        rem -= len;
      }
      for (const len of blocks) {
        const sub = RESERVE_TEMPLATES[randInt(0, RESERVE_TEMPLATES.length - 1)];
        const start = tryPlace(taken, len, earliest);
        if (start == null) continue;
        addTrip({ type: 'reserve', subType: sub.subType, pilot: p, day: start, days: len, hoursPerDay: RESERVE_HPD, color: sub.color });
      }
      continue;
    }

    // Vacation / training (same as domestic).
    if (vacationPilots.has(p) && chSoFar + VACATION_DAYS * VACATION_HPD <= maxCh) {
      const start = tryPlace(taken, VACATION_DAYS, earliest);
      if (start != null) {
        addTrip({ type: 'vacation', pilot: p, day: start, days: VACATION_DAYS, hoursPerDay: VACATION_HPD, color: VACATION_COLOR });
        chSoFar += VACATION_DAYS * VACATION_HPD;
      }
    }
    if (trainingPilots.has(p) && chSoFar + TRAINING_DAYS * TRAINING_HPD <= maxCh) {
      const start = tryPlace(taken, TRAINING_DAYS, earliest);
      if (start != null) {
        addTrip({ type: 'training', pilot: p, day: start, days: TRAINING_DAYS, hoursPerDay: TRAINING_HPD, color: TRAINING_COLOR });
        chSoFar += TRAINING_DAYS * TRAINING_HPD;
      }
    }

    // Remaining flying days at 6 CH/day, arranged per band.
    const minDays = Math.max(0, Math.ceil((minCh - chSoFar) / 6));
    const maxDays = Math.max(0, Math.floor((maxCh - chSoFar) / 6));
    let tripDays = minDays <= maxDays ? randInt(minDays, maxDays) : minDays;
    if (tripDays <= 0) continue;

    if (band === 'single') {
      placeBlocks(taken, [tripDays], earliest, p);
    } else if (band === 'two') {
      const a = Math.max(1, Math.round(tripDays / 2));
      placeBlocks(taken, [a, tripDays - a].filter(x => x > 0), earliest, p);
    } else { // short — week on / week off
      const blocks = [];
      let rem = tripDays;
      while (rem > 0) { const len = Math.min(rem, randInt(5, 7)); blocks.push(len); rem -= len; }
      placeWeekOnWeekOff(taken, blocks, earliest, p);
    }
  }
  renderAll();
  updateToolbar();
}

function placeBlocks(taken, blocks, earliest, p) {
  for (const len of blocks) {
    const start = tryPlace(taken, len, earliest);
    if (start == null) continue;
    addTrip({ type: 'trip', pilot: p, day: start, days: len, hoursPerDay: 6, color: COLORS[randInt(0, COLORS.length - 1)] });
  }
}

// Place blocks sequentially with ~a week off between them.
function placeWeekOnWeekOff(taken, blocks, earliest, p) {
  let cursor = earliest;
  for (const len of blocks) {
    if (cursor + len - 1 > DAY_COUNT) break;
    let ok = true;
    for (let d = cursor; d < cursor + len; d++) if (taken[d]) { ok = false; break; }
    let start = cursor;
    if (!ok) { start = tryPlace(taken, len, cursor); if (start == null) break; }
    else { for (let d = start; d < start + len; d++) taken[d] = true; }
    addTrip({ type: 'trip', pilot: p, day: start, days: len, hoursPerDay: 6, color: COLORS[randInt(0, COLORS.length - 1)] });
    cursor = start + len + randInt(6, 8); // ~week off
  }
}

function readRange() {
  const min = +document.getElementById('minCh').value;
  const max = +document.getElementById('maxCh').value;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
    alert('Enter valid CH numbers.');
    return null;
  }
  return [min, max];
}

export function initRandomizer() {
  document.getElementById('randomizeBtn').addEventListener('click', () => {
    const r = readRange();
    if (r) randomizeSchedule(r[0], r[1]);
  });
  const intlBtn = document.getElementById('intlRandomizeBtn');
  if (intlBtn) {
    intlBtn.addEventListener('click', () => {
      const r = readRange();
      if (r) randomizeInternational(r[0], r[1]);
    });
  }
}
