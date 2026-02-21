/**
 * BibleFetch – Quick Audit Script
 *
 * Runs against a live dev server (default http://localhost:4200).
 * Checks every major route, captures screenshots, reports console
 * errors, measures load times, and checks mobile responsiveness.
 *
 * Usage:
 *   node --loader ts-node/esm tools/audit.ts            # default
 *   npx ts-node tools/audit.ts http://localhost:4200     # custom URL
 *
 * Or compile first:
 *   npx tsc tools/audit.ts --esModuleInterop --module commonjs
 *   node tools/audit.js
 *
 * Requires: @playwright/test (already installed)
 */

import { chromium, type Page, type Browser } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = process.argv[2] ?? 'http://localhost:4200';
const OUT = join(__dirname, '..', 'e2e', 'audit-results');

interface RouteReport {
  route: string;
  status: 'ok' | 'warn' | 'fail';
  loadMs: number;
  consoleErrors: string[];
  notes: string[];
  screenshot?: string;
}

const ROUTES = [
  '/',
  '/bible/gen/1',
  '/bible/psa/23',
  '/bible/jhn/3',
  '/read/karoli/gen/1',
  '/search',
  '/profile',
  '/auth',
  '/public-collections',
];

const MOBILE_VP = { width: 390, height: 844 };
const DESKTOP_VP = { width: 1280, height: 800 };

async function waitForAngular(page: Page) {
  try {
    await page.waitForSelector('app-root', { state: 'attached', timeout: 12_000 });
    await page.waitForTimeout(1200);
  } catch {
    // timeout is ok — we'll note it
  }
}

async function auditRoute(
  page: Page,
  route: string,
  viewport: { width: number; height: number },
  label: string,
): Promise<RouteReport> {
  const errors: string[] = [];
  const notes: string[] = [];
  const handler = (msg: any) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  page.on('console', handler);

  await page.setViewportSize(viewport);

  const t0 = Date.now();
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  } catch (e: any) {
    page.off('console', handler);
    return { route, status: 'fail', loadMs: Date.now() - t0, consoleErrors: errors, notes: [`Navigation failed: ${e.message}`] };
  }
  await waitForAngular(page);
  const loadMs = Date.now() - t0;

  // Check horizontal overflow (mobile responsiveness)
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollW > viewport.width + 10) {
    notes.push(`Horizontal overflow: scrollWidth=${scrollW} > viewport=${viewport.width}`);
  }

  // Screenshot
  const safeName = route.replace(/\//g, '_').replace(/^_/, '') || 'home';
  const screenshotFile = `${safeName}-${label}.png`;
  await page.screenshot({ path: join(OUT, screenshotFile), fullPage: true });

  page.off('console', handler);

  const filteredErrors = errors.filter(e => !e.includes('favicon'));

  return {
    route,
    status: filteredErrors.length > 0 ? 'warn' : 'ok',
    loadMs,
    consoleErrors: filteredErrors,
    notes,
    screenshot: screenshotFile,
  };
}

async function run() {
  mkdirSync(OUT, { recursive: true });

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e: any) {
    console.error('Failed to launch browser. Run: npx playwright install chromium');
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const reports: RouteReport[] = [];

  for (const route of ROUTES) {
    // Desktop
    const desktop = await auditRoute(page, route, DESKTOP_VP, 'desktop');
    reports.push(desktop);
    const icon = desktop.status === 'ok' ? '✅' : desktop.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${route.padEnd(30)} desktop  ${desktop.loadMs}ms`);
    if (desktop.consoleErrors.length) console.log(`   Errors: ${desktop.consoleErrors.join('; ')}`);
    if (desktop.notes.length) console.log(`   Notes:  ${desktop.notes.join('; ')}`);

    // Mobile
    const mobile = await auditRoute(page, route, MOBILE_VP, 'mobile');
    reports.push(mobile);
    const mIcon = mobile.status === 'ok' ? '✅' : mobile.status === 'warn' ? '⚠️' : '❌';
    console.log(`${mIcon} ${route.padEnd(30)} mobile   ${mobile.loadMs}ms`);
    if (mobile.consoleErrors.length) console.log(`   Errors: ${mobile.consoleErrors.join('; ')}`);
    if (mobile.notes.length) console.log(`   Notes:  ${mobile.notes.join('; ')}`);
  }

  console.log('─'.repeat(60));

  // Summary
  const ok = reports.filter(r => r.status === 'ok').length;
  const warn = reports.filter(r => r.status === 'warn').length;
  const fail = reports.filter(r => r.status === 'fail').length;
  console.log(`\n  ✅ ${ok} OK   ⚠️ ${warn} Warnings   ❌ ${fail} Failures`);
  console.log(`  Screenshots → ${OUT}\n`);

  // Write JSON report
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(reports, null, 2));

  await browser.close();

  if (fail > 0) process.exit(1);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
