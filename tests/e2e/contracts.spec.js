import { expect, test } from '@playwright/test';

for (const width of [1440, 1180, 390, 320]) {
  test(`local matching, keyboard and cancellation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 760 ? 1200 : 844 });
    await page.goto('/');
    await expect(page.locator('#author')).toHaveValue('All authors');
    await expect.poll(() => page.evaluate(() => window.example.nav.getState().loading)).toBe(false);
    const requests = await page.evaluate(() => window.example.requests);
    await page.locator('#author').fill('@ATR44');
    await expect(page.getByRole('option', { name: '@author_44', exact: true })).toBeVisible();
    await page.locator('#author').press('Enter');
    await expect(page.locator('#current-author')).toHaveText('author_44');
    await expect.poll(() => page.evaluate(() => window.example.nav.getState().loading)).toBe(false);
    const confirmedRequests = await page.evaluate(() => window.example.requests);
    await page.locator('#author').fill('zzzz');
    await expect(page.getByRole('option')).toHaveCount(0);
    await page.locator('#author').press('Enter');
    await expect(page.locator('#current-author')).toHaveText('author_44');
    await page.locator('#author').press('Escape');
    await expect(page.locator('#author')).toHaveValue('@author_44');
    expect(await page.evaluate(() => window.example.requests)).toBe(confirmedRequests);
    expect(confirmedRequests).toBeGreaterThanOrEqual(requests);
    await page.getByRole('button', { name: 'All authors', exact: true }).click();
    await expect(page.locator('#current-author')).toHaveText('All authors');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/example-${width}.png` });
  });
}

test('actual wheel gestures remain in their intended region, including both boundaries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.example.refresh('', 35));
  const dates = page.locator('#dates-scroll');
  await dates.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => dates.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await dates.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await dates.hover();
  await page.mouse.wheel(0, 400);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const before = await dates.evaluate((node) => node.scrollTop);
  await page.locator('.copy p').first().hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await dates.evaluate((node) => node.scrollTop)).toBe(before);
  await dates.evaluate((node) => {
    node.scrollTop = 0;
  });
  const pageTop = await page.evaluate(() => scrollY);
  await dates.hover();
  await page.mouse.wheel(0, -400);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => scrollY)).toBe(pageTop);
});

test('resize and destroy do not trigger history reads; destroyed selectors ignore events', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.example.refresh('', 14));
  await page.locator('#dates-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight - node.clientHeight - 150;
  });
  const before = await page.evaluate(() => window.example.requests);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.evaluate(() => window.example.requests)).toBe(before);
  await page.evaluate(() => {
    window.example.nav.destroy();
    window.example.picker.destroy();
  });
  await page.locator('#author').fill('author_12');
  await expect(page.locator('#popup')).toBeHidden();
  await page.locator('#more').click();
  expect(await page.evaluate(() => window.example.requests)).toBe(before);
});

test('real touch selection works with one hundred candidates', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4187/');
  await page.locator('#author').fill('atr99');
  await page.getByRole('option', { name: '@author_99', exact: true }).tap();
  await expect(page.locator('#current-author')).toHaveText('author_99');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('appending history preserves the focused date node', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    window.example.refresh('', 14);
    document.querySelector('#dates a:last-child').focus({ preventScroll: true });
    const scroller = document.querySelector('#dates-scroll');
    scroller.scrollTop = scroller.scrollHeight;
  });
  const focusedDate = await page.evaluate(() => document.activeElement.dataset.date);
  await page.locator('#dates-scroll').hover();
  await page.mouse.wheel(0, 160);
  await expect.poll(() => page.locator('#dates a').count()).toBeGreaterThan(14);
  expect(await page.evaluate(() => document.activeElement.dataset.date)).toBe(focusedDate);
});

test('a loader ignoring abort cannot publish an obsolete scope result', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDateNavigation } = await import('/packages/daily-ui/src/date-navigation.js');
    window.example.nav.destroy();
    const get = (id) => document.getElementById(id);
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const nav = createDateNavigation({
      elements: {
        sidebar: document.querySelector('aside'),
        scroller: get('dates-scroll'),
        list: get('dates'),
        moreButton: get('more'),
        status: get('date-status'),
        selectedDate: get('selected'),
        header: document.querySelector('header'),
        readingHeading: get('heading'),
      },
      loadPage: () => gate,
      onSelect() {},
    });
    nav.commitRefresh(nav.beginRefresh('old-scope'), {
      items: [{ date: '2030-01-01' }],
      nextCursor: 'old-next',
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    nav.commitRefresh(nav.beginRefresh('new-scope'), {
      items: [{ date: '2030-01-02' }],
      nextCursor: null,
    });
    release({ items: [{ date: '1999-01-01' }], nextCursor: null });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.example.nav = nav;
  });
  await expect(page.locator('#dates')).not.toContainText('1999-01-01');
  await expect(page.locator('#dates a')).toHaveText(['2030-01-02']);
});

test('a failed same-scope refresh preserves the focused date', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.example.refresh('', 35);
    document.querySelector('#dates a').focus({ preventScroll: true });
    const token = window.example.nav.beginRefresh('');
    window.example.nav.failRefresh(token);
  });
  await expect(page.locator('#dates a').first()).toBeFocused();
  await expect(page.locator('#dates a')).toHaveCount(35);
});
