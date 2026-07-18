import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function localAssetsFrom(htmlFile) {
  const html = read(htmlFile);
  return [...html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
}

const html = read('boards.html');
const studyHtml = read('boards-study.html');
const localAssets = [...new Set([...localAssetsFrom('boards.html'), ...localAssetsFrom('boards-study.html')])];
for (const asset of localAssets) {
  if (!fs.existsSync(path.join(root, asset))) fail(`Missing HTML asset: ${asset}`);
}

const scriptOrder = [
  'boards-config.js', 'data.js', 'generated/ks-psychiatry-core-content.js', 'boards-content-provenance.js',
  'questions-global.js', 'boards-bank-registry.js', 'boards-store.js', 'boards-core.js',
  'boards-dashboard.js', 'boards-exam-v2.js', 'boards-exam-source.js', 'boards-exact-timing.js',
  'boards-analytics.js', 'boards-builder.js', 'boards-nav-status.js', 'boards-maintenance.js',
  'boards-safety.js', 'boards-question-bank-model.js', 'boards-model-provenance.js',
  'boards-visible-drive-client.js', 'boards-drive-backup.js', 'boards-question-vault.js', 'boards-init.js'
];
let lastIndex = -1;
for (const script of scriptOrder) {
  const index = html.indexOf(`./${script}`);
  if (index < 0) fail(`boards.html does not reference ${script}`);
  if (index <= lastIndex) fail(`Incorrect script order near ${script}`);
  lastIndex = index;
}
for (const required of [
  'boards-config.js', 'data.js', 'generated/ks-psychiatry-core-content.js',
  'boards-content-provenance.js', 'app.js', 'boards-provenance-ui.js'
]) {
  if (!studyHtml.includes(`./${required}`)) fail(`boards-study.html does not reference ${required}`);
}
if (!html.includes('strict-origin-when-cross-origin') || !studyHtml.includes('strict-origin-when-cross-origin')) {
  fail('The strict referrer policy is missing from a study page.');
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
  execFileSync(process.execPath, ['scripts/build-content.mjs', '--check'], { cwd: root, stdio: 'pipe' });
} catch (error) {
  fail(`Supplemental content compiler check failed:\n${error.stderr?.toString() || error.stdout?.toString() || error.message}`);
}

let originalQuestionCount = 0;
let effectiveQuestionCount = 0;
try {
  const sourceSandbox = {};
  vm.runInNewContext(`${read('data.js')}\n;globalThis.__QUESTIONS = QUESTIONS;`, sourceSandbox, { timeout: 5000 });
  const originals = sourceSandbox.__QUESTIONS;
  if (!Array.isArray(originals) || !originals.length) fail('data.js did not produce a non-empty original QUESTIONS array.');
  originalQuestionCount = Array.isArray(originals) ? originals.length : 0;
  originals.forEach((question, index) => {
    if (question.provenance || question.collectionId || question.originalContent) {
      fail(`Original data.js question ${question?.id || index + 1} contains supplemental provenance fields.`);
    }
  });

  const runtimeSandbox = { console };
  runtimeSandbox.window = runtimeSandbox;
  vm.runInNewContext(read('boards-config.js'), runtimeSandbox, { timeout: 5000 });
  vm.runInNewContext(read('data.js'), runtimeSandbox, { timeout: 5000 });
  vm.runInNewContext(read('generated/ks-psychiatry-core-content.js'), runtimeSandbox, { timeout: 5000 });
  vm.runInNewContext(`${read('boards-content-provenance.js')}\n;globalThis.__QUESTIONS = QUESTIONS;`, runtimeSandbox, { timeout: 5000 });
  const questions = runtimeSandbox.__QUESTIONS;
  effectiveQuestionCount = Array.isArray(questions) ? questions.length : 0;
  if (!Array.isArray(questions) || !questions.length) fail('The effective runtime bank is empty.');
  if (effectiveQuestionCount > 5000) fail(`The effective bank contains ${effectiveQuestionCount} cards, exceeding the 5000-card ceiling.`);

  const ids = new Set();
  const compositeIds = new Set();
  const chapterNumbers = new Set();
  questions.forEach((question, index) => {
    if (!question || typeof question.id !== 'string' || !question.id) fail(`Question ${index + 1} has no valid id.`);
    else if (ids.has(question.id)) fail(`Duplicate effective question id: ${question.id}`);
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
    const provenanceClass = question.provenance?.class;
    if (!['original-bank', 'ai-created', 'user-created', 'ai-revised-original'].includes(provenanceClass)) {
      fail(`Question ${question?.id || index + 1} has invalid provenance class: ${provenanceClass}`);
    }
    if (provenanceClass === 'ai-revised-original') {
      if (!question.originalContent) fail(`AI-revised original ${question.id} does not preserve its original snapshot.`);
      if (!question.provenance.modifiedFields?.length) fail(`AI-revised original ${question.id} does not declare modified fields.`);
    }
    if (provenanceClass === 'ai-created' && question.provenance.originalBankMaterial !== false) {
      fail(`AI-created question ${question.id} is incorrectly labeled as original material.`);
    }
  });
  const report = runtimeSandbox.BOARDS_CONTENT_PROVENANCE;
  if (!report || report.originalCount !== originalQuestionCount || report.effectiveCount !== effectiveQuestionCount) {
    fail('Runtime provenance report does not match original/effective question counts.');
  }
  console.log(`Validated ${originalQuestionCount} immutable originals and ${effectiveQuestionCount} effective cards.`);
} catch (error) {
  fail(`Question-bank and provenance validation failed: ${error.message}`);
}

const publicFiles = ['boards.html', 'boards-study.html', ...javascriptFiles.map((file) => path.relative(root, file))];
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
  "platformId: 'abpn-personal-study-platform'", 'maxTotalCards: 5000', "id: 'ks-psychiatry-core'",
  "stagingBranch: 'question-bank-staging'", "tests: 'Test History'", "testIndex: 'completed-tests-index.json'",
  "registry: 'Registry'", "banks: 'Banks'", "aiWorkspace: 'AI Workspace'", "aiRequests: 'Requests'",
  "aiProposals: 'Proposals'", "aiExports: 'Exports'"
];
for (const fragment of requiredConfigFragments) if (!configCode.includes(fragment)) fail(`Required multi-bank configuration is missing: ${fragment}`);

