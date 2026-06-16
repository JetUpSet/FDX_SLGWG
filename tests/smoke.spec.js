import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function dropPayloadOnCell(page, payload, pilot = 1, day = 1) {
  const cell = page.locator(`td.day-cell[data-pilot="${pilot}"][data-day="${day}"]`);
  const box = await cell.boundingBox();
  expect(box).not.toBeNull();

  await page.evaluate(({ payload, x, y }) => {
    const target = document.elementFromPoint(x, y);
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', JSON.stringify(payload));
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      dataTransfer,
    }));
  }, {
    payload,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
}

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

test('palette renders all twenty-two template items across expected sections', async ({ page }) => {
  await expect(page.locator('.palette-item')).toHaveCount(22);
  await expect(page.locator('.palette h2')).toContainText([
    'Trip Templates',
    'Carry Over',
    'Training',
    'Reserve',
    'Vacation',
    'Leave',
    'Absence',
    'Work Period',
    'Departure',
  ]);

  for (const label of [
    '10-day trip',
    '14-day trip',
    'MLA',
    'RET',
    'DOG',
    'JRY',
    'OFF',
    'OFC',
    'SIC',
    'Work Period',
  ]) {
    await expect(page.locator('.palette-item', { hasText: label })).toBeVisible();
  }
});

test('new templates drop with labels and zero-credit overlays stay visual-only', async ({ page }) => {
  await dropPayloadOnCell(page, {
    kind: 'new', type: 'trip', days: 10,
    hoursPerDay: 6, color: '#2563eb'
  }, 1, 1);
  await dropPayloadOnCell(page, {
    kind: 'new', type: 'leave', label: 'MLA', days: 3,
    hoursPerDay: 0, color: '#475569'
  }, 1, 12);
  await dropPayloadOnCell(page, {
    kind: 'new', type: 'absence', label: 'DOG', days: 3,
    hoursPerDay: 0, color: '#be123c'
  }, 1, 16);
  await dropPayloadOnCell(page, {
    kind: 'new', type: 'workperiod', label: 'Work Period', days: 5,
    hoursPerDay: 0, color: '#f59e0b'
  }, 1, 1);

  await expect(page.locator('.trip', { hasText: '10d · 60:00' })).toBeVisible();
  await expect(page.locator('.trip.leave', { hasText: 'MLA 3d' })).toBeVisible();
  await expect(page.locator('.trip.absence', { hasText: 'DOG 3d' })).toBeVisible();
  await expect(page.locator('.ch-badge[data-ch-for="1"]')).toHaveText('60:00');

  // Work Period is an overlay bracket marker: it gets the .trip.workperiod class but
  // carries NO inline text label (its "WOP" marker is a CSS ::after), has a transparent
  // background, and renders on top of (after) all other bars.
  const wop = page.locator('.trip.workperiod');
  await expect(wop).toBeVisible();
  await expect(wop).not.toContainText('Work Period');
  await expect(wop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const wopMarker = await wop.evaluate(el => getComputedStyle(el, '::after').content);
  expect(wopMarker).toContain('WOP');

  const renderedTexts = await page.locator('.trip').allInnerTexts();
  expect(renderedTexts[renderedTexts.length - 1]).toBe('');
});

// 7: randomizer wiring. Asserts invariants, not exact output (Math.random).
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
  await page.locator('.swatch').nth(3).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.trip-layer .trip')).toHaveCount(before - 1);
});

// 6: reserve hours/day edit.
test('reserve bar hours/day edit keeps a valid CH label', async ({ page }) => {
  await page.click('#randomizeBtn');
  const reserveBar = page.locator('.trip-layer .trip.reserve').first();
  await expect(reserveBar).toBeVisible();
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

// 8: feasibility shading + send-to-pool (exercises the grid->feasibility injection seam later).
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
  page.on('dialog', d => d.accept());
  await page.locator('.clear-btn').click();
  await expect(page.locator('.trip-layer .trip')).toHaveCount(0);
  const texts = await page.locator('.ch-badge').allInnerTexts();
  expect(texts.every(t => t.trim() === '0:00')).toBe(true);
});

test('office-day absence shows and counts its 6 hours of credit', async ({ page }) => {
  await dropPayloadOnCell(page, {
    kind: 'new', type: 'absence', label: 'OFC', days: 1,
    hoursPerDay: 6, color: '#0369a1'
  }, 1, 1);

  // Label-only absence, but because it carries hours it shows credit.
  await expect(page.locator('.trip.absence', { hasText: 'OFC 6:00' })).toBeVisible();
  // And it lifts the pilot's monthly credit total.
  await expect(page.locator('.ch-badge[data-ch-for="1"]')).toHaveText('6:00');
});
