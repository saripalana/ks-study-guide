import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const requireText = (content, text, label) => {
  if (!content.includes(text)) failures.push(`${label} is missing: ${text}`);
};

const service = read('boards-drive-backup.js');
const controller = read('boards-device-sync.js');
const view = read('ui/device-sync-view.js');
const style = read('styles/device-sync.css');

for (const capability of [
  'async function syncLatest',
  "state.relation === 'local-newer'",
  "state.relation === 'drive-newer'",
  "action: 'needs-choice'",
  'async function chooseSource',
  "source === 'local'",
  "source === 'drive'"
]) requireText(service, capability, 'Automatic Drive sync service capability');

for (const safeguard of [
  "appendCloudHistory(remoteCurrent.snapshot",
  "historySnapshot(config.localHistoryReason",
  "window.BoardsMaintenance.backupNow('Before restoring from Google Drive'",
  "preserveKeys: [Keys.localBackups, Keys.driveSettings]"
]) requireText(service, safeguard, 'Recovery-history safeguard');

for (const capability of [
  'runAutomaticSync',
  "result.action === 'needs-choice'",
  'openChoiceDialog',
  'Automatic sync encountered an error:',
  "chooseSource('local')",
  "chooseSource('drive')"
]) requireText(controller, capability, 'Automatic Device Sync controller capability');

for (const elementId of [
  'deviceSyncNow',
  'deviceSyncChoose',
  'deviceSyncChoiceDialog',
  'deviceSyncChooseLocal',
  'deviceSyncChooseDrive',
  'deviceSyncChoiceReason'
]) requireText(view, elementId, 'Automatic Device Sync view element');

for (const selector of ['.device-sync-dialog', '.device-sync-dialog-comparison', '.device-sync-choice-copy']) {
  requireText(style, selector, 'Automatic Device Sync dialog style');
}

if (failures.length) {
  console.error(`Automatic Device Sync validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Automatic Device Sync decision rules, fallback dialog, and recovery safeguards are present.');