for (const registeredModule of [
  'boards-store.js', 'boards-core.js', 'boards-analytics.js', 'boards-maintenance.js',
  'boards-drive-backup.js', 'boards-bank-registry.js', 'boards-question-bank-model.js',
  'boards-visible-drive-client.js', 'boards-question-vault.js', 'boards-exact-timing.js'
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
if (vaultCode.includes('deleteFile(') || vaultCode.includes("method: 'DELETE'")) fail('Question platform must not expose Drive file-deletion behavior.');

const modelCode = read('boards-question-bank-model.js');
for (const capability of [
  'processedTestIds', 'stableStringify', 'timingBands', 'selectedLetterCounts',
  'recentAttempts', 'categoryPerformance', 'compositeId', 'maxCardsPerBank'
]) {
  if (!modelCode.includes(capability)) fail(`Question/performance model capability is missing: ${capability}`);
}

const provenanceCode = read('boards-content-provenance.js');
for (const safeguard of [
  'ORIGINAL BANK', 'AI-CREATED · PERSONAL SUPPLEMENT', 'originalContent', 'baseContentHash',
  'Only one active revision overlay', 'overwritesOriginalSource'
]) {
  if (!provenanceCode.includes(safeguard)) fail(`Content provenance safeguard is missing: ${safeguard}`);
}

const timingCode = read('boards-exact-timing.js');
for (const capability of [
  'performance.now()', 'activeMilliseconds', 'firstResponseMilliseconds', 'answerChanges',
  "timingPrecision = 'milliseconds'", 'averageMilliseconds'
]) {
  if (!timingCode.includes(capability)) fail(`Exact timing capability is missing: ${capability}`);
}

const builderCode = read('boards-builder.js');
for (const source of ['original', 'ai-revised', 'ai-created', 'user-created']) {
  if (!builderCode.includes(`value: '${source}'`)) fail(`Practice builder source filter is missing: ${source}`);
}

const requiredRepositoryFiles = [
  'schemas/question-bank.schema.json', 'docs/QUESTION_BANK_GOVERNANCE.md', 'docs/QUESTION_VAULT.md',
  'docs/MULTI_BANK_PLATFORM.md', 'content/banks/ks-psychiatry-core/manifest.json',
  'content/banks/ks-psychiatry-core/ai-created/_card.template.json',
  'content/banks/ks-psychiatry-core/user-created/_card.template.json',
  'content/banks/ks-psychiatry-core/ai-revisions/_revision.template.json',
  'generated/ks-psychiatry-core-content.js', 'scripts/build-content.mjs',
  '.github/CODEOWNERS', '.github/pull_request_template.md'
];
for (const file of requiredRepositoryFiles) if (!fs.existsSync(path.join(root, file))) fail(`Required governance file is missing: ${file}`);

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
console.log(`Validated ${localAssets.length} local assets and ${javascriptFiles.length} JavaScript files.`);
console.log(`Capacity check passed for ${effectiveQuestionCount} effective cards from ${originalQuestionCount} immutable originals.`);
console.log('Security, provenance, exact timing, AI workspace, and architecture checks passed.');
