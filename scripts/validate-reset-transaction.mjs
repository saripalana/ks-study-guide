import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(root, 'boards-hard-reset-service.js'), 'utf8');
const failures = [];
const requireText = (text, message) => { if (!code.includes(text)) failures.push(message); };

requireText("const resetId = 'reset-' + Config.bank.id", 'Reset transaction id is not created once at the beginning of execute().');
requireText('await archiveHiddenBackup(rescue, resetId);', 'Hidden Drive archive does not use the transaction resetId.');
requireText('await archiveVisibleStudyData(folders, resetId);', 'Visible Drive archive does not use the transaction resetId.');
requireText('await publishEmptyCloudState(folders, resetId);', 'Clean cloud state does not use the transaction resetId.');
requireText('emptyCurrent.resetId = resetId;', 'Clean hidden-Drive current state is missing the transaction resetId.');
requireText('lastResetId: resetId', 'Manifest/history reset identity is missing.');
requireText("resetScope: 'active-bank'", 'Reset change set is not explicitly active-bank scoped.');

const resetIdCreations = (code.match(/const resetId = 'reset-'/g) || []).length;
if (resetIdCreations !== 1) failures.push(`Expected exactly one reset transaction-id creation, found ${resetIdCreations}.`);
if (code.includes("key.indexOf('ksBoards')")) failures.push('Reset service must not broadly remove every K&S key.');
if (code.includes('localStorage.clear(')) failures.push('Reset service must not use blanket localStorage.clear().');
if (code.includes("method: 'DELETE'")) failures.push('Reset service must archive cloud data rather than deleting it.');

if (failures.length) {
  console.error(`Reset transaction validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Single-id, active-bank-only reset transaction safeguards passed.');