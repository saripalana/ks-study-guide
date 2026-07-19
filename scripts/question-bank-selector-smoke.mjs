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
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  page.on('dialog', async (dialog) => { await dialog.accept(); });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('https://accounts.google.com/')) request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
    else request.continue();
  });

  const sentinel = { answered: { 'k-1.1': { selectedLetter: 'A', correct: true } }, testAnswers: {}, testSubmitted: {}, flagged: {}, missed: {}, atSummary: false, index: 0, view: 'study' };
  const futureQuestions = [
    { id: 'future-1', chapter: 1, qnum: 1, chapterTitle: 'Future Bank Basics', question: 'Which option is correct for future question one?', choices: ['Correct option', 'Incorrect option'], choiceLetters: ['A', 'B'], correctLetter: 'A', explanation: 'A is correct.' },
    { id: 'future-2', chapter: 2, qnum: 1, chapterTitle: 'Future Bank Advanced', question: 'Which option is correct for future question two?', choices: ['Incorrect option', 'Correct option'], choiceLetters: ['A', 'B'], correctLetter: 'B', explanation: 'B is correct.' }
  ];

  await page.evaluateOnNewDocument((values) => {
    window.BOARDS_QUESTION_BANKS = [
      { id: 'future-psychiatry-bank', title: 'Future Psychiatry Bank', shortTitle: 'Future Bank', description: 'A validated test bank used to verify bank switching.', status: 'active', source: 'browser-smoke', questions: values.futureQuestions },
      { id: 'draft-bank', title: 'Draft Bank', shortTitle: 'Draft', description: 'Not ready for practice.', status: 'draft', source: 'browser-smoke', questions: [] }
    ];
    localStorage.setItem('kaplanBoardPrepState', JSON.stringify(values.sentinel));
  }, { futureQuestions, sentinel });

  await page.goto(`${baseUrl}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#questionBankSelector', { timeout: 15000 });
  await page.waitForSelector('.question-bank-option[data-bank-id="future-psychiatry-bank"]', { timeout: 10000 });

  report.initial = await page.evaluate(() => ({
    activeId: window.BoardsQuestionBankRegistry?.activeBank().id,
    title: document.getElementById('activeBuilderBankTitle')?.textContent || '',
    count: document.getElementById('activeBuilderBankCount')?.textContent || '',
    options: document.querySelectorAll('.question-bank-option').length,
    draftDisabled: !!document.querySelector('.question-bank-option[data-bank-id="draft-bank"]')?.disabled,
    appKey: window.BoardsConfig?.storage?.keys?.app,
    driveFile: window.BoardsConfig?.drive?.currentFile,
    tiles: document.querySelectorAll('.bank-tile').length,
    sentinel: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter
  }));

  if (report.initial.activeId !== 'ks-psychiatry-core') report.failures.push(`Initial bank was ${report.initial.activeId}.`);
  if (!report.initial.title.includes('K&S Psychiatry') || report.initial.count !== '602') report.failures.push('The K&S selector summary did not show the correct title and count.');
  if (report.initial.options !== 3 || !report.initial.draftDisabled) report.failures.push('Registered ready and draft banks were not listed safely.');
  if (report.initial.appKey !== 'kaplanBoardPrepState' || report.initial.driveFile !== 'psychiatry-board-current-v1.json') report.failures.push('K&S legacy storage or Drive identity changed.');
  if (report.initial.tiles !== 602 || report.initial.sentinel !== 'A') report.failures.push('K&S questions or existing progress were not preserved.');

  await page.$eval('#questionBankSelector', (details) => { details.open = true; });
  await page.screenshot({ path: path.join(root, 'question-bank-selector-ks.png'), fullPage: false });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.click('.question-bank-option[data-bank-id="future-psychiatry-bank"]')
  ]);
  await page.waitForSelector('#questionBankSelector', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.bank-tile').length === 2, { timeout: 15000 });

  report.future = await page.evaluate(() => {
    const prefix = 'abpnBank:future-psychiatry-bank:';
    return {
      activeId: window.BoardsQuestionBankRegistry?.activeBank().id,
      title: document.getElementById('activeBuilderBankTitle')?.textContent || '',
      count: document.getElementById('activeBuilderBankCount')?.textContent || '',
      tiles: document.querySelectorAll('.bank-tile').length,
      appKey: window.BoardsConfig?.storage?.keys?.app,
      configKey: window.BoardsConfig?.storage?.keys?.config,
      driveFile: window.BoardsConfig?.drive?.currentFile,
      vaultMaster: window.BoardsConfig?.questionVault?.files?.master,
      namespaced: window.BoardsConfig?.storage?.keys?.app?.startsWith(prefix),
      ksSentinel: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter
    };
  });

  if (report.future.activeId !== 'future-psychiatry-bank' || !report.future.title.includes('Future Psychiatry') || report.future.count !== '2') report.failures.push('The future bank did not become the active selector choice.');
  if (report.future.tiles !== 2 || !report.future.namespaced) report.failures.push('The future bank did not load two questions with isolated browser storage.');
  if (!report.future.driveFile.includes('future-psychiatry-bank') || !report.future.vaultMaster.includes('future-psychiatry-bank')) report.failures.push('Future-bank Drive files were not isolated.');
  if (report.future.ksSentinel !== 'A') report.failures.push('Switching banks altered K&S progress.');

  await page.$eval('#questionCount', (input) => { input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#startNewSetBtn');
  await page.waitForSelector('#examScreen:not([hidden])', { timeout: 10000 });
  await page.waitForFunction(() => {
    const frame = document.getElementById('examFrame');
    return frame && frame.contentDocument && frame.contentDocument.getElementById('boardsDashboard');
  }, { timeout: 30000 });

  const examFrame = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
  if (!examFrame) throw new Error('The bank-aware exam iframe did not load.');
  await examFrame.waitForSelector('.choice', { timeout: 10000 });
  const examIdentity = await examFrame.evaluate(() => ({
    heading: document.querySelector('.boards-exam-subtitle')?.textContent || '',
    question: document.querySelector('.question-text')?.textContent || '',
    footer: document.querySelector('#studyScreen footer')?.textContent || ''
  }));
  if (!examIdentity.heading.includes('Future Bank') || !examIdentity.question.includes('future question') || !examIdentity.footer.includes('Future Psychiatry Bank')) report.failures.push('The exam iframe did not use the selected bank identity and questions.');

  await examFrame.click('.choice');
  await examFrame.click('#boardsDashboard');
  await page.waitForSelector('#dashboardScreen:not([hidden])', { timeout: 10000 });

  report.saved = await page.evaluate(() => {
    const configKey = 'abpnBank:future-psychiatry-bank:activeSet';
    const appKey = 'abpnBank:future-psychiatry-bank:appState';
    const config = JSON.parse(localStorage.getItem(configKey) || 'null');
    const app = JSON.parse(localStorage.getItem(appKey) || '{}');
    return {
      bankId: config?.bankId,
      ids: config?.ids || [],
      futureAnswers: Object.keys(app.testAnswers || {}).length + Object.keys(app.answered || {}).length,
      ksSentinel: JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}').answered?.['k-1.1']?.selectedLetter
    };
  });
  if (report.saved.bankId !== 'future-psychiatry-bank' || report.saved.ids.length !== 1 || report.saved.futureAnswers < 1) report.failures.push('The future-bank practice set or answer was not saved in its namespace.');
  if (report.saved.ksSentinel !== 'A') report.failures.push('Future-bank exam activity changed K&S progress.');

  await page.screenshot({ path: path.join(root, 'question-bank-selector-future.png'), fullPage: false });
  if (report.errors.length) report.failures.push(`Browser errors detected: ${report.errors.join(' | ')}`);
  report.passed = report.failures.length === 0;
  await page.close();
} catch (error) {
  report.failures.push(error && error.stack ? error.stack : String(error));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(path.join(root, 'question-bank-selector-report.json'), JSON.stringify(report, null, 2));
}

if (!report.passed) {
  console.error(`Question-bank selector browser smoke test failed:\n- ${report.failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Expandable question-bank selector and real second-bank exam flow passed.');