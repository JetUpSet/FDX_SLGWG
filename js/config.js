// js/config.js — immutable configuration. No imports.
export const DAY_COUNT = 31;
export const BAR_H = 28;
export const CH_PER_DAY = 6;

export const COLORS = [
  '#4f46e5', '#0891b2', '#059669', '#ca8a04',
  '#ea580c', '#dc2626', '#db2777', '#7c3aed'
];
export const TRIP_TEMPLATES = [
  { days: 1, color: '#0891b2' },
  { days: 2, color: '#059669' },
  { days: 3, color: '#4f46e5' },
  { days: 4, color: '#7c3aed' },
  { days: 5, color: '#ea580c' },
];
export const CARRY_OVER_TEMPLATES = [
  { hoursPerDay: 6, color: '#64748b' },
];
export const TRAINING_TEMPLATES = [
  { hoursPerDay: 4.5, color: '#b45309' },
];
export const RESERVE_TEMPLATES = [
  { subType: 'RA',  label: 'RA reserve',  hoursPerDay: 4.75, color: '#0d9488' },
  { subType: 'RB',  label: 'RB reserve',  hoursPerDay: 4.75, color: '#0e7490' },
  { subType: 'R24', label: 'R24 reserve', hoursPerDay: 4.75, color: '#1e3a8a' },
];
export const VACATION_TEMPLATES = [
  { days: 7, hoursPerDay: 6, color: '#7e22ce' },
];
