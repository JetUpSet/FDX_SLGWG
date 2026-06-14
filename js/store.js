// js/store.js — the single source of truth for mutable state. No imports.
let trips = [];
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

// ---- Undo history ----
// Snapshot the current trips (deep-ish copy of flat trip objects) before a mutation.
export function pushHistory() {
  history.push(trips.map(t => ({ ...t })));
  if (history.length > HISTORY_LIMIT) history.shift();
}
// Restore the most recent snapshot. Returns true if something was undone.
export function undo() {
  if (history.length === 0) return false;
  trips = history.pop();
  selectedId = null;
  return true;
}
export function clearHistory() { history = []; }

export function getSelectedId() { return selectedId; }
export function setSelectedId(id) { selectedId = id; }

export function getPilotCount() { return pilotCount; }
export function setPilotCount(n) { pilotCount = n; }
