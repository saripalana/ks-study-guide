import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = { generatedAt: new Date().toISOString(), results: [] };
const failures = [];

function assert(value, message) {
  if (!value) failures.push(message);
}

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No supported Chromium executable was found.');
  return found;
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  })[extension] || 'application/octet-stream';
}

const server = http.createServer((request, response) => {
  const rawPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (rawPath === '/favicon.ico') {
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  const relative = rawPath === '/' ? 'boards.html' : rawPath.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await puppeteer.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

async function runViewport(name, viewport, screenshot) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) {
      request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    } else {
      request.continue();
    }
  });

  const now = Date.now();
  const seed = {
    answered: { ch01q001: { selectedLetter: 'A', correct: true } },
    testAnswers: {},
    flagged: {},
    missed: {},
    testSubmitted: {},
    atSummary: false,
    index: 0,
    view: 'study'
  };
  const savedTests = [{
    schemaVersion: 2,
    setId: 'smoke-saved-test',
    mode: 'test',
    timed: true,
    kind: 'random',
    pool: 'all',
    chapters: ['1'],
    createdAt: now - 120000,
    completedAt: now - 60000,
    total: 2,
    answered: 2,
    correct: 1,
    incorrect: 1,
    omitted: 0,
    scorePct: 50,
    elapsedSeconds: 60,
    averageSeconds: 30,
    ids: ['ch01q001', 'ch01q002'],
    results: {
      ch01q001: { status: 'correct', selectedLetter: 'A', seconds: 25 },
      ch01q002: { status: 'incorrect', selectedLetter: 'A', seconds: 35 }
    },
    flagged: {},
    categories: [{
      chapter: 1,
      title: 'Neural Sciences',
      total: 2,
      correct: 1,
      incorrect: 1,
      omitted: 0,
      seconds: 60,
      accuracyPct: 50,
      averageSeconds: 30
    }]
  }];
  await page.evaluateOnNewDocument((values) => {
    localStorage.setItem('kaplanBoardPrepState', JSON.stringify(values.seed));
    localStorage.setItem('ksBoardsTestsV3', JSON.stringify(values.savedTests));
  }, { seed, savedTests });

  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#examCountdownValue', { timeout: 10000 });
  await page.waitForSelector('#questionPoolOptions', { timeout: 10000 });
  await page.waitForSelector('#analyticsSection', { timeout: 10000 });
  await page.waitForSelector('.history-row', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 800));

  const initialCountdown = await page.$eval('#examCountdownValue', (element) => element.textContent);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const laterCountdown = await page.$eval('#examCountdownValue', (element) => element.textContent);

  const initialState = await page.evaluate(() => ({
    panelOrder: Array.from(document.querySelector('[data-dashboard-region="data-tools"]')?.children || []).map((element) => element.id),
    tiles: document.querySelectorAll('.bank-tile').length,
    summaryCards: document.querySelectorAll('.stat-card').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    answerPreserved: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.ch01q001?.selectedLetter === 'A',
    savedTestPreserved: JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]')[0]?.setId === 'smoke-saved-test',
    panels: {
      analytics: !!document.getElementById('analyticsSection'),
      progress: !!document.getElementById('progressManagementSection'),
      reset: !!document.getElementById('hardResetCard'),
      privateDrive: !!document.getElementById('driveBackupSection'),
      vault: !!document.getElementById('questionVaultSection')
    },
    builder: {
      subjectOptions: document.querySelectorAll('#subjectSelectionGrid .subject-option').length,
      poolCards: document.querySelectorAll('#questionPoolOptions .pool-card').length,
      startEnabled: !document.getElementById('startNewSetBtn')?.disabled
    },
    analytics: {
      metricCards: document.querySelectorAll('#analyticsMetrics .analytics-metric').length,
      historyRows: document.querySelectorAll('#testHistory .history-row').length,
      categoryRows: document.querySelectorAll('#categoryTable .category-row:not(.category-head)').length
    }
  }));

  await page.click('#clearAllSubjects');
  const clearedBuilder = await page.evaluate(() => ({
    startDisabled: !!document.getElementById('startNewSetBtn')?.disabled,
    warningVisible: !document.getElementById('builderWarning')?.hidden,
    selectedSubjects: document.querySelectorAll('#subjectSelectionGrid input:checked').length
  }));
  await page.click('#selectAllSubjects');
  const restoredBuilder = await page.evaluate(() => ({
    startEnabled: !document.getElementById('startNewSetBtn')?.disabled,
    warningHidden: !!document.getElementById('builderWarning')?.hidden,
    selectedSubjects: document.querySelectorAll('#subjectSelectionGrid input:checked').length
  }));
  await page.click('#questionPoolOptions .pool-card[data-pool="flagged"]');
  const emptyFlaggedPool = await page.evaluate(() => ({
    startDisabled: !!document.getElementById('startNewSetBtn')?.disabled,
    warningVisible: !document.getElementById('builderWarning')?.hidden
  }));
  await page.click('#questionPoolOptions .pool-card[data-pool="all"]');
  const restoredAllPool = await page.evaluate(() => ({
    startEnabled: !document.getElementById('startNewSetBtn')?.disabled,
    warningHidden: !!document.getElementById('builderWarning')?.hidden
  }));

  await page.click('#testHistory .review-history');
  const reviewState = await page.evaluate(() => ({
    opened: !document.getElementById('testReviewModal')?.hidden,
    reviewedQuestions: document.querySelectorAll('#historyDetail .review-question').length,
    scoreText: document.querySelector('#historyDetail .review-summary strong')?.textContent || ''
  }));
  await page.click('#closeHistoryModal');
  reviewState.closed = await page.$eval('#testReviewModal', (element) => element.hidden);

  await page.click('#openHardReset');
  const modalOpened = await page.$eval('#hardResetModal', (element) => !element.hidden);
  await page.click('#cancelHardReset');
  const modalClosed = await page.$eval('#hardResetModal', (element) => element.hidden);

  const finalState = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    answerPreserved: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.ch01q001?.selectedLetter === 'A',
    savedTestPreserved: JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]')[0]?.setId === 'smoke-saved-test'
  }));

  await page.screenshot({ path: path.join(root, screenshot), fullPage: true });

  const expectedOrder = ['progressManagementSection', 'hardResetCard', 'driveBackupSection', 'questionVaultSection'];
  assert(initialState.tiles === 602, `${name}: expected 602 question tiles, found ${initialState.tiles}.`);
  assert(initialState.summaryCards === 6, `${name}: expected 6 summary cards, found ${initialState.summaryCards}.`);
  assert(JSON.stringify(initialState.panelOrder) === JSON.stringify(expectedOrder), `${name}: data-tool panel order is incorrect: ${initialState.panelOrder.join(', ')}.`);
  assert(Object.values(initialState.panels).every(Boolean), `${name}: one or more dashboard panels did not render.`);
  assert(initialCountdown !== laterCountdown, `${name}: countdown did not update.`);
  assert(initialState.builder.subjectOptions > 0 && initialState.builder.poolCards === 5 && initialState.builder.startEnabled, `${name}: builder did not initialize correctly.`);
  assert(clearedBuilder.startDisabled && clearedBuilder.warningVisible && clearedBuilder.selectedSubjects === 0, `${name}: clearing subjects did not disable the builder safely.`);
  assert(restoredBuilder.startEnabled && restoredBuilder.warningHidden && restoredBuilder.selectedSubjects === initialState.builder.subjectOptions, `${name}: selecting all subjects did not restore the builder.`);
  assert(emptyFlaggedPool.startDisabled && emptyFlaggedPool.warningVisible, `${name}: empty flagged pool did not block an invalid test start.`);
  assert(restoredAllPool.startEnabled && restoredAllPool.warningHidden, `${name}: returning to the all-question pool did not restore test creation.`);
  assert(initialState.analytics.metricCards === 5 && initialState.analytics.historyRows === 1 && initialState.analytics.categoryRows === 1, `${name}: analytics or saved-test history did not render seeded data.`);
  assert(reviewState.opened && reviewState.closed && reviewState.reviewedQuestions === 2 && reviewState.scoreText.includes('50'), `${name}: saved-test review did not open, render, and close correctly.`);
  assert(modalOpened && modalClosed, `${name}: absolute-reset dialog did not open and cancel correctly.`);
  assert(initialState.answerPreserved && finalState.answerPreserved, `${name}: seeded study progress was altered during non-destructive testing.`);
  assert(initialState.savedTestPreserved && finalState.savedTestPreserved, `${name}: seeded saved-test history was altered during non-destructive testing.`);
  assert(!initialState.overflow && !finalState.overflow, `${name}: horizontal page overflow detected at ${viewport.width}px.`);
  assert(errors.length === 0, `${name}: browser errors detected: ${errors.join(' | ')}`);

  report.results.push({
    name,
    viewport,
    initialCountdown,
    laterCountdown,
    modalOpened,
    modalClosed,
    initialState,
    clearedBuilder,
    restoredBuilder,
    emptyFlaggedPool,
    restoredAllPool,
    reviewState,
    finalState,
    errors
  });
  await page.close();
}

try {
  await runViewport('desktop', { width: 1440, height: 1000 }, 'ui-smoke-desktop.png');
  await runViewport('mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }, 'ui-smoke-mobile.png');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

report.passed = failures.length === 0;
report.failures = failures;
fs.writeFileSync(path.join(root, 'ui-smoke-report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`Browser smoke tests failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Desktop and mobile browser smoke tests passed.');
