# Split VizPref into ES Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the single-file `index.html` into 11 native ES modules + an external stylesheet with zero change in runtime behavior, guarded by a Playwright smoke suite that stays green after every step.

**Architecture:** Incremental, leaf-first extraction. First lock behavior behind a Playwright baseline, then externalize all JS into one `js/main.js` module, then peel off one module at a time (config → format → store → grid → render → toolbar → interactions → palette → randomizer → feasibility), re-running the smoke suite and committing after each. Two render/interaction couplings are resolved by dependency injection from `main.js` so the import graph stays acyclic.

**Tech Stack:** Vanilla ES modules (no bundler), served over HTTP for local dev (`python3 -m http.server`). Tests: `@playwright/test` (dev-only).

---

## Conventions used in this plan

- **Line numbers** (e.g. `424-453`) refer to the **original** `index.html` as it exists at the start of this plan. Once a task moves a block, later line numbers still cite the original file for traceability — find the code by its content, not by re-counting.
- **"Move verbatim"** means cut the cited lines unchanged into the new file. The *only* things shown as full code are (a) genuinely new/changed code — module wrappers, `export`/`import` lines, store mutators, injection wiring — and (b) the test suite. Re-pasting hundreds of unchanged lines would invite transcription errors; moving them verbatim by range is the instruction.
- **Every extraction task ends the same way:** run `npm test`, expect all smoke tests **PASS**, then commit. The suite is the safety net — it must never go red. If it does, the fix belongs to the task that broke it, before moving on.
- **App stays dependency-free at runtime.** `package.json` and `node_modules` are dev-only (tests). Shipped artifacts are `index.html`, `styles.css`, `js/*.js`.

## File structure (end state)

```
FDX_SLGWG/
  index.html              # markup + <link styles.css> + <script type="module" src="js/main.js">
  styles.css              # the former <style> block, verbatim
  js/
    config.js             # constants: DAY_COUNT, BAR_H, CH_PER_DAY, COLORS, *_TEMPLATES
    format.js             # parseHpd, fmtCH, randInt
    store.js              # mutable state (trips, selectedId, pilotCount, id counter) + mutators
    grid.js               # buildGrid, getCellPos, pointToCell, getTripLayer; injected onSenClick
    render.js             # renderAll, renderTrip, renderPool, updateCreditHours; injected bar handlers
    toolbar.js            # swatches, delete btn, hpd input, updateToolbar
    interactions.js       # drop, startMove, startResize, selectTrip, deleteSelected, keyboard
    palette.js            # palette DOM + drag payloads + clear-all
    randomizer.js         # randomizeSchedule + button wiring
    feasibility.js        # feasibility mode (shading, banner, send-to-pool)
    main.js               # entry: import all, init order, wire the two injection seams
  tests/
    smoke.spec.js         # Playwright characterization suite
  playwright.config.js    # launches the static server, points at it
  package.json            # dev-only: @playwright/test
  .gitignore              # node_modules, test-results
  docs/superpowers/...    # spec + this plan
```

---

## Task 1: Test harness setup

**Files:**
- Create: `package.json`
- Create: `playwright.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 2: Create `package.json`** (dev-only; the app itself ships nothing from here)

```json
{
  "name": "vizpref-tests",
  "version": "0.0.0",
  "private": true,
  "description": "Dev-only test harness for VizPref. The app itself has zero runtime dependencies.",
  "scripts": {
    "test": "playwright test",
    "serve": "python3 -m http.server 8137"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0"
  }
}
```

- [ ] **Step 3: Create `playwright.config.js`** — it boots the static server itself so `npm test` is one command

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:8137',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 8137',
    url: 'http://localhost:8137',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
```

- [ ] **Step 4: Install Playwright + the Chromium browser**

Run: `npm install && npx playwright install chromium`
Expected: installs `@playwright/test` under `node_modules/` and downloads the Chromium build. No errors.

> NOTE: A `python3 -m http.server` may already be running on 8137 from earlier exploration. `reuseExistingServer: true` handles that — Playwright reuses it instead of failing on a port clash.

- [ ] **Step 5: Commit**

```bash
git add package.json playwright.config.js .gitignore
git commit -m "test: add Playwright harness (dev-only) for behavior-identical refactor"
```

---

## Task 2: Write the smoke suite and capture the green baseline

This is the characterization test. It is written against the **current single-file `index.html`** and must pass before any refactoring begins. Selectors below are taken from the current markup.

**Files:**
- Create: `tests/smoke.spec.js`

- [ ] **Step 1: Write `tests/smoke.spec.js`**

