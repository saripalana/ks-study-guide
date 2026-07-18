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
  'boards-config.js', 'data.js', 'questions-global.js', 'boards-bank-registry.js',
  'boards-store.js', 'boards-core.js', 'boards-dashboard.js', 'boards-exam-v2.js',
  'boards-analytics.js', 'boards-builder.js', 'boards-nav-status.js', 'boards-maintenance.js',
  'boards-safety.js', 'boards-question-bank-model.js', 'boards-visible-drive-client.js',
  'boards-drive-backup.js', 'boards-question-vault.js', 'boards-init.js'
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

let questionCount = 0;
try {
  const sandbox = {};
  vm.runInNewContext(`${read('data.js')}\n;globalThis.__QUESTIONS = QUESTIONS;`, sandbox, { timeout: 5000 });
  const questions = sandbox.__QUESTIONS;
  if (!Array.isArray(questions) || !questions.length) fail('data.js did not produce a non-empty QUESTIONS array.');
  questionCount = Array.isArray(questions) ? questions.length : 0;
  if (questionCount > 5000) fail(`The active bank contains ${questionCount} cards, exceeding the 5000-card ceiling.`);
  const ids = new Set();
  const compositeIds = new Set();
  const chapterNumbers = new Set();
  questions.forEach((question, index) => {
    if (!question || typeof question.id !== 'string' || !question.id) fail(`Question ${index + 1} has no valid id.`);
    else if (ids.has(question.id)) fail(`Duplicate question id: ${question.id}`);
    else ids.add(question.id);
    const compositeId = `ks-psychiatry-core::${question?.id || ''}`;
    if (compositeIds.has(compositeId)) fail(`Duplicate composite question id: ${compositeId}`);
    compositeIds.add(compositeId);
    const chapterKey = `${question.chapter}|${question.qnum}`;
    if (chapterNumbers.has(chapterKey)) warn(`Duplicate chapter/question number: ${question.chapter}.${question.qnum}`);
    chapterNumbers.add(chapterKey);
    if (!Array.isArray(question.choices) || !Array.isArray(question.choiceLetters) || question.choices.length !== question.choiceLetters.length) {
      fail(`Question ${question?.id || index + 1} has mismatched choices and letters.`);
    }
    if (!question.choiceLetters?.includes(question.correctLetter)) fail(`Question ${question?.id || index + 1} has an invalid correct letter.`);
  });
  console.log(`Validated ${questionCount} questions with unique stable and composite IDs.`);
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
const requiredConfigFragments = [
  "platformId: 'abpn-personal-study-platform'",
  'maxTotalCards: 5000',
  "id: 'ks-psychiatry-core'",
  "stagingBranch: 'question-bank-staging'",
  "tests: 'Test History'",
  "testIndex: 'completed-tests-index.json'",
  "registry: 'Registry'",
  "banks: 'Banks'",
  "aiWorkspace: 'AI Workspace'",
  "aiRequests: 'Requests'",
  "aiProposals: 'Proposals'",
  "aiExports: 'Exports'"
];
for (const fragment of requiredConfigFragments) {
  if (!configCode.includes(fragment)) fail(`Required multi-bank configuration is missing: ${fragment}`);
}

for (const registeredModule of [
  'boards-store.js', 'boards-core.js', 'boards-analytics.js', 'boards-maintenance.js',
  'boards-drive-backup.js', 'boards-bank-registry.js', 'boards-question-bank-model.js',
  'boards-visible-drive-client.js', 'boards-question-vault.js'
]) {
  const content = read(registeredModule);
  if (!content.includes('BoardsConfig')) fail(`${registeredModule} must use centralized BoardsConfig.`);
}

const registryCode = read('boards-bank-registry.js');
for (const fragment of ['compositeId', 'platformRegistry', 'maxTotalCards', 'categoriesForQuestion']) {
  if (!registryCode.includes(fragment)) fail(`Bank registry capability is missing: ${fragment}`);
}

const vaultCode = read('boards-question-vault.js');
for (const safeguard of [
  'production-history', 'draft-history', 'completed-test', 'approvedForAutomaticPublish: false',
  'AI Workspace', 'ai-workspace-manifest.json', 'question-change-request-template.json',
  'question-change-proposal-template.json', 'Banks/', 'productionAutoPublish: false'
]) {
  if (!vaultCode.includes(safeguard)) fail(`Question platform safeguard is missing: ${safeguard}`);
}
if (vaultCode.includes('deleteFile(') || vaultCode.includes("method: 'DELETE'")) {
  fail('Question platform must not expose Drive file-deletion behavior.');
}

const modelCode = read('boards-question-bank-model.js');
for (const capability of [
  'processedTestIds', 'stableStringify', 'timingBands', 'selectedLetterCounts',
  'recentAttempts', 'categoryPerformance', 'compositeId', 'maxCardsPerBank'
]) {
  if (!modelCode.includes(capability)) fail(`Question/performance model capability is missing: ${capability}`);
}

const requiredRepositoryFiles = [
  'schemas/question-bank.schema.json',
  'docs/QUESTION_BANK_GOVERNANCE.md',
  'docs/QUESTION_VAULT.md',
  'docs/MULTI_BANK_PLATFORM.md',
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
    if (schema?.properties?.platformId?.const !== 'abpn-personal-study-platform') fail('Question-bank schema platformId does not match the app.');
    if (schema?.properties?.questionCount?.maximum !== 5000) fail('Question-bank schema must enforce the 5000-card ceiling.');
    if (schema?.properties?.questions?.maxItems !== 5000) fail('Question array schema must enforce the 5000-card ceiling.');
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
console.log(`Multi-bank capacity check passed for ${questionCount} active cards within a 5000-card personal platform.`);
console.log('Security, AI-workspace, question governance, and architecture checks passed.');
