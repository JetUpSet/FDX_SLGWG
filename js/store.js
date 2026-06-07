// js/store.js — the single source of truth for mutable state. No imports.
let trips = [];
let nextId = 1;
let selectedId = null;
let pilotCount = 20;

export function getTrips() { return trips; }
export function setTrips(next) { trips = next; }
export function clearTrips() { trips = []; }
export function addTrip(data) {
  const trip = { id: nextId++, ...data };
  trips.push(trip);
  return trip.id;
}
export function removeTrip(id) { trips = trips.filter(t => t.id !== id); }

export function getSelectedId() { return selectedId; }
export function setSelectedId(id) { selectedId = id; }

export function getPilotCount() { return pilotCount; }
export function setPilotCount(n) { pilotCount = n; }