```js
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// 1 + module-load safety: the single most valuable check for an ESM refactor.
test('loads with no console errors and builds the grid', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.reload();
  await expect(page.locator('table.grid-table')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await expect(page.locator('tbody tr').first().locator('td.day-cell')).toHaveCount(31);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('palette renders all eleven template items', async ({ page }) => {
  await expect(page.locator('.palette-item')).toHaveCount(11); // 5 trip + 1 carry + 1 train + 3 reserve + 1 vacation
});

// 7: randomizer wiring (store.addTrip + render). Asserts invariants, not exact output (Math.random).
test('randomizer creates bars and non-zero credit hours', async ({ page }) => {
  await page.fill('#minCh', '68');
  await page.fill('#maxCh', '78');
  await page.click('#randomizeBtn');
  await expect(page.locator('.trip-layer .trip').first()).toBeVisible();
  expect(await page.locator('.trip-layer .trip').count()).toBeGreaterThan(10);
  const texts = await page.locator('.ch-badge').allInnerTexts();
  const nonZero = texts.filter(t => t.trim() !== '0:00').length;
  expect(nonZero).toBeGreaterThanOrEqual(15);
});

// 4 + 5: selection + recolor + delete via toolbar/keyboard.
test('select a bar, recolor it, then delete it', async ({ page }) => {
  await page.click('#randomizeBtn');
  const before = await page.locator('.trip-layer .trip').count();
  await page.locator('.trip-layer .trip').first().click();
  await expect(page.locator('#toolbar')).toBeVisible();
  await page.locator('.swatch').nth(3).click();           // recolor (toolbar clicks don't deselect)
  await page.keyboard.press('Delete');                    // delete selected
  await expect(page.locator('.trip-layer .trip')).toHaveCount(before - 1);
});

// 6: reserve hours/day edit.
test('reserve bar hours/day edit keeps a valid CH label', async ({ page }) => {
  await page.click('#randomizeBtn');
  const reserveBar = page.locator('.trip-layer .trip.reserve').first();
  await expect(reserveBar).toBeVisible();                 // randomizer makes reserve-only pilots
  await reserveBar.click();
  await expect(page.locator('#hpdGroup')).toBeVisible();
  await page.fill('#hpdInput', '5:00');
  await page.locator('#hpdInput').press('Enter');
  await expect(page.locator('.trip-layer .trip.reserve').first()).toContainText(/\d+:\d{2}/);
});

// 2 (move): raw-mouse drag. Coordinates may need tuning on baseline; tune until green, then it's locked.
test('dragging a bar repositions it', async ({ page }) => {
  await page.click('#randomizeBtn');
  const bar = page.locator('.trip-layer .trip').first();
  const box = await bar.boundingBox();
  const before = await bar.getAttribute('style');
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + 76, box.y + box.height / 2 + 36, { steps: 6 });
  await page.mouse.up();
  const after = await page.locator('.trip-layer .trip').first().getAttribute('style');
  expect(after).not.toEqual(before);
});

test('clicking a seniority cell highlights the row', async ({ page }) => {
  const row = page.locator('tbody tr').nth(2);
  await row.locator('.sen-cell').click();
  await expect(row).toHaveClass(/row-highlighted/);
});

// 8: feasibility shading + send-to-pool (exercises the grid->feasibility injection seam).
test('feasibility shades rows and sends affected trips to the pool', async ({ page }) => {
  await page.click('#randomizeBtn');
  await page.click('#feasibilityBtn');
  await expect(page.locator('#feasibilityBanner')).toBeVisible();
  await page.locator('tbody tr').nth(4).locator('.sen-cell').click();          // bidding pilot #05
  await expect(page.locator('tbody tr').nth(6)).toHaveClass(/feasibility-below/);
  await page.locator('tbody tr').nth(1).locator('.sen-cell').click();          // upper bound #02
  await page.click('#sendToPoolBtn');
  await expect(page.locator('#tripPool')).toBeVisible();
  await expect(page.locator('#poolBars .pool-bar').first()).toBeVisible();
});

// 9: pilot count rebuild.
test('changing pilot count rebuilds the grid', async ({ page }) => {
  await page.fill('#pilotCount', '8');
  await page.locator('#pilotCount').blur();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

// 10: clear all.
test('clear all empties the grid and resets CH badges', async ({ page }) => {
  await page.click('#randomizeBtn');
  page.on('dialog', d => d.accept());                     // the clear-all confirm()
  await page.locator('.clear-btn').click();
  await expect(page.locator('.trip-layer .trip')).toHaveCount(0);
  const texts = await page.locator('.ch-badge').allInnerTexts();
  expect(texts.every(t => t.trim() === '0:00')).toBe(true);
});
```

- [ ] **Step 2: Run the suite against the current (unmodified) `index.html`**

