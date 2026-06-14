// js/store.js — the single source of truth for mutable state. No imports.
let trips = [];
let bankTrips = []; // configurable, unassigned trips staged in the Trip Bank
let nextId = 1;
let selectedId = null;
let pilotCount = 20;
let history = [];
const HISTORY_LIMIT = 100;

export function getTrips() { return trips; }
export function setTrips(next) { trips = next; }
export function clearTrips() { trips = []; }
export function addTrip(data) {
  const trip = { id: nextId++, ...data };
  trips.push(trip);
  return trip.id;
}
export function removeTrip(id) { trips = trips.filter(t => t.id !== id); }

// ---- Trip Bank (unassigned, user-configurable) ----
export function getBankTrips() { return bankTrips; }
export function setBankTrips(next) { bankTrips = next; }
export function addBankTrip(data) {
  const trip = { id: nextId++, ...data };
  bankTrips.push(trip);
  return trip.id;
}
export function removeBankTrip(id) { bankTrips = bankTrips.filter(t => t.id !== id); }
export function updateBankTrip(id, patch) {
  const t = bankTrips.find(t => t.id === id);
  if (t) Object.assign(t, patch);
}

// ---- Undo history ----
// Snapshot both trip collections (deep-ish copy of flat trip objects) before a mutation.
export function pushHistory() {
  history.push({
    trips: trips.map(t => ({ ...t })),
    bank: bankTrips.map(t => ({ ...t })),
  });
  if (history.length > HISTORY_LIMIT) history.shift();
}
// Restore the most recent snapshot. Returns true if something was undone.
export function undo() {
  if (history.length === 0) return false;
  const snap = history.pop();
  trips = snap.trips;
  bankTrips = snap.bank;
  selectedId = null;
  return true;
}
export function clearHistory() { history = []; }

export function getSelectedId() { return selectedId; }
export function setSelectedId(id) { selectedId = id; }

export function getPilotCount() { return pilotCount; }
export function setPilotCount(n) { pilotCount = n; }

// ---- Bid-month start (day the bid month begins) ----
let bidStartDay = null;
export function getBidStartDay() { return bidStartDay; }
export function setBidStartDay(day) { bidStartDay = day; }
