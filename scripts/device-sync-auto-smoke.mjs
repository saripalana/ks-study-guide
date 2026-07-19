import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = { generatedAt: new Date().toISOString(), passed: false, failures: [], errors: [] };

function browserExecutable() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No supported Chromium executable was found.');
  return found;
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' })[extension] || 'application/octet-stream';
}

const server = http.createServer((request, response) => {
  const rawPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (rawPath === '/favicon.ico') { response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return; }
  const relative = rawPath === '/' ? 'boards.html' : rawPath.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end('Not found'); return; }
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
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Simulated sync failure')) report.errors.push(`console: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    else request.continue();
  });

  const localChangedAt = Date.UTC(2026, 6, 19, 6, 30, 15);
  const sentinel = { answered: { 'k-1.1': { selectedLetter: 'A', correct: true } }, testAnswers: {}, testSubmitted: {}, flagged: {}, missed: {}, atSummary: false, index: 0, view: 'study' };
  await page.evaluateOnNewDocument((values) => {
    localStorage.setItem('kaplanBoardPrepState', JSON.stringify(values.sentinel));
    localStorage.setItem('ksBoardsDriveSettingsV1', JSON.stringify({ autoBackup: true, lastLocalChangeAt: values.localChangedAt }));
  }, { sentinel, localChangedAt });

  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#deviceSyncNow', { timeout: 10000 });
  await page.waitForSelector('#driveBackupSection', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 700));

  report.initial = await page.evaluate(() => ({
    comparisonCopies: document.querySelectorAll('#deviceSyncCard .device-sync-copy').length,
    steps: document.querySelectorAll('#deviceSyncCard .device-sync-step').length,
    status: document.getElementById('deviceSyncStatus')?.textContent || '',
    localTime: document.getElementById('deviceSyncLocalTime')?.textContent || '',
    localSummary: document.getElementById('deviceSyncLocalSummary')?.textContent || '',
    driveTime: document.getElementById('deviceSyncDriveTime')?.textContent || '',
    syncEnabled: !document.getElementById('deviceSyncNow')?.disabled,
    manualEnabled: !document.getElementById('deviceSyncChoose')?.disabled,
    dialogPresent: !!document.getElementById('deviceSyncChoiceDialog'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sentinelPreserved: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter === 'A'
  }));
  if (report.initial.comparisonCopies !== 2) report.failures.push(`Expected 2 sync comparison copies, found ${report.initial.comparisonCopies}.`);
  if (report.initial.steps !== 3) report.failures.push(`Expected 3 automatic-sync steps, found ${report.initial.steps}.`);
  if (!report.initial.status.includes('Not connected')) report.failures.push(`Initial sync status was unclear: ${report.initial.status}`);
  if (!report.initial.localTime.includes('2026') || !report.initial.localSummary.includes('1 questions')) report.failures.push('Local timestamp or summary did not render from real browser state.');
  if (!report.initial.driveTime.includes('Connect')) report.failures.push('Disconnected Drive timestamp guidance is unclear.');
  if (!report.initial.syncEnabled || !report.initial.manualEnabled || !report.initial.dialogPresent) report.failures.push('Automatic or fallback sync controls are missing or unavailable.');
  if (report.initial.overflow) report.failures.push('Automatic Device Sync caused horizontal overflow.');
  if (!report.initial.sentinelPreserved) report.failures.push('Device Sync initialization altered browser study data.');

  const localNewer = {
    connected: true, syncing: false, relation: 'local-newer', lastSyncedAt: Date.UTC(2026, 6, 19, 5, 0, 0),
    local: { updatedAt: Date.UTC(2026, 6, 19, 7, 0, 0), summary: { questions: 12, tests: 3, recoveryBackups: 2 } },
    drive: { updatedAt: Date.UTC(2026, 6, 19, 6, 0, 0), summary: { questions: 10, tests: 2, recoveryBackups: 1 } }
  };

  await page.evaluate((state) => {
    window.__deviceSyncState = state;
    window.__deviceSyncActions = [];
    window.__deviceSyncResult = { action: 'used-local', state };
    window.__deviceSyncError = '';
    window.BoardsDriveBackup = {
      getSyncState: () => window.__deviceSyncState,
      syncLatest: async () => {
        window.__deviceSyncActions.push('syncLatest');
        if (window.__deviceSyncError) throw new Error(window.__deviceSyncError);
        return window.__deviceSyncResult;
      },
      chooseSource: async (source) => {
        window.__deviceSyncActions.push(`choose:${source}`);
        return { action: source === 'local' ? 'used-local' : 'used-drive', state: window.__deviceSyncState };
      },
      connect: () => window.__deviceSyncActions.push('connect')
    };
    window.dispatchEvent(new CustomEvent('ksboards:drive-sync-state', { detail: state }));
  }, localNewer);
  await new Promise((resolve) => setTimeout(resolve, 100));

  report.localNewer = await page.evaluate(() => ({
    status: document.getElementById('deviceSyncStatus')?.textContent || '',
    recommendation: document.getElementById('deviceSyncRecommendation')?.textContent || '',
    primary: document.getElementById('deviceSyncNow')?.textContent || '',
    localTime: document.getElementById('deviceSyncLocalTime')?.textContent || '',
    driveTime: document.getElementById('deviceSyncDriveTime')?.textContent || '',
    localSummary: document.getElementById('deviceSyncLocalSummary')?.textContent || '',
    driveSummary: document.getElementById('deviceSyncDriveSummary')?.textContent || ''
  }));
  if (!report.localNewer.status.includes('This device is newer') || !report.localNewer.recommendation.includes('update Google Drive from this device')) report.failures.push('Local-newer automatic direction is not clear.');
  if (!report.localNewer.primary.includes('Sync newest copy')) report.failures.push('The primary automatic sync action is unclear for a newer local copy.');
  if (!report.localNewer.localTime.includes('2026') || !report.localNewer.driveTime.includes('2026')) report.failures.push('Both comparison timestamps were not displayed.');
  if (!report.localNewer.localSummary.includes('12 questions') || !report.localNewer.driveSummary.includes('10 questions')) report.failures.push('Both comparison summaries were not displayed.');

  await page.$eval('#deviceSyncNow', (button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 100));
  report.automaticLocal = await page.evaluate(() => ({ actions: window.__deviceSyncActions.slice(), dialogOpen: !!document.getElementById('deviceSyncChoiceDialog')?.open }));
  if (!report.automaticLocal.actions.includes('syncLatest') || report.automaticLocal.dialogOpen) report.failures.push('Clear local-newer sync did not run automatically without opening the fallback dialog.');

  const driveNewer = Object.assign({}, localNewer, {
    relation: 'drive-newer',
    local: { updatedAt: Date.UTC(2026, 6, 19, 6, 0, 0), summary: localNewer.local.summary },
    drive: { updatedAt: Date.UTC(2026, 6, 19, 8, 0, 0), summary: localNewer.drive.summary }
  });
  await page.evaluate((state) => {
    window.__deviceSyncState = state;
    window.__deviceSyncResult = { action: 'used-drive', state };
    window.dispatchEvent(new CustomEvent('ksboards:drive-sync-state', { detail: state }));
  }, driveNewer);
  await new Promise((resolve) => setTimeout(resolve, 100));
  report.driveNewer = await page.evaluate(() => ({ status: document.getElementById('deviceSyncStatus')?.textContent || '', recommendation: document.getElementById('deviceSyncRecommendation')?.textContent || '' }));
  if (!report.driveNewer.status.includes('Drive is newer') || !report.driveNewer.recommendation.includes('update this device from Google Drive')) report.failures.push('Drive-newer automatic direction is not clear.');

  const inSync = Object.assign({}, localNewer, { relation: 'in-sync' });
  await page.evaluate((state) => {
    window.__deviceSyncState = state;
    window.__deviceSyncResult = { action: 'in-sync', state };
    window.dispatchEvent(new CustomEvent('ksboards:drive-sync-state', { detail: state }));
  }, inSync);
  await new Promise((resolve) => setTimeout(resolve, 100));
  report.inSync = await page.evaluate(() => ({ status: document.getElementById('deviceSyncStatus')?.textContent || '', primary: document.getElementById('deviceSyncNow')?.textContent || '' }));
  if (!report.inSync.status.includes('In sync') || !report.inSync.primary.includes('Check again')) report.failures.push('In-sync state did not become a safe no-op recheck.');

  const ambiguous = Object.assign({}, localNewer, { relation: 'different' });
  await page.evaluate((state) => {
    window.__deviceSyncState = state;
    window.__deviceSyncResult = { action: 'needs-choice', state };
    window.__deviceSyncError = '';
    window.dispatchEvent(new CustomEvent('ksboards:drive-sync-state', { detail: state }));
  }, ambiguous);
  await page.$eval('#deviceSyncNow', (button) => button.click());
  await page.waitForFunction(() => document.getElementById('deviceSyncChoiceDialog')?.open === true, { timeout: 3000 });
  report.ambiguous = await page.evaluate(() => ({
    open: !!document.getElementById('deviceSyncChoiceDialog')?.open,
    reason: document.getElementById('deviceSyncChoiceReason')?.textContent || '',
    localEnabled: !document.getElementById('deviceSyncChooseLocal')?.disabled,
    driveEnabled: !document.getElementById('deviceSyncChooseDrive')?.disabled,
    localTime: document.getElementById('deviceSyncChoiceLocalTime')?.textContent || '',
    driveTime: document.getElementById('deviceSyncChoiceDriveTime')?.textContent || ''
  }));
  if (!report.ambiguous.open || (!report.ambiguous.reason.includes('could not') && !report.ambiguous.reason.includes('do not identify'))) report.failures.push('Ambiguous automatic sync did not open an explanatory source-choice dialog.');
  if (!report.ambiguous.localEnabled || !report.ambiguous.driveEnabled) report.failures.push('Both manual source directions were not available for an ambiguous comparison.');
  if (!report.ambiguous.localTime.includes('2026') || !report.ambiguous.driveTime.includes('2026')) report.failures.push('The fallback dialog did not show both timestamps.');

  await page.$eval('#deviceSyncChooseLocal', (button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 150));
  report.manualLocal = await page.evaluate(() => ({ actions: window.__deviceSyncActions.slice() }));
  if (!report.manualLocal.actions.includes('choose:local')) report.failures.push('The fallback dialog did not push the selected local source.');

  await page.evaluate(() => {
    const dialog = document.getElementById('deviceSyncChoiceDialog');
    if (dialog?.open) dialog.close();
    window.__deviceSyncError = 'Simulated sync failure';
    window.__deviceSyncResult = null;
  });
  await page.$eval('#deviceSyncNow', (button) => button.click());
  await page.waitForFunction(() => document.getElementById('deviceSyncChoiceDialog')?.open === true, { timeout: 3000 });
  report.errorFallback = await page.evaluate(() => ({ open: !!document.getElementById('deviceSyncChoiceDialog')?.open, reason: document.getElementById('deviceSyncChoiceReason')?.textContent || '' }));
  if (!report.errorFallback.open || !report.errorFallback.reason.includes('Simulated sync failure')) report.failures.push('A synchronization error did not open the fallback source-choice dialog.');

  await page.evaluate(() => { const dialog = document.getElementById('deviceSyncChoiceDialog'); if (dialog?.open) dialog.close(); });
  await page.$eval('#deviceSyncDetails', (button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 700));
  report.detailsVisible = await page.$eval('#driveBackupSection', (section) => { const box = section.getBoundingClientRect(); return box.top < window.innerHeight && box.bottom > 0; });
  if (!report.detailsVisible) report.failures.push('More sync details did not bring the detailed Drive controls into view.');

  report.finalSentinelPreserved = await page.evaluate(() => JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter === 'A');
  if (!report.finalSentinelPreserved) report.failures.push('Automatic or fallback Device Sync altered browser study data during comparison tests.');
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
console.log('Automatic Device Sync browser smoke test passed.');