Run: `npm test`
Expected: **all tests PASS.** This is the green baseline. If the `dragging a bar repositions it` test fails on the unmodified app, tune the mouse offsets (cell width ≈ 38px, row height ≈ 36px) until it passes on the *current* code — never weaken an assertion to pass.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.spec.js
git commit -m "test: characterization smoke suite, green on pre-split baseline"
```

> SCOPE NOTE (no silent caps): native HTML5 drag-and-drop from the palette (`dragstart`/`drop` with `dataTransfer`) and the resize-handle drag are **not** automated here — reliably driving native DnD in Playwright is disproportionate effort for code that moves verbatim. They are covered by the manual checklist in Task 16. Everything else (module loading, grid, palette, randomizer, selection, recolor, delete, hpd, bar move, sen-click, feasibility, pilot-count, clear-all) is automated above.

---

## Task 3: Externalize all JavaScript into `js/main.js`

Flip from inline `<script>` to a single ES module. No code logic changes — this proves the module/server path works before any decomposition.

**Files:**
- Create: `js/main.js`
- Modify: `index.html` (the `<script>` block, lines 422-1388)

- [ ] **Step 1: Create `js/main.js`** — move the entire body of the current inline `<script>` (everything between `<script>` at line 422 and `</script>` at line 1388, i.e. lines 423-1388) **verbatim** into `js/main.js`. No `import`/`export` yet; it is the same code, just in a file.

- [ ] **Step 2: Replace the inline script in `index.html`** — delete lines 422-1388 (`<script> … </script>`) and put in their place:

```html
<script type="module" src="js/main.js"></script>
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS (now executing as a module served over HTTP). If `loads with no console errors` fails, read the console error — a `file://`-style load or a missing path is the usual cause.

- [ ] **Step 4: Commit**

```bash
git add index.html js/main.js
git commit -m "refactor: move inline JS into js/main.js as an ES module"
```

---

## Task 4: Externalize CSS into `styles.css`

**Files:**
- Create: `styles.css`
- Modify: `index.html` (the `<style>` block, lines 6-372)

- [ ] **Step 1: Create `styles.css`** — move the contents of the `<style>` block (lines 7-371, i.e. everything between `<style>` and `</style>`) **verbatim** into `styles.css`.

- [ ] **Step 2: Replace the `<style>` block in `index.html`** with, in the `<head>`:

```html
<link rel="stylesheet" href="styles.css">
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS. (Visual rules are unchanged; structural/interaction tests confirm nothing regressed.)

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "refactor: move inline CSS into styles.css"
```

---

## Task 5: Extract `config.js`

**Files:**
- Create: `js/config.js`
- Modify: `js/main.js` (constants at lines 426-453; note `PILOT_COUNT` at 424 is **state**, not a constant — it stays in `main.js` for now and moves to the store in Task 7)

- [ ] **Step 1: Create `js/config.js`** — move `DAY_COUNT`, `BAR_H`, `CH_PER_DAY` (426-427) and `COLORS`, `TRIP_TEMPLATES`, `CARRY_OVER_TEMPLATES`, `TRAINING_TEMPLATES`, `RESERVE_TEMPLATES`, `VACATION_TEMPLATES` (429-453) here, each prefixed with `export const`:

```js
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
```

- [ ] **Step 2: In `js/main.js`**, delete those same constant declarations and add at the very top:

```js
import {
  DAY_COUNT, BAR_H, CH_PER_DAY, COLORS,
  TRIP_TEMPLATES, CARRY_OVER_TEMPLATES, TRAINING_TEMPLATES,
  RESERVE_TEMPLATES, VACATION_TEMPLATES,
} from './config.js';
```

Leave `let PILOT_COUNT = 20;` (line 424) in `main.js` for now.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add js/config.js js/main.js
git commit -m "refactor: extract config.js (constants)"
```

---

## Task 6: Extract `format.js`

**Files:**
- Create: `js/format.js`
- Modify: `js/main.js` (`parseHpd` 456-469, `fmtCH` 472-477, `randInt` 1007)

- [ ] **Step 1: Create `js/format.js`** — move the three pure helpers verbatim, each prefixed with `export`:

```js
// js/format.js — pure formatting/number helpers. No imports.

// Parse "H:MM" or decimal hours; returns Number or null
export function parseHpd(text) {
  if (text == null) return null;
  text = String(text).trim();
  if (!text) return null;
  if (text.includes(':')) {
    const parts = text.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || m < 0 || m >= 60) return null;
    return h + m / 60;
  }
  const n = parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Format hours (e.g., 4.5) as "H:MM"
export function fmtCH(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h + ':' + m.toString().padStart(2, '0');
}

