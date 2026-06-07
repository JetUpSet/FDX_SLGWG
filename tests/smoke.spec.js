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
