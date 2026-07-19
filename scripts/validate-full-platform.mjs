import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const fail = (message) => failures.push(message);
const requireText = (file, text, message) => {
  if (!exists(file)) fail(`Missing required file: ${file}`);
  else if (!read(file).includes(text)) fail(message || `${file} is missing required text: ${text}`);
};

const html = read('boards.html');
const activeScripts = [...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
const activeStyles = [...html.matchAll(/<link[^>]+href="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
for (const asset of [...activeScripts, ...activeStyles]) if (!exists(asset)) fail(`Missing active HTML asset: ${asset}`);

const expectedOrder = [
  'boards-config.js',
  'data.js',
  'generated/question-bank-catalog.js',
  'questions-global.js',
  'boards-store.js',
  'boards-core.js',
  'ui/dashboard-registry.js',
  'ui/panel-templates.js',
  'ui/dashboard-views.js',
  'boards-dashboard.js',
  'boards-exam-countdown.js',
  'boards-exam-v2.js',
  'boards-analytics.js',
  'boards-builder.js',
  'boards-nav-status.js',
  'boards-maintenance.js',
  'boards-safety.js',
  'boards-question-bank-model.js',
  'boards-bank-consistency.js',
  'boards-visible-drive-client.js',
  'boards-vault-bank-scope.js',
  'boards-drive-backup.js',
  'boards-device-sync.js',
  'boards-question-vault.js',
  'boards-hard-reset-service.js',
  'boards-hard-reset-controller.js',
  'boards-init.js'
];
let previous = -1;
for (const script of expectedOrder) {
  const index = activeScripts.indexOf(script);
  if (index < 0) fail(`boards.html does not activate ${script}`);
  if (index <= previous) fail(`Incorrect runtime order near ${script}`);
  previous = index;
}
if (activeScripts.includes('boards-hard-reset.js')) fail('The obsolete broad hard-reset module must not be active.');
if (!html.includes('strict-origin-when-cross-origin')) fail('Strict referrer policy is missing.');
if (html.includes('<style>')) fail('boards.html must not contain embedded CSS.');
for (const region of ['welcome-tools', 'practice-builder', 'analytics', 'data-tools']) {
  if (!html.includes(`data-dashboard-region="${region}"`)) fail(`Missing dashboard region: ${region}`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(root).filter((file) => file.endsWith('.js') || file.endsWith('.mjs'))) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { fail(`JavaScript syntax failed: ${path.relative(root, file)}\n${error.stderr?.toString() || error.message}`); }
}

try {
  const sandbox = {};
  vm.runInNewContext(`${read('data.js')}\n;globalThis.__QUESTIONS = QUESTIONS;`, sandbox, { timeout: 5000 });
  const questions = sandbox.__QUESTIONS;
  if (!Array.isArray(questions)) fail('data.js did not produce QUESTIONS.');
  else {
    if (questions.length !== 602) fail(`The protected K&S bank changed from 602 questions to ${questions.length}.`);
    const ids = new Set();
    questions.forEach((question, index) => {
      if (!question || typeof question.id !== 'string' || !question.id) fail(`K&S question ${index + 1} has no stable id.`);
      else if (ids.has(question.id)) fail(`Duplicate K&S question id: ${question.id}`);
      else ids.add(question.id);
      if (!Array.isArray(question.choices) || !Array.isArray(question.choiceLetters) || question.choices.length !== question.choiceLetters.length) fail(`Question ${question?.id || index + 1} has mismatched choices.`);
      if (!question.choiceLetters?.includes(question.correctLetter)) fail(`Question ${question?.id || index + 1} has an invalid correct answer.`);
    });
  }
} catch (error) { fail(`Protected K&S question-bank validation failed: ${error.message}`); }

const config = read('boards-config.js');
for (const [text, message] of [
  ["DEFAULT_BANK_ID = 'ks-psychiatry-core'", 'Stable K&S bank id is missing.'],
  ["SELECTION_KEY = 'ksBoardsSelectedQuestionBankV1'", 'Bank-selection key is missing.'],
  ["legacyStorage: true", 'K&S legacy storage preservation is missing.'],
  ["app: 'kaplanBoardPrepState'", 'Original K&S app-state key changed.'],
  ["config: 'ksBoardsActiveSetv3'", 'Original K&S active-set key changed.'],
  ["currentFile: driveStem + '-current-v1.json'", 'Hidden Drive current-file contract is missing.'],
  ["driveStem = legacy ? 'psychiatry-board'", 'Original K&S Drive filename stem changed.'],
  ["'abpnBank:' + bank.id + ':'", 'Future-bank browser namespace is missing.'],
  ["'psychiatry-board-' + activeBank.id", 'Future-bank hidden Drive namespace is missing.'],
  ["MAX_CARDS_PER_BANK = 5000", 'Per-bank capacity guard is missing.'],
  ["MAX_TOTAL_CARDS = 5000", 'Total platform capacity guard is missing.'],
  ['questionFingerprint', 'Bank-content conflict hashing is missing.'],
  ["banksFolder: 'Banks'", 'Future-bank visible-vault root is missing.'],
  ["scope: 'active-bank'", 'Hard reset is not declared active-bank only.']
]) if (!config.includes(text)) fail(message);
if (config.includes("'thedude9'")) fail('Reset code must never be stored as plaintext.');

requireText('generated/question-bank-catalog.js', 'window.BOARDS_QUESTION_BANKS', 'Generated future-bank catalog entry point is missing.');
requireText('questions-global.js', 'BoardsBootstrapQuestionBanks(window.QUESTIONS)', 'Bank registry does not activate after catalog and K&S data load.');

const core = read('boards-core.js');
for (const text of ['BoardsQuestionBankRegistry', 'configBankId !== activeBank.id', 'bankId: activeBank.id', 'bankTitle: activeBank.title']) {
  if (!core.includes(text)) fail(`BoardsCore bank safeguard is missing: ${text}`);
}

const consistency = read('boards-bank-consistency.js');
for (const text of [
  'installStorageFirewall',
  'Cross-bank storage write blocked',
  'Blanket localStorage.clear() is prohibited',
  "quarantine('completed-tests'",
  'bankQuestionHash',
  'validateCurrentState',
  'Package belongs to question bank'
]) if (!consistency.includes(text)) fail(`Consistency safeguard is missing: ${text}`);

const store = read('boards-store.js');
for (const text of [
  'bankId: Config.bank.id',
  'bankQuestionHash: Config.bank.questionHash',
  'Backup belongs to',
  'Switch banks before restoring it',
  'normalizeSnapshot(snapshot)'
]) if (!store.includes(text)) fail(`Snapshot/restore bank safeguard is missing: ${text}`);

const vaultScope = read('boards-vault-bank-scope.js');
for (const text of [
  'Vault.banksFolder',
  'Vault.bankFolder',
  'Vault.legacyLayout',
  'is missing the required bank identity',
  'identity(payload)'
]) if (!vaultScope.includes(text)) fail(`Question Vault bank-scope safeguard is missing: ${text}`);

const visibleClient = read('boards-visible-drive-client.js');
for (const text of ['bankId: Config.bank.id', 'belongs to another question bank', 'bankProperties(role)']) {
  if (!visibleClient.includes(text)) fail(`Visible Drive ownership safeguard is missing: ${text}`);
}

const resetService = read('boards-hard-reset-service.js');
for (const text of [
  'activeLocalKeys()',
  'Config.storage.backupKeys',
  'Vault.legacyLayout',
  'Vault.banksFolder',
  'Vault.bankFolder',
  "resetScope: 'active-bank'",
  'archiveHiddenBackup',
  'archiveVisibleStudyData',
  'publishEmptyCloudState',
  'clearActiveLocalData'
]) if (!resetService.includes(text)) fail(`Active-bank reset safeguard is missing: ${text}`);
if (/key\.indexOf\(['"]ksBoards/.test(resetService)) fail('Active-bank reset must not broadly delete every ksBoards key.');
if (resetService.includes("method: 'DELETE'")) fail('Active-bank reset must archive rather than delete cloud files.');
if (resetService.includes("'thedude9'")) fail('Reset passcode must not be plaintext.');

const resetController = read('boards-hard-reset-controller.js');
for (const text of ['downloadRecovery', 'Config.bank.id', 'Reset.confirmationPhrase', 'Service.execute', 'Store.applySnapshot(rescue)']) {
  if (!resetController.includes(text)) fail(`Protected reset-controller safeguard is missing: ${text}`);
}

const init = read('boards-init.js');
for (const text of ['BoardsBankConsistency', 'BoardsVaultBankScope', 'BoardsHardResetService', 'validateCurrentState()', 'bankQuestionHash']) {
  if (!init.includes(text)) fail(`Fail-closed startup check is missing: ${text}`);
}

const driveSources = activeScripts.filter((file) => file.includes('drive') || file.includes('vault') || file.includes('reset') || file === 'boards-config.js').map(read).join('\n');
const scopes = new Set(driveSources.match(/https:\/\/www\.googleapis\.com\/auth\/drive(?:\.[A-Za-z0-9._-]+)?/g) || []);
const allowedScopes = new Set(['https://www.googleapis.com/auth/drive.appdata', 'https://www.googleapis.com/auth/drive.file']);
for (const scope of scopes) if (!allowedScopes.has(scope)) fail(`Forbidden broad Drive scope found: ${scope}`);
for (const scope of allowedScopes) if (!scopes.has(scope)) fail(`Required limited Drive scope is missing: ${scope}`);

const secretPatterns = [/client_secret\s*[:=]/i, /refresh_token\s*[:=]/i, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /"private_key"\s*:/i];
for (const file of ['boards.html', ...activeScripts]) {
  const content = read(file);
  for (const pattern of secretPatterns) if (pattern.test(content)) fail(`Possible secret material in active file ${file}: ${pattern}`);
}

for (const required of [
  'schemas/question-bank.schema.json',
  'docs/QUESTION_BANK_GOVERNANCE.md',
  'docs/QUESTION_VAULT.md',
  'docs/LAUNCH_HARDENING_TEST_PLAN.md',
  '.github/CODEOWNERS',
  '.github/pull_request_template.md'
]) if (!exists(required)) fail(`Required governance file is missing: ${required}`);

if (warnings.length) console.warn(`\nValidation warnings:\n- ${warnings.join('\n- ')}`);
if (failures.length) {
  console.error(`\nFull platform validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Full platform validation passed for ${activeScripts.length} active scripts, ${activeStyles.length} stylesheets, and 602 protected K&S questions.`);