export function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
```

- [ ] **Step 2: In `js/main.js`**, delete `parseHpd`, `fmtCH`, and the `randInt` declaration (line 1007), and add to the import block:

```js
import { parseHpd, fmtCH, randInt } from './format.js';
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add js/format.js js/main.js
git commit -m "refactor: extract format.js (parseHpd, fmtCH, randInt)"
```

---

## Task 7: Extract `store.js` (state foundation)

The behavior-neutral state refactor. `store.js` becomes the single owner of mutable state; every reassignment routes through a mutator. This is the most call-site-heavy task — work through the substitution table exactly.

**Files:**
- Create: `js/store.js`
- Modify: `js/main.js` (state decls 424, 480-482; every read/write of `trips`, `nextId`, `selectedId`, `PILOT_COUNT`)

- [ ] **Step 1: Create `js/store.js`**

```js
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
```

- [ ] **Step 2: In `js/main.js`**, delete the state declarations `let PILOT_COUNT = 20;` (424), `let trips = [];` (480), `let nextId = 1;` (481), `let selectedId = null;` (482), and add to the import block:

```js
import {
  getTrips, setTrips, clearTrips, addTrip, removeTrip,
  getSelectedId, setSelectedId, getPilotCount, setPilotCount,
} from './store.js';
```

- [ ] **Step 3: Apply every substitution below in `js/main.js`.** Each original is replaced by its mutator/accessor form. (Line numbers cite the original file.)

| Original (by content / line) | Replace with |
|---|---|
| `trips.push({ id: nextId++, … })` in `drop` (828-836) then `selectTrip(trips[trips.length-1].id)` (837) | `const id = addTrip({ … /* same fields minus `id: nextId++` */ }); selectTrip(id);` |
| `trips.push({ id: nextId++, type: 'carryover', … })` (1077-1081) | `addTrip({ type: 'carryover', … });` (drop the `id` field) |
| `trips.push({ id: nextId++, type: 'reserve', … })` (1121-1125) | `addTrip({ type: 'reserve', … });` |
| `trips.push({ id: nextId++, type: 'vacation', … })` (1135-1139) | `addTrip({ type: 'vacation', … });` |
| `trips.push({ id: nextId++, type: 'training', … })` (1148-1152) | `addTrip({ type: 'training', … });` |
| `trips.push({ id: nextId++, type: 'trip', … })` (1183-1188) | `addTrip({ type: 'trip', … });` |
| `trips = trips.filter(t => t.id !== selectedId);` in `deleteSelected` (947) | `removeTrip(getSelectedId());` |
| `trips = [];` in `clearBtn` handler (613) and `randomizeSchedule` (1011) | `clearTrips();` |
| `trips = trips.filter(t => t.pilot <= PILOT_COUNT);` in `applyPilotCount` (1375) | `setTrips(getTrips().filter(t => t.pilot <= getPilotCount()));` |
| Every **read** `trips.forEach/filter/find/length` (e.g. 611, 755, 765, 781-784, 799, 842, 876, 912, 928, 1281) | `getTrips().forEach/filter/find/length` |
| `selectedId = id;` in `selectTrip` (954) | `setSelectedId(id);` |
| `selectedId = null;` (615, 948, 987, 1001, 1012, 1298, 1376) | `setSelectedId(null);` |
| Every **read** of `selectedId` (911, 927, 946, 960, 964, 993, 1222-1239 not applicable, etc.) | `getSelectedId()` |
| `PILOT_COUNT` **reads** (647, 791, 859, 1023-1037, 1371-1375, etc.) | `getPilotCount()` |
| `PILOT_COUNT = n;` in `applyPilotCount` (1372) | `setPilotCount(n);` |

> IMPORTANT: readers must call `getTrips()` at point of use, never cache the array in a long-lived local — `setTrips`/`removeTrip` replace the array reference. Inside a single synchronous function that does not mutate, one local `const ts = getTrips();` is fine.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all tests PASS. The `select → recolor → delete`, `clear all`, `randomizer`, and `pilot count` tests specifically exercise the rewritten mutators.

- [ ] **Step 5: Commit**

```bash
git add js/store.js js/main.js
git commit -m "refactor: extract store.js and route all state mutations through it"
```

---

## Task 8: Extract `grid.js` (with injected seniority-click)

**Files:**
- Create: `js/grid.js`
- Modify: `js/main.js` (`buildGrid` 625-676, `getCellPos` 681-692, `pointToCell` 694-704, the `let tripLayer;` decl 623, the `buildGrid()` call 678)

- [ ] **Step 1: Create `js/grid.js`** — move `buildGrid`, `getCellPos`, `pointToCell` verbatim, with these changes: own `gridEl` and `tripLayer` locally, add the injection hook, and export. The seniority-cell click (655-658) is rewired to call an injected `onSenClick`:

```js
// js/grid.js
import { DAY_COUNT } from './config.js';
import { getPilotCount } from './store.js';

const gridEl = document.getElementById('grid');
let tripLayer = null;
let onSenClick = () => false; // injected by main.js; returns true if it consumed the click

