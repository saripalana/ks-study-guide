import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = { generatedAt: new Date().toISOString(), passed: false, failures: [], errors: [], banks: {} };
const fail = (message) => report.failures.push(message);

function chromePath() {
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
  browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  page.on('dialog', async (dialog) => dialog.accept());
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    else request.continue();
  });

  const banks = [
    {
      id: 'sample-bank-alpha', title: 'Sample Psychiatry Bank Alpha', shortTitle: 'Bank Alpha', description: 'Import readiness bank alpha.', status: 'active', source: 'QC fixture', sourceFile: 'generated/sample-alpha.js',
      questions: [
        { id: 'alpha-1', chapter: 1, qnum: 1, chapterTitle: 'Alpha One', question: 'Alpha question one?', choices: ['Correct', 'Incorrect'], choiceLetters: ['A', 'B'], correctLetter: 'A', explanation: 'A is correct.' },
        { id: 'alpha-2', chapter: 2, qnum: 1, chapterTitle: 'Alpha Two', question: 'Alpha question two?', choices: ['Incorrect', 'Correct'], choiceLetters: ['A', 'B'], correctLetter: 'B', explanation: 'B is correct.' }
      ]
    },
    {
      id: 'sample-bank-beta', title: 'Sample Psychiatry Bank Beta', shortTitle: 'Bank Beta', description: 'Import readiness bank beta.', status: 'active', source: 'QC fixture', sourceFile: 'generated/sample-beta.js',
      questions: [
        { id: 'beta-1', chapter: 3, qnum: 1, chapterTitle: 'Beta One', question: 'Beta question one?', choices: ['Correct', 'Incorrect', 'Other'], choiceLetters: ['A', 'B', 'C'], correctLetter: 'A', explanation: 'A is correct.' },
        { id: 'beta-2', chapter: 4, qnum: 1, chapterTitle: 'Beta Two', question: 'Beta question two?', choices: ['Incorrect', 'Correct', 'Other'], choiceLetters: ['A', 'B', 'C'], correctLetter: 'B', explanation: 'B is correct.' },
        { id: 'beta-3', chapter: 4, qnum: 2, chapterTitle: 'Beta Two', question: 'Beta question three?', choices: ['Incorrect', 'Other', 'Correct'], choiceLetters: ['A', 'B', 'C'], correctLetter: 'C', explanation: 'C is correct.' }
      ]
    }
  ];

  await page.evaluateOnNewDocument((definitions) => { window.BOARDS_QUESTION_BANKS = definitions; }, banks);
  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#questionBankSelector', { timeout: 15000 });

  const initial = await page.evaluate(() => {
    const registry = window.BoardsQuestionBankRegistry;
    const before = registry.list().map((bank) => bank.id);
    let malformedRejected = false;
    let duplicateRejected = false;
    try {
      registry.register({ id: 'bad-bank', title: 'Bad Bank', status: 'active', questions: [{ id: 'bad-1', question: '', choices: ['A', 'B'], choiceLetters: ['A', 'B'], correctLetter: 'A' }] });
    } catch (error) { malformedRejected = /no question text/i.test(error.message); }
    try {
      registry.register({ id: 'sample-bank-alpha', title: 'Conflicting Alpha', status: 'active', questions: [{ id: 'other', question: 'Different?', choices: ['A', 'B'], choiceLetters: ['A', 'B'], correctLetter: 'A' }] });
    } catch (error) { duplicateRejected = /conflicting definition/i.test(error.message); }
    return {
      siteEyebrow: document.querySelector('.dashboard-eyebrow')?.textContent || '',
      siteTitle: document.querySelector('.dashboard-topbar h1')?.textContent || '',
      documentTitle: document.title,
      activeBank: registry.activeBank().id,
      catalogBefore: before,
      catalogAfter: registry.list().map((bank) => bank.id),
      selectorOptions: Array.from(document.querySelectorAll('.question-bank-option')).map((button) => button.getAttribute('data-bank-id')),
      malformedRejected,
      duplicateRejected,
      syncButtons: document.querySelectorAll('#deviceSyncCard button:not([hidden])').length
    };
  });
  report.initial = initial;
  if (initial.siteEyebrow !== 'ABPN PSYCHIATRY STUDY' || initial.siteTitle !== 'ABPN Psychiatry Study' || initial.documentTitle !== 'ABPN Psychiatry Study') fail('Global ABPN site identity is not stable before importing additional banks.');
  if (initial.activeBank !== 'ks-psychiatry-core') fail('K&S is not the default active bank.');
  if (initial.catalogBefore.length !== 3 || initial.catalogAfter.length !== 3 || initial.selectorOptions.length !== 3) fail('Three-bank catalog/selector population is inconsistent.');
  if (!initial.malformedRejected || !initial.duplicateRejected) fail('Malformed or conflicting bank registration was not rejected safely.');
  if (initial.syncButtons !== 1) fail(`Expected exactly one visible Device Sync button, found ${initial.syncButtons}.`);

  async function switchBank(bankId) {
    await page.$eval('#questionBankSelector', (details) => { details.open = true; });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click(`.question-bank-option[data-bank-id="${bankId}"]`)
    ]);
    await page.waitForSelector('#questionBankSelector', { timeout: 15000 });
  }

  for (const bank of banks) {
    await switchBank(bank.id);
    await page.waitForFunction((count) => document.querySelectorAll('.bank-tile').length === count, { timeout: 10000 }, bank.questions.length);
    const state = await page.evaluate((definition) => {
      const C = window.BoardsCore;
      const config = C.createConfig([definition.questions[0].id], 'quiz', false, null, 'import-readiness');
      config.status = 'in_progress';
      C.writeJson(C.KEY.config, config, { reason: 'Import readiness active set' });
      const app = C.appState();
      app.answered[definition.questions[0].id] = { selectedLetter: definition.questions[0].correctLetter, correct: true };
      C.writeJson(C.KEY.app, app, { reason: 'Import readiness answer' });
      window.BoardsMaintenance.backupNow('Import readiness backup', { bankId: definition.id });
      return {
        activeId: window.BoardsConfig.bank.id,
        activeTitle: window.BoardsConfig.bank.title,
        siteTitle: document.querySelector('.dashboard-topbar h1')?.textContent || '',
        documentTitle: document.title,
        selectorTitle: document.getElementById('activeBuilderBankTitle')?.textContent || '',
        tiles: document.querySelectorAll('.bank-tile').length,
        appKey: window.BoardsConfig.storage.keys.app,
        configKey: window.BoardsConfig.storage.keys.config,
        testsKey: window.BoardsConfig.storage.keys.tests,
        backupsKey: window.BoardsConfig.storage.keys.localBackups,
        currentFile: window.BoardsConfig.drive.currentFile,
        historyFile: window.BoardsConfig.drive.historyFile,
        vaultPath: window.BoardsVaultBankScope.path(),
        configBankId: C.activeConfig()?.bankId,
        answerSaved: C.appState().answered[definition.questions[0].id]?.correct === true,
        backupBankId: C.readJson(C.KEY.localBackups, [])[0]?.bankId,
        consistency: window.BoardsBankConsistency.validateCurrentState()
      };
    }, bank);
    report.banks[bank.id] = state;
    if (state.activeId !== bank.id || state.activeTitle !== bank.title || state.selectorTitle !== bank.title) fail(`${bank.id} identity did not propagate to bank-specific areas.`);
    if (state.siteTitle !== 'ABPN Psychiatry Study' || state.documentTitle !== 'ABPN Psychiatry Study') fail(`${bank.id} leaked into global site identity.`);
    if (state.tiles !== bank.questions.length || !state.answerSaved || state.configBankId !== bank.id || state.backupBankId !== bank.id) fail(`${bank.id} active set, answer, or backup did not remain bank-bound.`);
    if (![state.appKey, state.configKey, state.testsKey, state.backupsKey].every((key) => key.startsWith(`abpnBank:${bank.id}:`))) fail(`${bank.id} browser storage keys are not isolated.`);
    if (!state.currentFile.includes(bank.id) || !state.historyFile.includes(bank.id) || !state.vaultPath.includes(bank.id)) fail(`${bank.id} Drive or Question Vault identity is not isolated.`);
    if (!state.consistency?.valid) fail(`${bank.id} consistency validation failed.`);
  }

  await switchBank('ks-psychiatry-core');
  const final = await page.evaluate(() => ({
    activeBank: window.BoardsConfig.bank.id,
    questionCount: window.BoardsCore.fullBank.length,
    siteTitle: document.querySelector('.dashboard-topbar h1')?.textContent || '',
    alphaAnswer: JSON.parse(localStorage.getItem('abpnBank:sample-bank-alpha:appState') || '{}').answered?.['alpha-1']?.correct,
    betaAnswer: JSON.parse(localStorage.getItem('abpnBank:sample-bank-beta:appState') || '{}').answered?.['beta-1']?.correct,
    alphaConfigBank: JSON.parse(localStorage.getItem('abpnBank:sample-bank-alpha:activeSet') || '{}').bankId,
    betaConfigBank: JSON.parse(localStorage.getItem('abpnBank:sample-bank-beta:activeSet') || '{}').bankId,
    visibleSyncButtons: document.querySelectorAll('#deviceSyncCard button:not([hidden])').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  report.final = final;
  if (final.activeBank !== 'ks-psychiatry-core' || final.questionCount !== 602) fail('Returning to K&S did not restore the protected 602-question bank.');
  if (final.siteTitle !== 'ABPN Psychiatry Study') fail('Global site identity changed after multiple bank switches.');
  if (!final.alphaAnswer || !final.betaAnswer || final.alphaConfigBank !== 'sample-bank-alpha' || final.betaConfigBank !== 'sample-bank-beta') fail('Imported bank state did not persist independently after switching back to K&S.');
  if (final.visibleSyncButtons !== 1 || final.overflow) fail('One-button sync or layout consistency failed after multiple bank switches.');
  if (report.errors.length) fail(`Browser errors detected: ${report.errors.join(' | ')}`);

  report.passed = report.failures.length === 0;
  await page.screenshot({ path: path.join(root, 'qbank-import-readiness.png'), fullPage: false });
} catch (error) {
  fail(error && error.stack ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  report.passed = report.failures.length === 0;
  fs.writeFileSync(path.join(root, 'qbank-import-readiness-report.json'), JSON.stringify(report, null, 2));
}

if (!report.passed) {
  console.error(`Question-bank import readiness failed:\n- ${report.failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Three-bank registration, rejection, switching, persistence, storage, Drive, and site-identity readiness passed.');