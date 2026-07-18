import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
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
  'boards-question-bank-model.js', 'boards-visible-drive-client.js', 'boards-drive-backup.js',
  'boards-question-vault.js', 'boards-init.js'
];
let lastIndex = -1;
for (const script of scriptOrder) {
  const index = html.indexOf(`./${script}`);
  if (index < 0) fail(`boards.html does not reference ${script}`);
  if (index <= lastIndex) fail(`Incorrect script order near ${script}`);
  lastIndex = index;
}
if (!html.includes('strict-origin-when-cross-origin')) fail('The strict referrer policy is missing from boards.html.');

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
  const chapterNumbers = new Set();
  questions.forEach((question, index) => {
    if (!question || typeof question.id !== 'string' || !question.id) fail(`Question ${index + 1} has no valid id.`);
    else if (ids.has(question.id)) fail(`Duplicate question id: ${question.id}`);
    else ids.add(question.id);
    const chapterKey = `${question.chapter}|${question.qnum}`;
    if (chapterNumbers.has(chapterKey)) warn(`Duplicate chapter/question number: ${question.chapter}.${question.qnum}`);
    chapterNumbers.add(chapterKey);
    if (!Array.isArray(question.choices) || !Array.isArray(question.choiceLetters) || question.choices.length !== question.choiceLetters.length) {
      fail(`Question ${question?.id || index + 1} has mismatched choices and letters.`);
    }
    if (!question.choiceLetters?.includes(question.correctLetter)) fail(`Question ${question?.id || index + 1} has an invalid correct letter.`);
  });
  console.log(`Validated ${questions.length} questions with unique stable IDs.`);
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

const driveCode = [
  read('boards-drive-backup.js'), read('boards-visible-drive-client.js'), read('boards-question-vault.js'), read('boards-config.js')
].join('\n');
const scopeMatches = new Set(driveCode.match(/https:\/\/www\.googleapis\.com\/auth\/drive(?:\.[A-Za-z0-9._-]+)?/g) || []);
const allowedScopes = new Set([
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file'
]);
for (const scope of scopeMatches) if (!allowedScopes.has(scope)) fail(`Forbidden broad Drive scope found: ${scope}`);
for (const scope of allowedScopes) if (!scopeMatches.has(scope)) fail(`Required limited Drive scope is missing: ${scope}`);

const configCode = read('boards-config.js');
const projectIdMatch = configCode.match(/projectId:\s*'([^']+)'/);
if (!projectIdMatch || !projectIdMatch[1]) fail('A stable projectId is required in boards-config.js.');
if (!configCode.includes("stagingBranch: 'question-bank-staging'")) fail('Question-bank staging branch configuration is missing.');
if (!configCode.includes("datasetId: 'psychiatry-board-question-bank'")) fail('Question-bank dataset identity is missing.');
if (!configCode.includes("tests: 'Test History'")) fail('Append-only Test History folder configuration is missing.');
if (!configCode.includes("testIndex: 'completed-tests-index.json'")) fail('Completed-test archive index configuration is missing.');

for (const registeredModule of [
  'boards-store.js', 'boards-core.js', 'boards-analytics.js', 'boards-maintenance.js',
  'boards-drive-backup.js', 'boards-question-bank-model.js', 'boards-visible-drive-client.js', 'boards-question-vault.js'
]) {
  const content = read(registeredModule);
  if (!content.includes('BoardsConfig')) fail(`${registeredModule} must use centralized BoardsConfig.`);
}

const vaultCode = read('boards-question-vault.js');
for (const safeguard of ['question-bank-staging', 'production-history', 'draft-history', 'completed-test', 'approvedForAutomaticPublish: false']) {
  if (!vaultCode.includes(safeguard)) fail(`Question Vault safeguard is missing: ${safeguard}`);
}
if (vaultCode.includes('deleteFile(') || vaultCode.includes("method: 'DELETE'")) {
  fail('Question Vault must not expose file-deletion behavior.');
}

const modelCode = read('boards-question-bank-model.js');
if (!modelCode.includes('processedTestIds')) fail('Cumulative per-question performance must track processed test IDs.');
if (!modelCode.includes('stableStringify')) fail('Question-bank packages require deterministic serialization.');

const requiredRepositoryFiles = [
  'schemas/question-bank.schema.json',
  'docs/QUESTION_BANK_GOVERNANCE.md',
  'docs/QUESTION_VAULT.md',
  '.github/CODEOWNERS',
  '.github/pull_request_template.md'
];
for (const file of requiredRepositoryFiles) {
  if (!fs.existsSync(path.join(root, file))) fail(`Required governance file is missing: ${file}`);
}

const schemaPath = path.join(root, 'schemas/question-bank.schema.json');
if (fs.existsSync(schemaPath)) {
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    if (schema?.properties?.projectId?.const !== 'psychiatry-board-practice') fail('Question-bank schema projectId does not match the app.');
    if (schema?.properties?.datasetId?.const !== 'psychiatry-board-question-bank') fail('Question-bank schema datasetId does not match the app.');
  } catch (error) {
    fail(`Question-bank schema is invalid JSON: ${error.message}`);
  }
}

if (warnings.length) console.warn('\nValidation warnings:\n- ' + warnings.join('\n- '));
if (failures.length) {
  console.error('\nValidation failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Validated ${localAssets.length} local HTML assets and ${javascriptFiles.length} JavaScript files.`);
console.log('Security, question governance, and architecture checks passed.');