export function setGridHandlers(h) {
  if (h.onSenClick) onSenClick = h.onSenClick;
}
export function getTripLayer() { return tripLayer; }

export function buildGrid() {
  // … verbatim body of the original buildGrid (626-676), with two edits:
  //  (a) use getPilotCount() wherever the original used PILOT_COUNT (done in Task 7),
  //  (b) the seniority cell click handler becomes:
  //        sen.addEventListener('click', () => {
  //          if (onSenClick(p)) return;
  //          tr.classList.toggle('row-highlighted');
  //        });
  //  (c) the final `tripLayer = document.createElement('div')` assigns the module-level tripLayer.
}

export function getCellPos(pilot, day) {
  // … verbatim body (682-692) — already references gridEl …
}

export function pointToCell(clientX, clientY) {
  // … verbatim body (695-704) …
}
```

- [ ] **Step 2: In `js/main.js`**, delete `buildGrid`, `getCellPos`, `pointToCell`, the `const gridEl = …`/`let tripLayer;` lines (622-623), and replace every `tripLayer` reference with `getTripLayer()`. Add to imports:

```js
import { buildGrid, getCellPos, pointToCell, getTripLayer, setGridHandlers } from './grid.js';
```

Where `main.js` still defines `handleFeasibilitySenClick` (it does until Task 14), wire the seam right before the initial `buildGrid()` call:

```js
setGridHandlers({ onSenClick: handleFeasibilitySenClick });
buildGrid();
```

> The original sen-click did `if (handleFeasibilitySenClick(p)) return; tr.classList.toggle('row-highlighted');`. `handleFeasibilitySenClick` already returns `false` when feasibility mode is off (line 1337), so the injected form preserves behavior exactly: row-highlight toggles when feasibility is off, and is suppressed when feasibility consumes the click.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS — the `sen-cell highlights the row` and `feasibility` tests cover this seam.

- [ ] **Step 4: Commit**

```bash
git add js/grid.js js/main.js
git commit -m "refactor: extract grid.js with injected seniority-click handler"
```

---

## Task 9: Extract `render.js` (with injected bar handlers)

**Files:**
- Create: `js/render.js`
- Modify: `js/main.js` (`renderTrip` 707-751, `renderAll` 753-758, `renderPool` 760-787, `updateCreditHours` 789-809)

- [ ] **Step 1: Create `js/render.js`** — move the four functions verbatim, with the bar-handler wiring (736-748) rerouted through injected handlers so `render` never imports `interactions`:

```js
// js/render.js
import { BAR_H } from './config.js';
import { fmtCH } from './format.js';
import { getTrips, getSelectedId, getPilotCount } from './store.js';
import { getCellPos, getTripLayer } from './grid.js';

let handlers = { onSelect() {}, onMove() {}, onResize() {} };
export function setRenderHandlers(h) { handlers = { ...handlers, ...h }; }

export function renderTrip(t) {
  // … verbatim body (708-735), then the two listeners become:
  //   el.addEventListener('mousedown', e => {
  //     if (e.target === handle) return;
  //     e.preventDefault();
  //     handlers.onSelect(t.id);
  //     handlers.onMove(t.id, e);
  //   });
  //   handle.addEventListener('mousedown', e => {
  //     e.preventDefault(); e.stopPropagation();
  //     handlers.onSelect(t.id);
  //     handlers.onResize(t.id, e);
  //   });
  //   getTripLayer().appendChild(el);
}

export function renderAll() {
  const layer = getTripLayer();
  if (layer) layer.innerHTML = '';
  getTrips().filter(t => !t.inPool).forEach(renderTrip);
  updateCreditHours();
  renderPool();
}

export function renderPool() {
  // … verbatim body (761-787) — already uses getTrips() after Task 7 …
}

export function updateCreditHours() {
  // … verbatim body (790-809) — uses getPilotCount(), getTrips() after Task 7 …
}
```

- [ ] **Step 2: In `js/main.js`**, delete those four functions and add to imports:

```js
import { renderAll, renderTrip, renderPool, updateCreditHours, setRenderHandlers } from './render.js';
```

`selectTrip`, `startMove`, `startResize` are still defined in `main.js` at this point (they move in Task 11). Wire the seam once, near init, before the first render:

```js
setRenderHandlers({ onSelect: selectTrip, onMove: startMove, onResize: startResize });
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS — `select/recolor/delete` and `dragging a bar` cover the injected handlers.

- [ ] **Step 4: Commit**

```bash
git add js/render.js js/main.js
git commit -m "refactor: extract render.js with injected bar interaction handlers"
```

---

## Task 10: Extract `toolbar.js`

**Files:**
- Create: `js/toolbar.js`
- Modify: `js/main.js` (swatch build 903-916, delete-btn wiring 918-919, hpd input 922-943, `updateToolbar` 959-980)

