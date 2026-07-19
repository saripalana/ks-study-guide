import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = { generatedAt: new Date().toISOString(), passed: false, steps: {}, failures: [], errors: [] };
const reportPath = path.join(root, 'full-platform-consistency-report.json');
const ksShot = path.join(root, 'full-platform-ks.png');
const futureShot = path.join(root, 'full-platform-future.png');

function assert(value, message) { if (!value) report.failures.push(message); }
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
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  page.on('dialog', async (dialog) => { await dialog.accept(); });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    else request.continue();
  });

  const futureQuestions = [
    { id: 'future-1', chapter: 1, qnum: 1, chapterTitle: 'Future Basics', question: 'Future bank question one?', choices: ['Correct', 'Incorrect'], choiceLetters: ['A', 'B'], correctLetter: 'A', explanation: 'A is correct.' },
    { id: 'future-2', chapter: 2, qnum: 1, chapterTitle: 'Future Advanced', question: 'Future bank question two?', choices: ['Incorrect', 'Correct'], choiceLetters: ['A', 'B'], correctLetter: 'B', explanation: 'B is correct.' }
  ];

  await page.evaluateOnNewDocument((questions) => {
    window.BOARDS_QUESTION_BANKS = [{
      id: 'future-psychiatry-bank',
      title: 'Future Psychiatry Bank',
      shortTitle: 'Future Bank',
      description: 'Validated test bank for full platform quality control.',
      status: 'active',
      source: 'quality-control fixture',
      sourceFile: 'generated/future-bank.js',
      questions
    }];

    const ksState = { answered: { 'k-1.1': { selectedLetter: 'A', correct: true } }, testAnswers: {}, testSubmitted: {}, flagged: { 'k-1.2': true }, missed: {}, index: 0, view: 'study', atSummary: false };
    const ksTest = {
      schemaVersion: 2,
      setId: 'ks-completed-legacy',
      mode: 'test',
      timed: true,
      createdAt: Date.now() - 60000,
      completedAt: Date.now() - 30000,
      total: 1,
      answered: 1,
      correct: 1,
      incorrect: 0,
      omitted: 0,
      scorePct: 100,
      averageSeconds: 30,
      ids: ['k-1.1'],
      results: { 'k-1.1': { status: 'correct', selectedLetter: 'A', seconds: 30 } },
      categories: []
    };
    const ksBackup = {
      id: 'ks-backup-legacy',
      createdAt: Date.now() - 20000,
      reason: 'Legacy K&S backup fixture',
      metadata: {},
      state: { schemaVersion: 2, projectId: 'psychiatry-board-practice', app: 'ks-study-guide', createdAt: Date.now() - 20000, reason: 'Legacy K&S backup fixture', hash: 'legacy', data: { kaplanBoardPrepState: ksState } }
    };
    localStorage.setItem('kaplanBoardPrepState', JSON.stringify(ksState));
    localStorage.setItem('ksBoardsTestsV3', JSON.stringify([ksTest]));
    localStorage.setItem('ksBoardsBackupsV1', JSON.stringify([ksBackup]));
    localStorage.setItem('future-sentinel-outside-app', 'preserve');
  }, futureQuestions);

  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#questionBankSelector', { timeout: 15000 });
  await page.waitForSelector('#testHistory .history-row', { timeout: 15000 });
  await page.waitForSelector('#backupHistory .backup-row', { timeout: 15000 });

  report.steps.ksNormalized = await page.evaluate(() => {
    const tests = JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]');
    const backups = JSON.parse(localStorage.getItem('ksBoardsBackupsV1') || '[]');
    const consistency = window.BoardsBankConsistency.validateCurrentState();
    let wrongBankRejected = false;
    try {
      window.BoardsStore.applySnapshot({
        schemaVersion: 3,
        projectId: 'psychiatry-board-practice',
        bankId: 'future-psychiatry-bank',
        bankTitle: 'Future Psychiatry Bank',
        data: { kaplanBoardPrepState: {} }
      });
    } catch (error) { wrongBankRejected = /Switch banks before restoring/i.test(error.message); }
    let firewallBlocked = false;
    try { localStorage.setItem('abpnBank:future-psychiatry-bank:tests', '[]'); }
    catch (error) { firewallBlocked = /Cross-bank storage write blocked/i.test(error.message); }
    return {
      activeBank: window.BoardsConfig.bank.id,
      questionCount: window.BoardsCore.fullBank.length,
      testBankId: tests[0]?.bankId,
      testResultBankId: tests[0]?.results?.['k-1.1']?.bankId,
      backupBankId: backups[0]?.bankId,
      snapshotBankId: backups[0]?.state?.bankId,
      historyRows: document.querySelectorAll('#testHistory .history-row').length,
      backupRows: document.querySelectorAll('#backupHistory .backup-row').length,
      historyHeading: document.querySelector('#analyticsSection .dashboard-card:nth-child(2) h3')?.textContent || '',
      resetHeading: document.querySelector('#progressManagementSection .dashboard-card:first-child h3')?.textContent || '',
      wrongBankRejected,
      firewallBlocked,
      consistency
    };
  });
  const ks = report.steps.ksNormalized;
  assert(ks.activeBank === 'ks-psychiatry-core' && ks.questionCount === 602, 'K&S did not initialize as the protected 602-question bank.');
  assert(ks.testBankId === 'ks-psychiatry-core' && ks.testResultBankId === 'ks-psychiatry-core', 'Legacy K&S completed-test records were not normalized with bank identity.');
  assert(ks.backupBankId === 'ks-psychiatry-core' && ks.snapshotBankId === 'ks-psychiatry-core', 'Legacy K&S recovery backup was not normalized with bank identity.');
  assert(ks.historyRows === 1 && ks.backupRows === 1 && /K&S Psychiatry/.test(ks.historyHeading) && /K&S Psychiatry/.test(ks.resetHeading), 'K&S completed-set, recovery, or panel labeling is inconsistent.');
  assert(ks.wrongBankRejected && ks.firewallBlocked && ks.consistency?.valid, 'K&S cross-bank restore/write safeguards did not hold.');
  await page.screenshot({ path: ksShot, fullPage: false });

  await page.$eval('#questionBankSelector', (element) => { element.open = true; });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.click('.question-bank-option[data-bank-id="future-psychiatry-bank"]')
  ]);
  await page.waitForSelector('#questionBankSelector', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.bank-tile').length === 2, { timeout: 15000 });

  await page.evaluate(() => {
    const C = window.BoardsCore;
    const config = C.createConfig(['future-1'], 'test', false, null, 'quality-control');
    const state = C.appState();
    state.testAnswers['future-1'] = 'A';
    state.testSubmitted['all|study'] = true;
    C.writeJson(C.KEY.app, state, { reason: 'QC future answer' });
    config.status = 'completed';
    config.completedAt = Date.now();
    config.questionTimes['future-1'] = 12.345;
    C.writeJson(C.KEY.config, config, { reason: 'QC future test completed' });
    window.BoardsAnalytics.render();
    window.BoardsMaintenance.backupNow('QC future backup', { type: 'quality-control' });
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('abpnBank:future-psychiatry-bank:tests') || '[]').length === 1, { timeout: 10000 });
  await page.waitForSelector('#testHistory .history-row', { timeout: 10000 });
  await page.waitForSelector('#backupHistory .backup-row', { timeout: 10000 });

  report.steps.futureCompleted = await page.evaluate(() => {
    const prefix = 'abpnBank:future-psychiatry-bank:';
    const tests = JSON.parse(localStorage.getItem(prefix + 'tests') || '[]');
    const backups = JSON.parse(localStorage.getItem(prefix + 'backups') || '[]');
    const ksTests = JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]');
    const ksState = JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}');
    const resetKeys = window.BoardsHardResetService.activeLocalKeys();
    let wrongBankRejected = false;
    try {
      window.BoardsStore.applySnapshot({ schemaVersion: 3, projectId: 'psychiatry-board-practice', bankId: 'ks-psychiatry-core', data: { [prefix + 'appState']: {} } });
    } catch (error) { wrongBankRejected = /Switch banks before restoring/i.test(error.message); }
    document.getElementById('openHardReset').click();
    return {
      activeBank: window.BoardsConfig.bank.id,
      tests: tests.length,
      testBankId: tests[0]?.bankId,
      resultBankId: tests[0]?.results?.['future-1']?.bankId,
      backups: backups.length,
      backupBankId: backups[0]?.bankId,
      snapshotBankId: backups[0]?.state?.bankId,
      historyRows: document.querySelectorAll('#testHistory .history-row').length,
      ksTests: ksTests.length,
      ksAnswer: ksState.answered?.['k-1.1']?.selectedLetter,
      resetKeys,
      resetTitle: document.getElementById('hardResetTitle')?.textContent || '',
      resetCopy: document.querySelector('#hardResetModal .hard-reset-dialog > p')?.textContent || '',
      vaultHeading: document.querySelector('#questionVaultSection .dashboard-card:first-child h3')?.textContent || '',
      wrongBankRejected,
      consistency: window.BoardsBankConsistency.validateCurrentState()
    };
  });
  const future = report.steps.futureCompleted;
  assert(future.activeBank === 'future-psychiatry-bank' && future.tests === 1 && future.historyRows === 1, 'Future bank completed set was not archived/rendered independently.');
  assert(future.testBankId === 'future-psychiatry-bank' && future.resultBankId === 'future-psychiatry-bank', 'Future completed-test provenance is missing.');
  assert(future.backups >= 1 && future.backupBankId === 'future-psychiatry-bank' && future.snapshotBankId === 'future-psychiatry-bank', 'Future recovery backup is not bank-bound.');
  assert(future.ksTests === 1 && future.ksAnswer === 'A', 'Future bank activity altered K&S completed tests or answers.');
  assert(future.resetKeys.every((key) => key.startsWith('abpnBank:future-psychiatry-bank:')), 'Future active reset key list contains another bank’s key.');
  assert(/Future Bank/.test(future.resetTitle) && /Future Psychiatry Bank/.test(future.resetCopy) && /Future Bank/.test(future.vaultHeading), 'Future reset or vault UI does not clearly identify the active bank.');
  assert(future.wrongBankRejected && future.consistency?.valid, 'Future wrong-bank restore or consistency validation failed.');

  await page.evaluate(() => document.getElementById('cancelHardReset').click());
  await page.evaluate(() => window.BoardsMaintenance.resetQuestions(['future-1'], 'quality-control reset'));
  await new Promise((resolve) => setTimeout(resolve, 300));
  report.steps.futureReset = await page.evaluate(() => {
    const futureState = JSON.parse(localStorage.getItem('abpnBank:future-psychiatry-bank:appState') || '{}');
    const ksState = JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}');
    return {
      futureAnswer: futureState.testAnswers?.['future-1'] || futureState.answered?.['future-1'] || null,
      ksAnswer: ksState.answered?.['k-1.1']?.selectedLetter,
      ksTests: JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]').length,
      futureTests: JSON.parse(localStorage.getItem('abpnBank:future-psychiatry-bank:tests') || '[]').length
    };
  });
  assert(!report.steps.futureReset.futureAnswer, 'Future question reset did not clear the selected future answer.');
  assert(report.steps.futureReset.ksAnswer === 'A' && report.steps.futureReset.ksTests === 1, 'Future question reset altered K&S data.');
  assert(report.steps.futureReset.futureTests === 1, 'Question reset incorrectly deleted completed-set history.');
  await page.screenshot({ path: futureShot, fullPage: false });

  await page.$eval('#questionBankSelector', (element) => { element.open = true; });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.click('.question-bank-option[data-bank-id="ks-psychiatry-core"]')
  ]);
  await page.waitForSelector('#testHistory .history-row', { timeout: 15000 });

  report.steps.returnedToKs = await page.evaluate(() => ({
    activeBank: window.BoardsConfig.bank.id,
    ksTests: JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]').length,
    ksAnswer: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter,
    futureTests: JSON.parse(localStorage.getItem('abpnBank:future-psychiatry-bank:tests') || '[]').length,
    historyRows: document.querySelectorAll('#testHistory .history-row').length,
    selectedTitle: document.getElementById('activeBuilderBankTitle')?.textContent || '',
    resetKeys: window.BoardsHardResetService.activeLocalKeys(),
    consistency: window.BoardsBankConsistency.validateCurrentState()
  }));
  const returned = report.steps.returnedToKs;
  assert(returned.activeBank === 'ks-psychiatry-core' && returned.ksTests === 1 && returned.ksAnswer === 'A' && returned.historyRows === 1, 'K&S state did not return intact after future-bank use.');
  assert(returned.futureTests === 1, 'Future completed-set history disappeared after returning to K&S.');
  assert(/K&S Psychiatry/.test(returned.selectedTitle) && returned.consistency?.valid, 'K&S selector or consistency state is incorrect after switching back.');
  assert(returned.resetKeys.every((key) => !key.startsWith('abpnBank:future-psychiatry-bank:')), 'K&S active reset key list contains the future bank namespace.');

  assert(report.errors.length === 0, `Unexpected browser errors: ${report.errors.join(' | ')}`);
  report.passed = report.failures.length === 0;
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
  console.error(`Full platform consistency smoke test failed:\n- ${report.failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Full K&S/future-bank completed sets, analytics, backup, restore, reset, selector, and isolation matrix passed.');