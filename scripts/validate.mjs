import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('boards.html');
const localAssets = [...html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
for (const asset of localAssets) {
  if (!fs.existsSync(path.join(root, asset))) fail(`Missing HTML asset: ${asset}`);
}

const scriptOrder = [
  'boards-config.js', 'data.js', 'questions-global.js', 'boards-store.js', 'boards-core.js',
  'boards-dashboard.js', 'boards-exam-v2.js', 'boards-analytics.js', 'boards-builder.js',
  'boards-nav-status.js', 'boards-maintenance.js', 'boards-safety.js',
  'boards-drive-backup.js', 'boards-init.js'
];
let lastIndex = -1;
for (const script of scriptOrder) {
  const index = html.indexOf(`./${script}`);
  if (index < 0) fail(`boards.html does not reference ${script}`);
  if (index <= lastIndex) fail(`Incorrect script order near ${script}`);
  lastIndex = index;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.name === '.git') return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const javascriptFiles = walk(root).filter((file) => file.endsWith('.js') || file.endsWith('.mjs'));
for (const file of javascriptFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`JavaScript syntax failed: ${path.relative(root, file)}\n${error.stderr?.toString() || error.message}`);
  }
}

try {
  const sandbox = {};
  vm.runInNewContext(`${read('data.js')}\n;globalThis.__QUESTIONS = QUESTIONS;`, sandbox, { timeout: 5000 });
  const questions = sandbox.__QUESTIONS;
  if (!Array.isArray(questions) || !questions.length) fail('data.js did not produce a non-empty QUESTIONS array.');
  const ids = new Set();
  questions.forEach((question, index) => {
    if (!question || typeof question.id !== 'string' || !question.id) fail(`Question ${index + 1} has no valid id.`);
    else if (ids.has(question.id)) fail(`Duplicate question id: ${question.id}`);
    else ids.add(question.id);
    if (!Array.isArray(question.choices) || !Array.isArray(question.choiceLetters) || question.choices.length !== question.choiceLetters.length) {
      fail(`Question ${question?.id || index + 1} has mismatched choices and letters.`);
    }
    if (!question.choiceLetters?.includes(question.correctLetter)) fail(`Question ${question?.id || index + 1} has an invalid correct letter.`);
  });
  console.log(`Validated ${questions.length} questions with unique IDs.`);
} catch (error) {
  fail(`Question-bank validation failed: ${error.message}`);
}

const publicFiles = ['boards.html', ...javascriptFiles.map((file) => path.relative(root, file))];
const secretPatterns = [
  /client_secret\s*[:=]/i,
  /refresh_token\s*[:=]/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /"private_key"\s*:/i
];
for (const file of publicFiles) {
  const content = read(file);
  for (const pattern of secretPatterns) if (pattern.test(content)) fail(`Possible secret material in ${file}: ${pattern}`);
}

const driveCode = read('boards-drive-backup.js') + read('boards-config.js');
const forbiddenScopes = [
  'https://www.googleapis.com/auth/drive"',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
];
for (const scope of forbiddenScopes) if (driveCode.includes(scope)) fail(`Forbidden broad Drive scope found: ${scope}`);
if (!driveCode.includes('https://www.googleapis.com/auth/drive.appdata')) fail('Required drive.appdata scope is missing.');

const configCode = read('boards-config.js');
const projectIdMatch = configCode.match(/projectId:\s*'([^']+)'/);
if (!projectIdMatch || !projectIdMatch[1]) fail('A stable projectId is required in boards-config.js.');
for (const registeredModule of ['boards-store.js', 'boards-core.js', 'boards-analytics.js', 'boards-maintenance.js', 'boards-drive-backup.js']) {
  const content = read(registeredModule);
  if (!content.includes('BoardsConfig')) fail(`${registeredModule} must use centralized BoardsConfig.`);
}

if (failures.length) {
  console.error('\nValidation failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Validated ${localAssets.length} local HTML assets and ${javascriptFiles.length} JavaScript files.`);
console.log('Security and architecture checks passed.');