- [ ] **Step 1: Create `js/toolbar.js`** — move the swatch construction, delete-button wiring, hpd input handlers (`commitHpd`), and `updateToolbar` verbatim. Export `updateToolbar`. It depends on `deleteSelected` and `selectTrip`-adjacent state; since `deleteSelected` lands in `interactions.js` (Task 11), accept it via a small init:

```js
// js/toolbar.js
import { COLORS } from './config.js';
import { fmtCH, parseHpd } from './format.js';
import { getTrips, getSelectedId } from './store.js';
import { renderAll } from './render.js';

const toolbar = document.getElementById('toolbar');
const swatchesEl = document.getElementById('swatches');
const hpdGroup = document.getElementById('hpdGroup');
const hpdInput = document.getElementById('hpdInput');

let onDelete = () => {};
export function setToolbarHandlers(h) { if (h.onDelete) onDelete = h.onDelete; }

export function initToolbar() {
  COLORS.forEach(c => { /* … verbatim swatch build (904-916) … */ });
  document.getElementById('deleteBtn').addEventListener('mousedown', e => e.stopPropagation());
  document.getElementById('deleteBtn').addEventListener('click', () => onDelete());
  hpdInput.addEventListener('mousedown', e => e.stopPropagation());
  hpdInput.addEventListener('blur', commitHpd);
  hpdInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hpdInput.blur(); } });
}

function commitHpd() { /* … verbatim body (926-939), using getSelectedId()/getTrips() … */ }

export function updateToolbar() { /* … verbatim body (960-980), using getSelectedId()/getTrips() … */ }
```

- [ ] **Step 2: In `js/main.js`**, delete the moved code. Add imports and call `initToolbar()` during init; wire `onDelete` to the still-in-main `deleteSelected`:

```js
import { initToolbar, updateToolbar, setToolbarHandlers } from './toolbar.js';
// during init:
initToolbar();
setToolbarHandlers({ onDelete: deleteSelected });
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS — `recolor`, `delete`, and `reserve hpd` cover this module.

- [ ] **Step 4: Commit**

```bash
git add js/toolbar.js js/main.js
git commit -m "refactor: extract toolbar.js"
```

---

## Task 11: Extract `interactions.js`

**Files:**
- Create: `js/interactions.js`
- Modify: `js/main.js` (drop handlers 812-838, `startMove` 841-872, `startResize` 875-899, `deleteSelected` 945-951, `selectTrip` 953-957, click-outside 983-990, keyboard 992-1004)

- [ ] **Step 1: Create `js/interactions.js`** — move drop/move/resize/select/delete/keyboard verbatim. Export `selectTrip`, `startMove`, `startResize`, `deleteSelected`, and an `initInteractions()` that attaches the grid drop + document listeners:

```js
// js/interactions.js
import { DAY_COUNT } from './config.js';
import { getTrips, getSelectedId, setSelectedId, removeTrip, addTrip, getPilotCount } from './store.js';
import { renderAll } from './render.js';
import { getCellPos, pointToCell } from './grid.js';
import { updateToolbar } from './toolbar.js';

const gridEl = document.getElementById('grid');

export function selectTrip(id) { setSelectedId(id); renderAll(); updateToolbar(); }
export function deleteSelected() { /* … verbatim (946-951) → removeTrip(getSelectedId()); setSelectedId(null); … */ }
export function startMove(id, ev) { /* … verbatim (842-872), getTrips()/getPilotCount() … */ }
export function startResize(id, ev) { /* … verbatim (876-899) … */ }

export function initInteractions() {
  // gridEl dragover/drop (812-838) — drop uses addTrip(...) + selectTrip(id) from Task 7
  // document mousedown click-outside (983-990) → setSelectedId(null); renderAll(); updateToolbar();
  // document keydown Delete/Escape (992-1004)
}
```

- [ ] **Step 2: In `js/main.js`**, delete the moved code. Import and wire — the render/toolbar seams now point at the real module functions:

```js
import { selectTrip, startMove, startResize, deleteSelected, initInteractions } from './interactions.js';
// init:
initInteractions();
setRenderHandlers({ onSelect: selectTrip, onMove: startMove, onResize: startResize });
setToolbarHandlers({ onDelete: deleteSelected });
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add js/interactions.js js/main.js
git commit -m "refactor: extract interactions.js (drop, move, resize, select, keyboard)"
```

---

## Task 12: Extract `palette.js`

**Files:**
- Create: `js/palette.js`
- Modify: `js/main.js` (palette build 485-619)

- [ ] **Step 1: Create `js/palette.js`** — move the entire palette construction (header, the five template loops, hint, clear-all button) verbatim into an exported `initPalette()`:

```js
// js/palette.js
import { CH_PER_DAY, TRIP_TEMPLATES, CARRY_OVER_TEMPLATES, TRAINING_TEMPLATES, RESERVE_TEMPLATES, VACATION_TEMPLATES } from './config.js';
import { fmtCH } from './format.js';
import { getTrips, clearTrips, setSelectedId } from './store.js';
import { renderAll } from './render.js';
import { updateToolbar } from './toolbar.js';

