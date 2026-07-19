import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const requireText = (file, text, message) => {
  if (!read(file).includes(text)) failures.push(message || `${file} is missing ${text}`);
};
const forbidText = (file, text, message) => {
  if (read(file).includes(text)) failures.push(message || `${file} contains unsafe pattern ${text}`);
};

const requiredFiles = [
  'boards-config.js', 'boards-store.js', 'boards-core.js', 'boards-builder.js',
  'boards-dashboard.js', 'boards-analytics.js', 'boards-maintenance.js',
  'boards-drive-backup.js', 'boards-question-vault.js', 'boards-hard-reset.js',
  'boards-question-bank-model.js', 'boards-exam-v2.js',
  'ui/question-bank-selector-view.js'
];
requiredFiles.forEach((file) => {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing platform component: ${file}`);
});

requireText('boards-config.js', "DEFAULT_BANK_ID = 'ks-psychiatry-core'", 'Stable K&S bank identity is missing.');
requireText('boards-config.js', 'MAX_CARDS_PER_BANK = 5000', 'Per-bank capacity guard is missing.');
requireText('boards-config.js', 'MAX_TOTAL_CARDS = 5000', 'Total platform capacity guard is missing.');
requireText('boards-config.js', 'questionFingerprint', 'Question-bank content hashes are missing.');
requireText('boards-config.js', "legacyStorage: true", 'K&S legacy storage compatibility is missing.');
requireText('boards-config.js', "'abpnBank:' + bank.id + ':'", 'Future-bank storage namespaces are missing.');
requireText('boards-config.js', "'psychiatry-board-' + activeBank.id", 'Future-bank hidden Drive filenames are missing.');

requireText('boards-store.js', 'normalizeForKey', 'Central stored-record normalization is missing.');
requireText('boards-store.js', 'bankQuestionHash', 'Stored records do not retain bank content identity.');
requireText('boards-store.js', 'Switch banks before restoring it.', 'Cross-bank restore rejection is missing.');
requireText('boards-store.js', 'Config.storage.backupKeys.forEach', 'Restore must clear only active-bank keys.');
requireText('boards-store.js', 'bankId: Config.bank.id', 'Snapshots must record the active bank.');

requireText('boards-core.js', 'configBankId !== activeBank.id', 'Cross-bank active sets are not rejected.');
requireText('boards-core.js', 'bankId: activeBank.id', 'Practice sets do not record bank identity.');
requireText('boards-core.js', 'bankId: activeBank.id });', 'Milestones do not retain bank identity.');
requireText('boards-builder.js', 'Banks.list()', 'Practice builder is not registry-driven.');
requireText('boards-builder.js', 'Progress, tests, backups, and settings remain separate for each bank.', 'Bank-switch isolation warning is missing.');
requireText('boards-exam-v2.js', 'window.QUESTIONS=payload.questions.slice()', 'Exam runtime does not load the active bank.');
requireText('boards-exam-v2.js', 'key==="kaplanBoardPrepState"?appKey:key', 'Exam answer state is not mapped to the active bank.');
requireText('boards-exam-v2.js', 'message.bankId !== C.activeBank.id', 'Cross-bank exam messages are not rejected.');

requireText('boards-analytics.js', 'const TESTS_KEY = Config.storage.keys.tests', 'Completed sets are not using the active-bank test key.');
requireText('boards-analytics.js', 'const byId = C.byId', 'Completed-set review is not tied to the active bank.');
requireText('boards-maintenance.js', 'const KEYS = Config.storage.keys', 'Reset and recovery are not tied to active-bank keys.');
requireText('boards-drive-backup.js', 'const Keys = Config.storage.keys', 'Device Sync is not tied to active-bank keys.');
requireText('boards-drive-backup.js', 'Store.normalizeSnapshot', 'Device Sync does not validate backup identity.');
requireText('boards-question-bank-model.js', 'datasetId: Vault.datasetId', 'Question Vault packages lack bank dataset identity.');
requireText('boards-question-vault.js', 'const Vault = Config.questionVault', 'Question Vault is not bank-configured.');
requireText('boards-hard-reset.js', 'const Vault = Config.questionVault', 'Absolute reset is not bank-configured.');

forbidText('boards-exam-v2.js', "examFrame.src = './index.html?boards='", 'Exam runtime reverted to a K&S-only path.');
forbidText('boards-config.js', "legacy ? 'abpnBank:", 'K&S must not be migrated into a future-bank namespace.');

const configText = read('boards-config.js');
const legacyKeys = [
  'kaplanBoardPrepState', 'ksBoardsActiveSetv3', 'ksBoardsHistoryv3',
  'ksBoardsSettingsv3', 'ksBoardsTestsV3', 'ksBoardsDeletedTestsV3',
  'ksBoardsBackupsV1', 'ksBoardsDriveSettingsV1',
  'psychiatry-board-current-v1.json', 'psychiatry-board-history-v1.json'
];
legacyKeys.forEach((key) => {
  if (!configText.includes(key)) failures.push(`K&S compatibility contract is missing: ${key}`);
});

if (failures.length) {
  console.error(`Full platform QC failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Full platform consistency QC passed across banks, sets, analytics, recovery, sync, vault, and exam runtime.');