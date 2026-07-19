import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = { generatedAt: new Date().toISOString(), passed: false, failures: [], errors: [] };
const reportPath = path.join(root, 'device-sync-smoke-report.json');
const screenshotPath = path.join(root, 'device-sync-smoke.png');

function executablePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No supported Chromium executable was found.');
  return found;
}
function mime(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const relative = pathname === '/' ? 'boards.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  browser = await puppeteer.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Simulated sync failure')) report.errors.push(`console: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    else request.continue();
  });

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('kaplanBoardPrepState', JSON.stringify({ answered: { 'k-1.1': { selectedLetter: 'A', correct: true } }, testAnswers: {}, testSubmitted: {}, flagged: {}, missed: {} }));
  });
  await page.goto(`http://127.0.0.1:${port}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#deviceSyncNow', { timeout: 10000 });
  await page.waitForSelector('#deviceSyncChoiceDialog', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 500));

  report.initial = await page.evaluate(() => ({
    visibleButtons: Array.from(document.querySelectorAll('#deviceSyncCard button')).filter((button) => {
      const dialog = button.closest('dialog');
      const style = getComputedStyle(button);
      return !dialog && style.display !== 'none' && style.visibility !== 'hidden';
    }).map((button) => button.id),
    status: document.getElementById('deviceSyncStatus')?.textContent || '',
    primary: document.getElementById('deviceSyncNow')?.textContent || '',
    advancedVisible: (() => { const section = document.getElementById('driveBackupSection'); return section ? getComputedStyle(section).display !== 'none' : false; })(),
    headerEyebrow: document.querySelector('.dashboard-topbar .dashboard-eyebrow')?.textContent || '',
    headerTitle: document.querySelector('.dashboard-topbar h1')?.textContent || '',
    bankTitle: document.querySelector('.bank-card h3')?.textContent || '',
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  if (report.initial.visibleButtons.length !== 1 || report.initial.visibleButtons[0] !== 'deviceSyncNow') report.failures.push(`Expected exactly one visible sync button, found ${report.initial.visibleButtons.join(', ') || 'none'}.`);
  if (!/Not connected/i.test(report.initial.status) || !/Connect and sync/i.test(report.initial.primary)) report.failures.push('Disconnected state does not prompt the single connect-and-sync action.');
  if (report.initial.advancedVisible) report.failures.push('Legacy detailed Drive controls remain visible.');
  if (report.initial.headerEyebrow !== 'ABPN PSYCHIATRY STUDY SITE' || report.initial.headerTitle !== 'ABPN Psychiatry Study') report.failures.push('Global ABPN site identity is incorrect.');
  if (!/K&S Psychiatry Question Bank/.test(report.initial.bankTitle)) report.failures.push('K&S is not clearly limited to the active question-bank area.');
  if (report.initial.overflow) report.failures.push('Simplified Device Sync caused horizontal overflow.');

  const localNewer = {
    connected: true, syncing: false, relation: 'local-newer', lastSyncedAt: Date.UTC(2026, 6, 19, 5, 0, 0),
    local: { updatedAt: Date.UTC(2026, 6, 19, 7, 0, 0), summary: { questions: 12, tests: 3, recoveryBackups: 2 } },
    drive: { updatedAt: Date.UTC(2026, 6, 19, 6, 0, 0), summary: { questions: 10, tests: 2, recoveryBackups: 1 } }
  };
  await page.evaluate((state) => {
    window.__syncActions = [];
    window.__syncState = state;
    window.__syncResult = { action: 'used-local', state };
    window.__syncError = '';
    window.BoardsDriveBackup = {
      getSyncState: () => window.__syncState,
      syncLatest: async () => {
        window.__syncActions.push('syncLatest');
        if (window.__syncError) throw new Error(window.__syncError);
        return window.__syncResult;
      },
      chooseSource: async (source) => { window.__syncActions.push(`choose:${source}`); return { action: source === 'local' ? 'used-local' : 'used-drive', state: window.__syncState }; },
      connect: () => window.__syncActions.push('connect')
    };
    window.dispatchEvent(new CustomEvent('ksboards:drive-sync-state', { detail: state }));
  }, localNewer);
  await new Promise((resolve) => setTimeout(resolve, 100));
  report.localNewer = await page.evaluate(() => ({ status: document.getElementById('deviceSyncStatus')?.textContent || '', recommendation: document.getElementById('deviceSyncRecommendation')?.textContent || '', primary: document.getElementById('deviceSyncNow')?.textContent || '' }));
  if (!/This device is newer/.test(report.localNewer.status) || !/newest progress is on this device/.test(report.localNewer.recommendation) || !/Sync newest progress/.test(report.localNewer.primary)) report.failures.push('Local-newer state is not clear through the single action.');

  await page.click('#deviceSyncNow');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const clearResult = await page.evaluate(() => ({ actions: window.__syncActions.slice(), dialogOpen: !!document.getElementById('deviceSyncChoiceDialog')?.open }));
  if (!clearResult.actions.includes('syncLatest') || clearResult.dialogOpen) report.failures.push('Clear newest-copy sync did not run automatically.');

  const ambiguous = { ...localNewer, relation: 'different' };
  await page.evaluate((state) => {
    window.__syncState = state;
    window.__syncResult = { action: 'needs-choice', state };
    window.dispatchEvent(new CustomEvent('ksboards:drive-sync-state', { detail: state }));
  }, ambiguous);
  await page.click('#deviceSyncNow');
  await page.waitForFunction(() => document.getElementById('deviceSyncChoiceDialog')?.open === true, { timeout: 3000 });
  report.ambiguous = await page.evaluate(() => ({
    open: !!document.getElementById('deviceSyncChoiceDialog')?.open,
    localEnabled: !document.getElementById('deviceSyncChooseLocal')?.disabled,
    driveEnabled: !document.getElementById('deviceSyncChooseDrive')?.disabled
  }));
  if (!report.ambiguous.open || !report.ambiguous.localEnabled || !report.ambiguous.driveEnabled) report.failures.push('Ambiguous comparison did not ask for a safe source choice.');

  await page.evaluate(() => { const dialog = document.getElementById('deviceSyncChoiceDialog'); if (dialog?.open) dialog.close(); window.__syncError = 'Simulated sync failure'; });
  await page.click('#deviceSyncNow');
  await page.waitForFunction(() => document.getElementById('deviceSyncChoiceDialog')?.open === true, { timeout: 3000 });
  const errorReason = await page.$eval('#deviceSyncChoiceReason', (node) => node.textContent || '');
  if (!errorReason.includes('Simulated sync failure')) report.failures.push('Sync error did not produce the safety-choice prompt.');

  const sentinel = await page.evaluate(() => JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter);
  if (sentinel !== 'A') report.failures.push('Sync presentation testing altered study data.');
  if (report.errors.length) report.failures.push(`Browser errors detected: ${report.errors.join(' | ')}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();
} catch (error) {
  report.failures.push(error && error.stack ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  report.passed = report.failures.length === 0;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

if (!report.passed) {
  console.error(`Device Sync smoke test failed:\n- ${report.failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Single-button Device Sync and ABPN-versus-bank identity behavior passed.');