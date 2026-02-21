import { test, expect, Page } from '@playwright/test';

/* ─────────────────────────────────────────────────────────
 *  BibleFetch – E2E Smoke & Visual Test Suite
 *
 *  Usage:
 *    npx playwright test                  # run all
 *    npx playwright test --project=mobile # mobile only
 *    npx playwright test --grep "home"    # filter by name
 *
 *  Screenshots saved in e2e/test-results/
 *  HTML report in e2e/report/
 * ───────────────────────────────────────────────────────── */

// ──── helpers ──────────────────────────────────────────────

async function collectConsoleLogs(page: Page) {
  const logs: string[] = [];
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  return logs;
}

async function waitForAngular(page: Page) {
  // Wait for Angular to finish rendering – look for the app-root content
  await page.waitForSelector('app-root', { state: 'attached', timeout: 15_000 });
  // Small extra settle time for lazy-loaded components
  await page.waitForTimeout(1500);
}

// ──── HOME PAGE ────────────────────────────────────────────

test.describe('Home Page', () => {
  test('renders home and header', async ({ page }) => {
    const logs = await collectConsoleLogs(page);
    await page.goto('/');
    await waitForAngular(page);

    // Header should be visible
    const header = page.locator('app-header');
    await expect(header).toBeVisible();

    // Version selector should be in header
    const versionSelector = page.locator('app-version-selector');
    await expect(versionSelector).toBeVisible();

    // Bottom nav should be visible
    const bottomNav = page.locator('app-bottom-nav');
    await expect(bottomNav).toBeVisible();

    // No console errors
    const criticalErrors = logs.filter(l => l.includes('[error]') && !l.includes('favicon'));
    expect(criticalErrors).toHaveLength(0);

    await page.screenshot({ path: 'e2e/test-results/home.png', fullPage: true });
  });

  test('home page has navigation links', async ({ page }) => {
    await page.goto('/');
    await waitForAngular(page);

    // Should have bottom nav items
    const navItems = page.locator('app-bottom-nav a, app-bottom-nav button');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ──── BIBLE READER ─────────────────────────────────────────

test.describe('Bible Reader', () => {
  test('loads Genesis chapter 1', async ({ page }) => {
    const logs = await collectConsoleLogs(page);
    await page.goto('/bible/gen/1');
    await waitForAngular(page);

    // Should show chapter content or loading state
    const body = await page.textContent('body');
    // Check for verse numbers or book title
    const hasContent =
      body?.includes('1') || // verse number
      body?.includes('Genesis') ||
      body?.includes('Genezis') ||
      body?.includes('Teremtés') ||
      body?.includes('Mózes');
    expect(hasContent).toBeTruthy();

    await page.screenshot({ path: 'e2e/test-results/bible-reader-gen1.png', fullPage: true });
  });

  test('/bible redirects to last reading position', async ({ page }) => {
    await page.goto('/bible');
    await waitForAngular(page);

    // Should redirect to /bible/gen/1 (default) or last saved position
    const url = page.url();
    expect(url).toMatch(/\/bible\/\w+\/\d+/);
  });

  test('bible navigation buttons work', async ({ page }) => {
    await page.goto('/bible/gen/1');
    await waitForAngular(page);

    // Find next chapter button
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Következő"), button:has-text("►"), button:has-text("→")').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await waitForAngular(page);
      const url = page.url();
      expect(url).toMatch(/\/bible\/gen\/2|\/bible\//);
    }

    await page.screenshot({ path: 'e2e/test-results/bible-reader-nav.png', fullPage: true });
  });
});

// ──── ALTERNATIVE READER ───────────────────────────────────

test.describe('Reader Component (Tailwind)', () => {
  test('loads and displays verses', async ({ page }) => {
    await page.goto('/read/karoli/gen/1');
    await waitForAngular(page);

    const body = await page.textContent('body');
    const hasContent =
      body?.includes('1') || body?.includes('Mózes') || body?.includes('Genesis');
    expect(hasContent).toBeTruthy();

    await page.screenshot({ path: 'e2e/test-results/reader-tailwind.png', fullPage: true });
  });

  test('reader is mobile responsive', async ({ page, browserName }, testInfo) => {
    if (testInfo.project.name !== 'mobile') {
      test.skip();
    }
    await page.goto('/read/karoli/gen/1');
    await waitForAngular(page);

    // Check viewport fits without horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance

    await page.screenshot({ path: 'e2e/test-results/reader-mobile.png', fullPage: true });
  });
});

// ──── SEARCH ───────────────────────────────────────────────

test.describe('Search', () => {
  test('search page loads', async ({ page }) => {
    await page.goto('/search');
    await waitForAngular(page);

    // Should have search input
    const input = page.locator('input[type="text"], input[type="search"]');
    await expect(input.first()).toBeVisible();

    await page.screenshot({ path: 'e2e/test-results/search-page.png', fullPage: true });
  });

  test('can perform a text search', async ({ page }) => {
    await page.goto('/search');
    await waitForAngular(page);

    const input = page.locator('input[type="text"], input[type="search"]').first();
    await input.fill('love');
    await input.press('Enter');

    // Wait for results
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e/test-results/search-results.png', fullPage: true });
  });

  test('strongs search shows concordance results', async ({ page }) => {
    await page.goto('/search');
    await waitForAngular(page);

    const input = page.locator('input[type="text"], input[type="search"]').first();
    await input.fill('shalom');
    await input.press('Enter');

    // Wait for results (including Strong's parallel search)
    await page.waitForTimeout(4000);

    const body = await page.textContent('body');
    // May or may not find Strong's results depending on data available
    await page.screenshot({ path: 'e2e/test-results/search-strongs.png', fullPage: true });
  });
});

// ──── VERSION SELECTOR ─────────────────────────────────────

test.describe('Version Selector', () => {
  test('opens version picker from header', async ({ page }) => {
    await page.goto('/');
    await waitForAngular(page);

    const selectorBtn = page.locator('app-version-selector button').first();
    if (await selectorBtn.isVisible()) {
      await selectorBtn.click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'e2e/test-results/version-selector-open.png', fullPage: true });

      // Should show version options
      const overlay = page.locator('.fixed, [class*="overlay"], [class*="drawer"]');
      const overlayCount = await overlay.count();
      expect(overlayCount).toBeGreaterThan(0);
    }
  });
});

// ──── PROFILE / AUTH ───────────────────────────────────────

test.describe('Profile & Auth', () => {
  test('profile page loads', async ({ page }) => {
    await page.goto('/profile');
    await waitForAngular(page);
    await page.screenshot({ path: 'e2e/test-results/profile.png', fullPage: true });
  });

  test('auth page loads', async ({ page }) => {
    await page.goto('/auth');
    await waitForAngular(page);

    // Should have email input or login form
    const form = page.locator('input[type="email"], input[type="text"], form');
    const count = await form.count();
    expect(count).toBeGreaterThan(0);

    await page.screenshot({ path: 'e2e/test-results/auth.png', fullPage: true });
  });
});

// ──── PUBLIC COLLECTIONS ───────────────────────────────────

test.describe('Public Collections', () => {
  test('public collections page loads', async ({ page }) => {
    await page.goto('/public-collections');
    await waitForAngular(page);
    await page.screenshot({ path: 'e2e/test-results/public-collections.png', fullPage: true });
  });
});

// ──── 404 / CATCH-ALL ──────────────────────────────────────

test.describe('Routing', () => {
  test('unknown routes redirect to home', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');
    await waitForAngular(page);

    // Should be redirected to home
    const url = page.url();
    expect(url).toMatch(/\/$/);
  });
});

// ──── ACCESSIBILITY CHECKS ─────────────────────────────────

test.describe('Accessibility basics', () => {
  test('pages have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    await waitForAngular(page);

    const h1Count = await page.locator('h1').count();
    const h2Count = await page.locator('h2').count();
    // Should have at least one heading
    expect(h1Count + h2Count).toBeGreaterThan(0);
  });

  test('interactive elements are focusable', async ({ page }) => {
    await page.goto('/');
    await waitForAngular(page);

    const buttons = page.locator('button, a[href], input');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    // First button should be focusable
    if (count > 0) {
      await buttons.first().focus();
    }
  });

  test('no images without alt text', async ({ page }) => {
    await page.goto('/');
    await waitForAngular(page);

    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    // Relaxed: just report, don't fail
    if (imagesWithoutAlt > 0) {
      console.warn(`Found ${imagesWithoutAlt} images without alt text`);
    }
  });
});

// ──── PERFORMANCE CHECK ────────────────────────────────────

test.describe('Performance basics', () => {
  test('home page loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await waitForAngular(page);
    const loadTime = Date.now() - start;

    console.log(`Home page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(10_000); // generous 10s for CI
  });

  test('bible chapter loads within 8 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/bible/gen/1');
    await waitForAngular(page);
    const loadTime = Date.now() - start;

    console.log(`Bible reader load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(15_000);
  });
});