export function initPalette() {
  const paletteEl = document.getElementById('palette');
  // … verbatim body (486-619) …
  // clear-all handler uses: if (getTrips().length === 0) return; … clearTrips(); setSelectedId(null); renderAll(); updateToolbar();
}
```

- [ ] **Step 2: In `js/main.js`**, delete the palette code and call `initPalette()` during init. Add `import { initPalette } from './palette.js';`.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS — `palette renders all eleven template items` covers this.

- [ ] **Step 4: Commit**

```bash
git add js/palette.js js/main.js
git commit -m "refactor: extract palette.js"
```

---

## Task 13: Extract `randomizer.js`

**Files:**
- Create: `js/randomizer.js`
- Modify: `js/main.js` (`randomizeSchedule` 1009-1193, button wiring 1195-1203)

- [ ] **Step 1: Create `js/randomizer.js`** — move `randomizeSchedule` and `tryPlace` (its inner helper) and the button wiring verbatim:

```js
// js/randomizer.js
import { DAY_COUNT, COLORS, RESERVE_TEMPLATES } from './config.js';
import { randInt } from './format.js';
import { clearTrips, addTrip, setSelectedId, getPilotCount } from './store.js';
import { renderAll } from './render.js';
import { updateToolbar } from './toolbar.js';

export function randomizeSchedule(minCh, maxCh) {
  // … verbatim body (1010-1192): clearTrips() instead of `trips = []`,
  //    addTrip({...}) for each push, getPilotCount() for PILOT_COUNT, setSelectedId(null) …
}

export function initRandomizer() {
  document.getElementById('randomizeBtn').addEventListener('click', () => {
    // … verbatim (1196-1202) …
  });
}
```

- [ ] **Step 2: In `js/main.js`**, delete the moved code, add `import { initRandomizer } from './randomizer.js';`, and call `initRandomizer()` during init.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS — `randomizer creates bars…` covers this.

- [ ] **Step 4: Commit**

```bash
git add js/randomizer.js js/main.js
git commit -m "refactor: extract randomizer.js"
```

---

## Task 14: Extract `feasibility.js` (closes the grid seam)

**Files:**
- Create: `js/feasibility.js`
- Modify: `js/main.js` (feasibility block 1207-1363)

- [ ] **Step 1: Create `js/feasibility.js`** — move all feasibility state and functions (`clearFeasibilityShading`, `applyFeasibilityShading`, `updateFeasibilityBanner`, `sendAffectedToPool`, `exitFeasibility`, the button + keydown listeners, `handleFeasibilitySenClick`) verbatim:

```js
// js/feasibility.js
import { getTrips, setSelectedId } from './store.js';
import { renderAll } from './render.js';
import { updateToolbar } from './toolbar.js';

const gridEl = document.getElementById('grid');
const feasibilityBtn = document.getElementById('feasibilityBtn');
const feasibilityBanner = document.getElementById('feasibilityBanner');
let feasibilityMode = 'off';
let feasibilityFirst = null;
let feasibilitySecond = null;

// … all feasibility functions verbatim (1213-1363).
// sendAffectedToPool: the `t.inPool = true` mutation stays (it mutates trip objects in place,
//   not the array reference, so no setTrips needed); setSelectedId(null) replaces selectedId = null.

// exitFeasibility (1307-1314) moves verbatim but is EXPORTED — main.js calls it on grid rebuild.
export function exitFeasibility() { /* … verbatim body (1308-1314) … */ }

export function initFeasibility() {
  feasibilityBtn.addEventListener('click', () => { /* … (1316-1327) … */ });
  document.addEventListener('keydown', e => { /* Escape exit (1329-1333) */ });
}
export function handleFeasibilitySenClick(pilot) { /* … verbatim (1336-1363) … */ }
```

- [ ] **Step 2: In `js/main.js`**, delete the moved code. Import and wire the grid seam to the real handler:

```js
import { initFeasibility, handleFeasibilitySenClick, exitFeasibility } from './feasibility.js';
// init (before buildGrid):
setGridHandlers({ onSenClick: handleFeasibilitySenClick });
initFeasibility();
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all tests PASS — `feasibility shades rows and sends affected trips to the pool` covers the full seam end-to-end.

- [ ] **Step 4: Commit**

```bash
git add js/feasibility.js js/main.js
git commit -m "refactor: extract feasibility.js and close the grid injection seam"
```

