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

  const seed = {
    answered: { ch01q001: 'A' },
    testAnswers: {},
    flagged: {},
    missed: {},
    testSubmitted: {},
    atSummary: false,
    index: 0,
    view: 'study'
  };
  await page.evaluateOnNewDocument((value) => {
    localStorage.setItem('kaplanBoardPrepState', JSON.stringify(value));
  }, seed);

  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#examCountdownValue', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 800));

  const initialCountdown = await page.$eval('#examCountdownValue', (element) => element.textContent);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const laterCountdown = await page.$eval('#examCountdownValue', (element) => element.textContent);
  const state = await page.evaluate(() => ({
    panelOrder: Array.from(document.querySelector('[data-dashboard-region="data-tools"]')?.children || []).map((element) => element.id),
    tiles: document.querySelectorAll('.bank-tile').length,
    summaryCards: document.querySelectorAll('.stat-card').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    answerPreserved: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.ch01q001 === 'A',
    panels: {
      progress: !!document.getElementById('progressManagementSection'),
      reset: !!document.getElementById('hardResetCard'),
      privateDrive: !!document.getElementById('driveBackupSection'),
      vault: !!document.getElementById('questionVaultSection')
    }
  }));

  await page.click('#openHardReset');
  const modalOpened = await page.$eval('#hardResetModal', (element) => !element.hidden);
  await page.click('#cancelHardReset');
  const modalClosed = await page.$eval('#hardResetModal', (element) => element.hidden);
  await page.screenshot({ path: path.join(root, screenshot), fullPage: true });

  const expectedOrder = ['progressManagementSection', 'hardResetCard', 'driveBackupSection', 'questionVaultSection'];
  assert(state.tiles === 602, `${name}: expected 602 question tiles, found ${state.tiles}.`);
  assert(state.summaryCards === 6, `${name}: expected 6 summary cards, found ${state.summaryCards}.`);
  assert(JSON.stringify(state.panelOrder) === JSON.stringify(expectedOrder), `${name}: data-tool panel order is incorrect: ${state.panelOrder.join(', ')}.`);
  assert(Object.values(state.panels).every(Boolean), `${name}: one or more operational panels did not render.`);
  assert(initialCountdown !== laterCountdown, `${name}: countdown did not update.`);
  assert(modalOpened && modalClosed, `${name}: absolute-reset dialog did not open and cancel correctly.`);
  assert(state.answerPreserved, `${name}: seeded study progress was altered during a non-destructive load.`);
  assert(!state.overflow, `${name}: horizontal page overflow detected at ${viewport.width}px.`);
  assert(errors.length === 0, `${name}: browser errors detected: ${errors.join(' | ')}`);

  report.results.push({
    name,
    viewport,
    initialCountdown,
    laterCountdown,
    modalOpened,
    modalClosed,
    ...state,
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
