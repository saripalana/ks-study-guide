import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = { generatedAt: new Date().toISOString(), passed: false, failures: [], errors: [] };

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
    '.json': 'application/json; charset=utf-8'
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

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) {
      request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    } else request.continue();
  });

  const sentinel = { answered: { 'k-1.1': { selectedLetter: 'A', correct: true } }, testAnswers: {}, testSubmitted: {}, flagged: {}, missed: {}, atSummary: false, index: 0, view: 'study' };
  await page.evaluateOnNewDocument((value) => localStorage.setItem('kaplanBoardPrepState', JSON.stringify(value)), sentinel);
  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#deviceSyncCard', { timeout: 10000 });
  await page.waitForSelector('#driveBackupSection', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 700));

  report.initial = await page.evaluate(() => ({
    steps: document.querySelectorAll('#deviceSyncCard .device-sync-step').length,
    status: document.getElementById('deviceSyncStatus')?.textContent || '',
    connectEnabled: !document.getElementById('deviceSyncConnect')?.disabled,
    backupDisabled: !!document.getElementById('deviceSyncBackup')?.disabled,
    restoreDisabled: !!document.getElementById('deviceSyncRestore')?.disabled,
    message: document.getElementById('deviceSyncMessage')?.textContent || '',
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sentinelPreserved: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter === 'A'
  }));

  if (report.initial.steps !== 3) report.failures.push(`Expected 3 device-sync steps, found ${report.initial.steps}.`);
  if (!report.initial.status.includes('Not connected')) report.failures.push(`Initial sync status was unclear: ${report.initial.status}`);
  if (!report.initial.connectEnabled || !report.initial.backupDisabled || !report.initial.restoreDisabled) report.failures.push('Initial sync button states are unsafe or incorrect.');
  if (!report.initial.message.includes('Not connected')) report.failures.push('The top sync message did not mirror the detailed Drive status.');
  if (report.initial.overflow) report.failures.push('Device Sync card caused horizontal overflow.');
  if (!report.initial.sentinelPreserved) report.failures.push('Device Sync initialization altered browser study data.');

  await page.evaluate(() => {
    const connect = document.getElementById('connectGoogleDrive');
    const backup = document.getElementById('driveBackupNow');
    const restore = document.getElementById('driveRestoreLatest');
    const status = document.getElementById('driveBackupStatus');
    const last = document.getElementById('driveLastSync');
    connect.textContent = 'Google Drive connected';
    connect.disabled = true;
    backup.disabled = false;
    restore.disabled = false;
    status.className = 'drive-backup-status good';
    status.textContent = 'Connected. This browser matches the latest Drive backup.';
    last.textContent = 'Last successful sync: Jul 19, 2026, 12:00 AM';
  });
  await new Promise((resolve) => setTimeout(resolve, 150));

  report.mirrored = await page.evaluate(() => ({
    status: document.getElementById('deviceSyncStatus')?.textContent || '',
    statusClass: document.getElementById('deviceSyncStatus')?.className || '',
    connectText: document.getElementById('deviceSyncConnect')?.textContent || '',
    backupEnabled: !document.getElementById('deviceSyncBackup')?.disabled,
    restoreEnabled: !document.getElementById('deviceSyncRestore')?.disabled,
    message: document.getElementById('deviceSyncMessage')?.textContent || '',
    lastSync: document.getElementById('deviceSyncLastSync')?.textContent || ''
  }));

  if (!report.mirrored.status.includes('Connected and current') || !report.mirrored.statusClass.includes('good')) report.failures.push('Connected status did not mirror to the main card.');
  if (!report.mirrored.connectText.includes('connected') || !report.mirrored.backupEnabled || !report.mirrored.restoreEnabled) report.failures.push('Connected button states did not mirror to the main card.');
  if (!report.mirrored.message.includes('matches the latest Drive backup')) report.failures.push('Detailed connected message did not mirror to the main card.');
  if (!report.mirrored.lastSync.includes('Jul 19, 2026')) report.failures.push('Last successful sync did not mirror to the main card.');

  await page.$eval('#deviceSyncDetails', (button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 700));
  report.detailsVisible = await page.$eval('#driveBackupSection', (section) => {
    const box = section.getBoundingClientRect();
    return box.top < window.innerHeight && box.bottom > 0;
  });
  if (!report.detailsVisible) report.failures.push('More sync details did not bring the detailed Drive controls into view.');

  report.finalSentinelPreserved = await page.evaluate(() => JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter === 'A');
  if (!report.finalSentinelPreserved) report.failures.push('Device Sync interactions altered browser study data.');
  if (report.errors.length) report.failures.push(`Browser errors detected: ${report.errors.join(' | ')}`);

  await page.screenshot({ path: path.join(root, 'device-sync-smoke.png'), fullPage: false });
  await page.close();
  report.passed = report.failures.length === 0;
} catch (error) {
  report.failures.push(error && error.stack ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(path.join(root, 'device-sync-smoke-report.json'), JSON.stringify(report, null, 2));
}

if (!report.passed) {
  console.error(`Device Sync browser smoke test failed:\n- ${report.failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Device Sync browser smoke test passed.');
