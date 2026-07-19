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
  'appendCloudHistory(remoteCurrent.snapshot',
  'historySnapshot(config.localHistoryReason',
  "window.BoardsMaintenance.backupNow('Before restoring from Google Drive'",
  'preserveKeys: [Keys.localBackups, Keys.driveSettings]'
]) requireText(service, safeguard, 'Recovery-history safeguard');

for (const capability of [
  'runAutomaticSync',
  "result.action === 'needs-choice'",
  'openChoiceDialog',
  'Sync encountered an error:',
  "chooseSource('local')",
  "chooseSource('drive')"
]) requireText(controller, capability, 'Single-action Device Sync controller capability');

for (const elementId of [
  'deviceSyncNow',
  'deviceSyncChoiceDialog',
  'deviceSyncChooseLocal',
  'deviceSyncChooseDrive',
  'deviceSyncChoiceReason'
]) requireText(view, elementId, 'Device Sync view element');

for (const forbidden of ['deviceSyncChoose"', 'deviceSyncDetails"', 'device-sync-comparison', 'device-sync-steps']) {
  if (view.includes(forbidden)) failures.push(`Visible Device Sync must not expose extra controls or process clutter: ${forbidden}`);
}

const buttonMatches = [...view.matchAll(/<button\b/g)];
const dialogIndex = view.indexOf('<dialog');
const visibleBeforeDialog = dialogIndex >= 0 ? view.slice(0, dialogIndex) : view;
const visibleButtons = [...visibleBeforeDialog.matchAll(/<button\b/g)].length;
if (visibleButtons !== 1) failures.push(`Device Sync card must expose exactly one visible action button; found ${visibleButtons}.`);
if (!style.includes('#driveBackupSection { display: none !important; }')) failures.push('Legacy detailed Drive controls must be hidden from the normal dashboard.');

for (const selector of ['.device-sync-dialog', '.device-sync-dialog-comparison', '.device-sync-choice-copy', '.device-sync-single-action']) {
  requireText(style, selector, 'Device Sync style');
}

if (buttonMatches.length < 4) failures.push('Fallback dialog controls are incomplete.');

if (failures.length) {
  console.error(`Device Sync validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('One-button Device Sync, automatic direction rules, fallback dialog, and recovery safeguards are present.');