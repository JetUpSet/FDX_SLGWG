# Splitting VizPref into ES Modules — Design

- **Date:** 2026-06-05
- **Status:** Approved (pending spec review)
- **Repo:** JetUpSet/FDX_SLGWG
- **Branch:** split-into-es-modules

## Goal

Refactor the single-file `index.html` (~1390 lines of inline CSS + JS) into a set of
native ES modules plus an external stylesheet, with **no change in runtime behavior**.

This establishes clean module boundaries ahead of upcoming features (sticky notes —
issue #3 — and freehand drawing) so the code can grow without one giant file and
without merge-conflict pain across collaborators.

## Context

- VizPref is a static, dependency-free, single-page drag-and-drop visualizer of a PBS
  (Preferential Bidding System) crew schedule: pilots (rows, by seniority) × 31 days
  (columns), with draggable trip / carry-over / training / reserve / vacation bars, a
  schedule randomizer, and a feasibility mode.
- Everything currently lives inline in `index.html`. It has crossed the threshold where a
  split pays off; the notes/drawing work would push it past ~2000 lines.
- The app is **hosted** (served over HTTP), not opened via `file://`.

## Constraints & key decisions

1. **Native ES modules, no build tooling.** Because the app is hosted, production serves
   modules directly via `<script type="module">`. No bundler, no npm, no compile step.
   *Rejected alternative:* esbuild/Vite bundling back into one file — adds tooling we
   explicitly don't want.
2. **Local development uses a static server.** Native ESM does not load over `file://`.
   Dev loop: VS Code Live Server (auto-reload on save) or `python3 -m http.server`. This
   is the only workflow change.
3. **Behavior-identical.** The refactor must not change any runtime behavior. Verified
   with an automated Playwright smoke test run against the pre-split and post-split
   versions.
4. **Clean state foundation.** Introduce `store.js`, which owns all mutable state and
   exposes mutators, replacing scattered reassignments. Behavior-neutral, but gives
   notes/drawing/persistence a single place to build on.
5. **No new features, no persistence, no framework.** Sticky notes, drawing, localStorage
   persistence, and any view library are out of scope. React was evaluated and deferred:
   the core (DOM-measured drag/resize/draw) is imperative, which is React's weakest fit.
   If a view lib is ever wanted, it'll be Preact/Solid for the *chrome* only, adoptable in
   one module thanks to native ESM.

## Architecture — modules

Eleven modules, carved along the seams the code already has (its comment banners map
almost 1:1). The import graph is a **DAG — no circular imports**.

| Module | Owns (current lines) | Imports |
|---|---|---|
| `config.js` | constants: `DAY_COUNT`, `BAR_H`, `CH_PER_DAY`, `COLORS`, all `*_TEMPLATES` (424-453) | — |
| `format.js` | `parseHpd`, `fmtCH` (455-477), `randInt` (1007) | — |
| `store.js` | mutable state `trips`, `selectedId`, `PILOT_COUNT`, id counter + mutators | `config` |
| `grid.js` | `buildGrid`, `getCellPos`, `pointToCell` (621-704) | `store`, `config` |
| `render.js` | `renderAll`, `renderTrip`, `renderPool`, `updateCreditHours` (706-809) | `store`, `grid`, `config`, `format` |
| `toolbar.js` | swatches, delete btn, hpd input, `updateToolbar` (901-980) | `store`, `render`, `format` |
| `interactions.js` | drop, `startMove`, `startResize`, `selectTrip`, keyboard (811-1004) | `store`, `render`, `grid`, `toolbar` |
| `palette.js` | palette DOM + drag payloads + clear-all (484-619) | `config`, `store`, `render` |
| `randomizer.js` | `randomizeSchedule` + button (1006-1203) | `store`, `render`, `config`, `format` |
| `feasibility.js` | feasibility mode: shading, banner, send-to-pool (1205-1363) | `store`, `render`, `grid` |
| `main.js` | entry: runs init in order, wires the two injection seams | all |

### Dependency seams (resolved by injection, not cycles)

Two natural couplings would create import cycles. `main.js` resolves both by injecting
handlers at startup rather than having low-level modules import high-level ones:

- **Render ↔ interactions.** `render.js` attaches `mousedown` handlers (select/move/
  resize) when it draws each bar, but those behaviors live in `interactions.js`, which
  calls `renderAll`. `main.js` injects the interaction handlers into `render` once at
  startup; `render` imports nothing upward and stays a pure state→DOM projector.
- **Grid → feasibility.** The seniority-cell click (655-658) invokes the feasibility
  handler. `main.js` injects that handler into `grid.buildGrid`, so `grid` does not import
  `feasibility`.

## State model — `store.js`

The one behavior-neutral refactor. `store.js` owns the data and is the only place it
mutates.

- **Reads:** `getTrips()`, `getSelectedId()`, `getPilotCount()`
- **Mutations:** `addTrip(data) → id`, `removeTrip(id)`, `setTrips(arr)`, `clearTrips()`,
  `setSelectedId(id)`, `setPilotCount(n)`

The three `trips = trips.filter(...)` reassignments (947, 1011, 1375) become
`setTrips(...)`/`clearTrips()`; `nextId++` (828 etc.) moves inside `addTrip`.

**Deliberate non-change:** the store does **not** trigger rendering. Callers mutate, then
call `renderAll()` / `updateToolbar()`, exactly as today. A pub/sub store (mutate
auto-renders) is the obvious next step, but it changes render *timing*, so it is out of
scope for a behavior-identical split.

## Data flow (unchanged, just distributed)

`input → interactions / randomizer / feasibility mutate store via mutators → caller calls
renderAll() → render reads store + measures the grid via getBoundingClientRect → draws
bars into the overlay layer`. Identical to today's loop; it just crosses module
boundaries now.

## Error handling (unchanged)

Existing guards move verbatim with their code: drop `JSON.parse` try/catch (822),
CH-range validation alert (1198), `parseHpd` rejection (931-935). No new error handling —
that would be scope creep.

## CSS

The inline `<style>` block (6-372) moves verbatim into `styles.css`, linked via
`<link rel="stylesheet" href="styles.css">`. `index.html` shrinks to markup + that link +
`<script type="module" src="js/main.js"></script>`. No rule changes.

## Verification — Playwright smoke test

A scripted checklist run against **both** versions (served locally), asserting identical
behavior. Baseline is captured on the current single-file version first; the split version
must match.

1. Drag each palette type (trip 1–5d, carry-over, training, reserve RA/RB/R24, vacation)
   onto the grid → bar appears with correct label and CH.
2. Move a bar → pilot/day changes; clamps at grid edges.
3. Resize a bar via the right edge → day-span changes; clamps.
4. Select a bar → recolor via a swatch.
5. Delete via the toolbar button and via the Delete/Backspace key.
6. Reserve bar → hours/day input updates CH; rejects invalid input.
7. Build random schedule → every pilot's CH lands within `[minCh, maxCh]` where feasible;
   reserve-only pilots get reserve blocks.
8. Feasibility: enter mode → click bidding pilot → click upper bound → correct rows shade;
   "send affected trips to pool" moves trip/reserve bars below the bidding pilot into the
   pool.
9. Change pilot count → grid rebuilds; trips on dropped pilots are removed.
10. Clear all trips → grid empties, CH badges reset to `0:00`.
11. CH badges sum correctly per pilot throughout.

**Procedure:** the script encodes concrete assertions and is run against the current
single-file version (baseline) and then the split version; both must pass identically.
Deterministic flows (drag, move, resize, recolor, delete, feasibility, pilot-count, clear)
assert exact outcomes. The randomizer (item 7) asserts **invariants** — CH within range,
reserve-only pilots get reserve blocks — because its output uses `Math.random()` and is
not reproducible across runs. Any divergence is a regression to fix before completion.

## File layout (result)

```
FDX_SLGWG/
  index.html          <- markup + <link> + <script type="module">
  styles.css
  js/
    config.js  format.js  store.js
    grid.js    render.js  toolbar.js
    interactions.js  palette.js
    randomizer.js    feasibility.js
    main.js           <- entry / wiring
```

## Out of scope (YAGNI)

- Sticky notes (issue #3), side-notes panel, freehand drawing.
- localStorage / save / export persistence.
- Pub/sub store; reactive view library (Preact/Solid/React); bundler.
- Any visual/UX change; any new behavior.

## Follow-on work this unblocks

- Sticky notes & drawing land as their own modules (`notes.js`, `drawing.js`), reusing the
  toolbar and the overlay/measure pattern.
- A store subscribe/notify upgrade.
- Optional Preact-for-chrome or a canvas/drawing library, each adoptable in a single
  module.
