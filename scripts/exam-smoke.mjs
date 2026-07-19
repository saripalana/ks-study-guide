import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'exam-smoke-report.json');
const screenshotPath = path.join(root, 'exam-smoke-dashboard.png');
const report = { generatedAt: new Date().toISOString(), passed: false, steps: {}, failures: [] };

function assert(value, message) {
  if (!value) report.failures.push(message);
}

function executablePath() {
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

function mime(file) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }
  const relative = pathname === '/' ? 'boards.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

async function examFrame(page) {
  await page.waitForFunction(() => {
    const frame = document.getElementById('examFrame');
    return frame && frame.contentDocument && frame.contentDocument.getElementById('boardsDashboard');
  }, { timeout: 30000 });
  const handle = await page.$('#examFrame');
  const frame = await handle.contentFrame();
  if (!frame) throw new Error('Practice iframe did not become available.');
  return frame;
}

async function clickInFrame(frame, selector) {
  await frame.waitForSelector(selector, { timeout: 10000 });
  await frame.evaluate((value) => {
    const element = document.querySelector(value);
    if (!element) throw new Error(`Missing iframe control: ${value}`);
    element.click();
  }, selector);
}

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
await page.setViewport({ width: 1440, height: 1000 });
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().startsWith('https://accounts.google.com/')) {
    request.respond({ status: 200, contentType: 'text/javascript', body: 'window.google = window.google || {};' });
  } else {
    request.continue();
  }
});

try {
  await page.goto(`http://127.0.0.1:${port}/boards.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#questionPoolOptions', { timeout: 10000 });
  await page.evaluate(() => {
    const input = document.getElementById('questionCount');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('startNewSetBtn').click();
  });

  let frame = await examFrame(page);
  await frame.waitForSelector('.choice', { timeout: 10000 });
  const opened = await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('ksBoardsActiveSetv3') || 'null');
    const screen = document.getElementById('examScreen');
    return {
      configCount: config?.ids?.length || 0,
      status: config?.status || '',
      examVisible: !!screen && !screen.hidden
    };
  });
  report.steps.opened = opened;
  assert(opened.configCount === 2 && opened.status === 'in_progress' && opened.examVisible, 'A two-question active set did not open correctly.');

  const timerBefore = await frame.$eval('#boardsLiveTimer', (element) => element.textContent);
  await clickInFrame(frame, '#boardsHideTimer');
  const timerHidden = await frame.$eval('#boardsLiveTimer', (element) => element.style.visibility === 'hidden');
  await clickInFrame(frame, '#boardsHideTimer');
  const timerVisible = await frame.$eval('#boardsLiveTimer', (element) => element.style.visibility !== 'hidden');
  report.steps.timer = { timerBefore, timerHidden, timerVisible };
  assert(/^\d{2}:\d{2}:\d{2}$/.test(timerBefore) && timerHidden && timerVisible, 'The exam timer did not display and toggle correctly.');

  await clickInFrame(frame, '.choice');
  const firstAnswer = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}');
    return Object.keys(state.testAnswers || {}).length;
  });
  report.steps.firstAnswerCount = firstAnswer;
  assert(firstAnswer === 1, 'The first test answer was not saved.');

  await clickInFrame(frame, '#boardsDashboard');
  await page.waitForFunction(() => !document.getElementById('dashboardScreen')?.hidden, { timeout: 10000 });
  await page.waitForSelector('#resumeSetBtn', { timeout: 10000 });
  const paused = await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('ksBoardsActiveSetv3') || 'null');
    const state = JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}');
    return {
      status: config?.status || '',
      answerCount: Object.keys(state.testAnswers || {}).length,
      resumeText: document.getElementById('resumeSetBtn')?.textContent || ''
    };
  });
  report.steps.paused = paused;
  assert(paused.status === 'in_progress' && paused.answerCount === 1 && /Resume/i.test(paused.resumeText), 'The active set did not pause and remain resumable.');

  await page.evaluate(() => document.getElementById('resumeSetBtn').click());
  frame = await examFrame(page);
  await clickInFrame(frame, '#nextBtn');
  await clickInFrame(frame, '.choice');
  const secondAnswer = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}');
    return Object.keys(state.testAnswers || {}).length;
  });
  report.steps.secondAnswerCount = secondAnswer;
  assert(secondAnswer === 2, 'The second test answer was not saved after resuming.');

  page.once('dialog', (dialog) => dialog.accept());
  await clickInFrame(frame, '#boardsEndSet');
  await frame.waitForSelector('.summary-panel', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const submitted = await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('ksBoardsActiveSetv3') || 'null');
    const state = JSON.parse(localStorage.getItem('kaplanBoardPrepState') || '{}');
    return {
      status: config?.status || '',
      submitted: !!state.testSubmitted?.['all|study']
    };
  });
  report.steps.submitted = submitted;
  assert(submitted.status === 'completed' && submitted.submitted, 'The resumed test did not submit and complete correctly.');

  await clickInFrame(frame, '#boardsDashboard');
  await page.waitForFunction(() => !document.getElementById('dashboardScreen')?.hidden, { timeout: 10000 });
  await page.waitForFunction(() => {
    const tests = JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]');
    return tests.length === 1;
  }, { timeout: 10000 });
  const archived = await page.evaluate(() => {
    const tests = JSON.parse(localStorage.getItem('ksBoardsTestsV3') || '[]');
    const first = tests[0] || {};
    return {
      count: tests.length,
      total: first.total || 0,
      answered: first.answered || 0,
      historyRows: document.querySelectorAll('#testHistory .history-row').length,
      currentSetLabel: document.querySelector('#resumeCard .card-kicker')?.textContent || ''
    };
  });
  report.steps.archived = archived;
  assert(archived.count === 1 && archived.total === 2 && archived.answered === 2 && archived.historyRows === 1, 'The completed test was not archived and rendered in history.');
  assert(/COMPLETED SET/.test(archived.currentSetLabel), 'The completed set was not labeled correctly on the dashboard.');
  assert(errors.length === 0, `Browser errors occurred during the exam flow: ${errors.join(' | ')}`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
} catch (error) {
  report.failures.push(error && error.stack ? error.stack : String(error));
} finally {
  report.errors = errors;
  report.passed = report.failures.length === 0;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await page.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (!report.passed) {
  console.error(`Exam smoke test failed:\n- ${report.failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Two-question create, pause, resume, submit, and archive flow passed.');
