import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const requireText = (file, text, label) => {
  if (!read(file).includes(text)) failures.push(label || `${file} is missing ${text}`);
};

for (const file of [
  'boards-config.js',
  'questions-global.js',
  'boards-core.js',
  'boards-builder.js',
  'boards-exam-v2.js',
  'ui/question-bank-selector-view.js',
  'boards-builder.css'
]) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing question-bank architecture file: ${file}`);
}

requireText('boards-config.js', "DEFAULT_BANK_ID = 'ks-psychiatry-core'", 'The stable K&S bank id is missing.');
requireText('boards-config.js', "SELECTION_KEY = 'ksBoardsSelectedQuestionBankV1'", 'The cross-bank selection key is missing.');
requireText('boards-config.js', "legacyStorage: true", 'K&S must retain its legacy storage contract.');
requireText('boards-config.js', "'kaplanBoardPrepState'", 'The original K&S app-state key must remain unchanged.');
requireText('boards-config.js', "'ksBoardsActiveSetv3'", 'The original K&S active-set key must remain unchanged.');
requireText('boards-config.js', "'psychiatry-board'", 'The original K&S Drive filename stem must remain unchanged.');
requireText('boards-config.js', "'abpnBank:' + bank.id + ':'", 'Future banks require isolated browser-storage namespaces.');
requireText('boards-config.js', "'psychiatry-board-' + activeBank.id", 'Future banks require isolated hidden-Drive filenames.');
requireText('boards-config.js', "vaultPrefix = legacy ? '' : activeBank.id + '-'", 'Future banks require isolated visible-vault filenames.');
requireText('boards-config.js', 'BoardsBootstrapQuestionBanks', 'Question-bank bootstrap must complete before storage initializes.');
requireText('questions-global.js', 'BoardsBootstrapQuestionBanks(window.QUESTIONS)', 'Question data must activate the bank registry before the app starts.');

requireText('boards-core.js', 'BoardsQuestionBankRegistry', 'BoardsCore must read questions from the active bank registry.');
requireText('boards-core.js', 'bankId: activeBank.id', 'Every new practice set must record its bank id.');
requireText('boards-core.js', 'configBankId !== activeBank.id', 'A practice set from a different bank must not open in the active bank.');
requireText('boards-builder.js', 'Banks.list()', 'The practice builder must populate from the bank catalog.');
requireText('boards-builder.js', 'Banks.select(bank.id)', 'The practice builder must switch banks through the registry.');
requireText('boards-builder.js', 'Progress, tests, backups, and settings remain separate for each bank.', 'The bank-switch confirmation must explain data isolation.');
requireText('ui/question-bank-selector-view.js', '<details id="questionBankSelector"', 'The question-bank selector must be expandable.');
requireText('ui/question-bank-selector-view.js', 'Future validated banks will appear here automatically', 'The selector must explain future-bank registration.');

requireText('boards-exam-v2.js', 'BoardsExamRuntimePayloads', 'The exam iframe must receive an active-bank runtime payload.');
requireText('boards-exam-v2.js', 'window.QUESTIONS=payload.questions.slice()', 'The exam must load the selected bank before app.js starts.');
requireText('boards-exam-v2.js', 'key==="kaplanBoardPrepState"?appKey:key', 'The exam must map app state to the active bank namespace.');
requireText('boards-exam-v2.js', 'keys: { app: C.KEY.app, config: C.KEY.config, history: C.KEY.history }', 'The exam must receive bank-aware storage keys.');
requireText('boards-exam-v2.js', 'bankId: bank.id', 'Exam results must retain bank provenance.');
requireText('boards-exam-v2.js', 'message.bankId !== C.activeBank.id', 'Cross-bank iframe messages must be rejected.');

if (read('boards-config.js').includes("legacy ? 'abpnBank:")) failures.push('The K&S legacy bank must never be moved into a new namespace.');
if (read('boards-exam-v2.js').includes("examFrame.src = './index.html?boards='")) failures.push('The exam may not reopen the hard-coded K&S runtime path.');

if (failures.length) {
  console.error(`Question-bank architecture validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Question-bank selector, isolation, provenance, and exam-runtime safeguards passed.');