---

## Task 15: Finalize `main.js` as the entry/wiring module

After Tasks 5-14, `main.js` should contain only imports, the `applyPilotCount` handler + pilot-count input wiring (1366-1384), the `window.resize` listener (1387), and the init sequence. Clean it up and lock the init order.

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Rewrite `js/main.js`** to this shape (import lists already added in prior tasks; confirm the body is only wiring + init):

```js
import { buildGrid, setGridHandlers } from './grid.js';
import { renderAll, setRenderHandlers } from './render.js';
import { initToolbar, updateToolbar, setToolbarHandlers } from './toolbar.js';
import { selectTrip, startMove, startResize, deleteSelected, initInteractions } from './interactions.js';
import { initPalette } from './palette.js';
import { initRandomizer } from './randomizer.js';
import { initFeasibility, handleFeasibilitySenClick, exitFeasibility } from './feasibility.js';
import { getTrips, setTrips, setSelectedId, setPilotCount, getPilotCount } from './store.js';

// --- pilot count input (verbatim applyPilotCount 1367-1383, using store mutators) ---
const pilotCountInput = document.getElementById('pilotCount');
function applyPilotCount() {
  let n = parseInt(pilotCountInput.value, 10);
  if (!Number.isFinite(n) || n < 1) n = 1;
  if (n > 50) n = 50;
  if (n === getPilotCount()) return;
  setPilotCount(n);
  pilotCountInput.value = n;
  setTrips(getTrips().filter(t => t.pilot <= getPilotCount()));
  setSelectedId(null);
  exitFeasibility();            // original reset feasibility on grid rebuild (1378); safe no-op when off
  buildGrid();
  renderAll();
  updateToolbar();
}
pilotCountInput.addEventListener('change', applyPilotCount);
pilotCountInput.addEventListener('blur', applyPilotCount);
window.addEventListener('resize', renderAll);

// --- init order ---
initPalette();
initToolbar();
initInteractions();
initRandomizer();
initFeasibility();
setRenderHandlers({ onSelect: selectTrip, onMove: startMove, onResize: startResize });
setToolbarHandlers({ onDelete: deleteSelected });
setGridHandlers({ onSenClick: handleFeasibilitySenClick });
buildGrid();
renderAll();
```

> NOTE: `exitFeasibility` is exported from `feasibility.js` (Task 14). Calling it unconditionally here matches the original's `if (feasibilityMode !== 'off') exitFeasibility()` (1378), since `exitFeasibility` is a no-op when feasibility is already off.

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all tests PASS. Confirm zero console errors (module graph fully wired).

- [ ] **Step 3: Verify the file tree matches the spec**

Run: `ls js && wc -l js/*.js index.html styles.css`
Expected: the 11 modules exist; `index.html` is now small (markup only); no single module dominates.

- [ ] **Step 4: Commit**

```bash
git add js/main.js js/feasibility.js
git commit -m "refactor: finalize main.js as entry/wiring; lock init order"
```

---

## Task 16: Manual DnD verification + README note

The two behaviors not automated (native palette drag-drop, resize-handle drag) get a manual pass; the README gets the new dev-loop note.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Manual checklist** — with `npm run serve` running, open `http://localhost:8137/` and confirm:
  - Drag each palette item (1–5 day trip, carry-over, training, RA/RB/R24 reserve, vacation) onto a grid row → a correctly-labelled bar appears on the dropped pilot/day.
  - Drag a bar's right-edge handle → its day-span grows/shrinks and clamps at the month edge.
  - These match the pre-split behavior exactly.

- [ ] **Step 2: Update `README.md` Prerequisites** — replace "Your local browser." with the dev-loop note:

```markdown
## Prerequisites

The app itself is static and dependency-free — just `index.html`, `styles.css`, and `js/`.

**Running it:** because it now uses native ES modules, it must be served over HTTP (opening
`index.html` via `file://` will not load the modules). Any static server works:

- VS Code Live Server (right-click `index.html` → "Open with Live Server"), or
- `python3 -m http.server 8137` then open `http://localhost:8137/`.

**Tests (dev only):** `npm install && npx playwright install chromium`, then `npm test`.
```

- [ ] **Step 3: Run the suite once more**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: note ES-module dev loop (local server) and tests in README"
```

---

## Definition of done

- All 10 smoke tests pass (`npm test`), zero console errors.
- `index.html` contains only markup + the stylesheet link + `<script type="module" src="js/main.js">`.
- `js/` holds the 11 modules from the spec; the import graph is acyclic (the two seams are injected from `main.js`).
- Manual DnD checklist (Task 16) passes.
- Every task committed separately on `split-into-es-modules`; the suite was green at each commit.
- No behavior changes, no new features (notes/drawing/persistence remain out of scope).
