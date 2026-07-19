import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }
function replaceOnce(file, before, after) {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Expected patch target was not found in ${file}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Patch target is ambiguous in ${file}`);
  write(file, source.replace(before, after));
}

replaceOnce(
  'boards-drive-backup.js',
  "  let pendingMilestoneReason = '';\n",
  "  let pendingMilestoneReason = '';\n  const SYNC_STATE_EVENT = 'ksboards:drive-sync-state';\n"
);

replaceOnce(
  'boards-drive-backup.js',
  `  function summary(snapshot) {
    const normalized = snapshot ? Store.normalizeSnapshot(snapshot) : null;
    const data = normalized ? normalized.data : {};
    const app = data[Keys.app] || {};
    const tests = data[Keys.tests] || [];
    const backups = data[Keys.localBackups] || [];
    const answered = new Set(Object.keys(app.answered || {}).concat(Object.keys(app.testAnswers || {})));
    return { questions: answered.size, tests: Array.isArray(tests) ? tests.length : 0, recoveryBackups: Array.isArray(backups) ? backups.length : 0 };
  }
`,
  `  function summary(snapshot) {
    const normalized = snapshot ? Store.normalizeSnapshot(snapshot) : null;
    const data = normalized ? normalized.data : {};
    const app = data[Keys.app] || {};
    const tests = data[Keys.tests] || [];
    const backups = data[Keys.localBackups] || [];
    const answered = new Set(Object.keys(app.answered || {}).concat(Object.keys(app.testAnswers || {})));
    return { questions: answered.size, tests: Array.isArray(tests) ? tests.length : 0, recoveryBackups: Array.isArray(backups) ? backups.length : 0 };
  }

  function addTimestamp(values, value) {
    const timestamp = Number(value) || 0;
    if (timestamp > 0) values.push(timestamp);
  }

  function inferLocalUpdatedAt(snapshot, currentSettings) {
    const values = [];
    const data = snapshot && snapshot.data ? snapshot.data : {};
    const config = data[Keys.config] || {};
    const tests = Array.isArray(data[Keys.tests]) ? data[Keys.tests] : [];
    const backups = Array.isArray(data[Keys.localBackups]) ? data[Keys.localBackups] : [];
    const history = data[Keys.history] || {};
    const app = data[Keys.app] || {};

    addTimestamp(values, currentSettings && currentSettings.lastLocalChangeAt);
    addTimestamp(values, currentSettings && currentSettings.lastRestoredAt);
    addTimestamp(values, currentSettings && currentSettings.lastSyncedAt);
    ['createdAt', 'lastOpenedAt', 'completedAt', 'updatedAt'].forEach(function (key) { addTimestamp(values, config[key]); });
    ['updatedAt', 'lastUpdatedAt'].forEach(function (key) { addTimestamp(values, app[key]); });
    tests.forEach(function (test) { addTimestamp(values, test && test.createdAt); addTimestamp(values, test && test.completedAt); });
    backups.forEach(function (backup) { addTimestamp(values, backup && backup.createdAt); });
    Object.keys(history).forEach(function (key) { addTimestamp(values, history[key] && history[key].timestamp); });
    return values.length ? Math.max.apply(Math, values) : 0;
  }

  function driveUpdatedAt() {
    if (!remoteCurrent) return 0;
    const snapshotTime = Number(remoteCurrent.snapshot && remoteCurrent.snapshot.createdAt) || 0;
    const fileTime = Date.parse(remoteCurrent.file && remoteCurrent.file.modifiedTime) || 0;
    return Math.max(snapshotTime, fileTime);
  }

  function getSyncState() {
    const local = currentSnapshot('Sync comparison');
    const currentSettings = settings();
    const localTime = inferLocalUpdatedAt(local, currentSettings);
    const remoteTime = driveUpdatedAt();
    let relation = 'disconnected';

    if (connected) {
      if (syncing) relation = 'checking';
      else if (!remoteCurrent) relation = 'no-drive-backup';
      else if (remoteCurrent.snapshot.hash === local.hash) relation = 'in-sync';
      else if (localTime && remoteTime && localTime > remoteTime + 1000) relation = 'local-newer';
      else if (localTime && remoteTime && remoteTime > localTime + 1000) relation = 'drive-newer';
      else relation = 'different';
    }

    return {
      connected: connected,
      syncing: syncing,
      syncReady: syncReady,
      conflict: conflict,
      relation: relation,
      lastSyncedAt: Number(currentSettings.lastSyncedAt) || 0,
      local: { updatedAt: localTime, hash: local.hash, summary: summary(local) },
      drive: remoteCurrent ? { updatedAt: remoteTime, hash: remoteCurrent.snapshot.hash, summary: summary(remoteCurrent.snapshot) } : null
    };
  }

  function emitSyncState() {
    try { window.dispatchEvent(new CustomEvent(SYNC_STATE_EVENT, { detail: getSyncState() })); }
    catch (error) { console.warn('Could not publish Drive sync state.', error); }
  }
`
);

replaceOnce(
  'boards-drive-backup.js',
  `  function setStatus(message, tone) {
    const element = document.getElementById('driveBackupStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }
`,
  `  function setStatus(message, tone) {
    const element = document.getElementById('driveBackupStatus');
    if (element) {
      element.textContent = message;
      element.className = 'drive-backup-status ' + (tone || 'neutral');
    }
    emitSyncState();
  }
`
);

replaceOnce(
  'boards-drive-backup.js',
  `    renderCloudHistory();
  }

  function mountUi()`,
  `    renderCloudHistory();
    emitSyncState();
  }

  function mountUi()`
);

replaceOnce(
  'boards-drive-backup.js',
  `  function init() {
    ensureUi();
    initializeTokenClient();
    Store.subscribe(function (change) {
      if (!connected || !settings().autoBackup || change.key === Keys.driveSettings) return;
      scheduleAutoBackup(change.key === Keys.config && change.reason === 'Question timing updated' ? 10000 : 5000);
    });
    window.addEventListener(Config.events.milestone, function (event) {
      pendingMilestoneReason = event.detail && event.detail.reason ? event.detail.reason : 'Study milestone';
      if (connected && settings().autoBackup) scheduleAutoBackup(500);
    });
    window.addEventListener('message', function () { if (connected && settings().autoBackup) scheduleAutoBackup(5000); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && connected && settings().autoBackup) scheduleAutoBackup(0); });
  }
`,
  `  function init() {
    ensureUi();
    initializeTokenClient();
    const initialSettings = settings();
    if (!Number(initialSettings.lastLocalChangeAt)) {
      const inferred = inferLocalUpdatedAt(currentSnapshot('Initial local sync status'), initialSettings);
      if (inferred) saveSettings({ lastLocalChangeAt: inferred });
    }
    Store.subscribe(function (change) {
      if (change.key !== Keys.driveSettings) {
        const changedAt = Number(change.timestamp) || Date.now();
        const currentSettings = settings();
        if (changedAt > Number(currentSettings.lastLocalChangeAt || 0)) {
          saveSettings({
            lastLocalChangeAt: changedAt,
            lastLocalChangeReason: change.reason || change.action || 'Study data changed'
          });
        }
      }
      emitSyncState();
      if (!connected || !settings().autoBackup || change.key === Keys.driveSettings) return;
      scheduleAutoBackup(change.key === Keys.config && change.reason === 'Question timing updated' ? 10000 : 5000);
    });
    window.addEventListener(Config.events.milestone, function (event) {
      pendingMilestoneReason = event.detail && event.detail.reason ? event.detail.reason : 'Study milestone';
      if (connected && settings().autoBackup) scheduleAutoBackup(500);
      emitSyncState();
    });
    window.addEventListener('message', function () { if (connected && settings().autoBackup) scheduleAutoBackup(5000); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && connected && settings().autoBackup) scheduleAutoBackup(0); });
    emitSyncState();
  }
`
);

replaceOnce(
  'boards-drive-backup.js',
  "  window.BoardsDriveBackup = Object.freeze({ connect: connectDrive, backupNow: manualBackup, restoreLatest: restoreLatest, disconnect: disconnectSession, revoke: revokeAccess });",
  "  window.BoardsDriveBackup = Object.freeze({ connect: connectDrive, backupNow: manualBackup, restoreLatest: restoreLatest, disconnect: disconnectSession, revoke: revokeAccess, getSyncState: getSyncState, syncStateEvent: SYNC_STATE_EVENT });"
);

const oldCard = `      <section id="deviceSyncCard" class="device-sync-card dashboard-card" aria-labelledby="deviceSyncTitle">
        <div class="device-sync-heading">
          <div>
            <div class="card-kicker">DEVICE SYNC</div>
            <h3 id="deviceSyncTitle">Keep your progress available on every device</h3>
            <p>Your answers are stored in each browser. Google Drive safely transfers the latest study state between your phone, tablet, and computer.</p>
          </div>
          <div id="deviceSyncStatus" class="device-sync-status neutral" aria-live="polite">Not connected</div>
        </div>

        <div class="device-sync-steps" aria-label="Three steps for moving study progress between devices">
          <div class="device-sync-step">
            <span class="device-sync-number">1</span>
            <div><strong>Start on the device with your newest progress</strong><span>Connect the same Google account you will use on your other devices.</span></div>
          </div>
          <div class="device-sync-step">
            <span class="device-sync-number">2</span>
            <div><strong>Back up this device</strong><span>Press the backup button before changing devices, or wait for automatic backup to finish.</span></div>
          </div>
          <div class="device-sync-step">
            <span class="device-sync-number">3</span>
            <div><strong>Restore on the other device</strong><span>Open this page there, connect the same account, then restore Drive onto that browser.</span></div>
          </div>
        </div>

        <div class="device-sync-actions" role="group" aria-label="Cross-device sync controls">
          <button type="button" id="deviceSyncConnect" class="primary-button" disabled>Connect Google Drive</button>
          <button type="button" id="deviceSyncBackup" class="secondary-button" disabled>Back up this device</button>
          <button type="button" id="deviceSyncRestore" class="secondary-button" disabled>Restore Drive onto this device</button>
          <button type="button" id="deviceSyncDetails" class="secondary-button">More sync details</button>
        </div>

        <div id="deviceSyncMessage" class="device-sync-message" aria-live="polite"><strong>Important:</strong> use one device at a time. Before switching, make sure the latest device has completed a backup.</div>
        <div id="deviceSyncLastSync" class="field-help">Last successful sync: Never</div>
      </section>`;

const newCard = `      <section id="deviceSyncCard" class="device-sync-card dashboard-card" aria-labelledby="deviceSyncTitle">
        <div class="device-sync-heading">
          <div>
            <div class="card-kicker">DEVICE SYNC</div>
            <h3 id="deviceSyncTitle">Which copy has your newest progress?</h3>
            <p>Compare this browser with your private Google Drive backup before switching devices. Nothing is replaced until you choose.</p>
          </div>
          <div id="deviceSyncStatus" class="device-sync-status neutral" aria-live="polite">Not connected</div>
        </div>

        <div class="device-sync-comparison" aria-label="Comparison of this device and Google Drive backup">
          <article class="device-sync-copy">
            <span class="device-sync-copy-kicker">THIS DEVICE</span>
            <strong id="deviceSyncLocalTime">Not recorded yet</strong>
            <p id="deviceSyncLocalSummary">0 questions with saved responses · 0 saved tests · 0 recovery backups</p>
          </article>
          <div class="device-sync-bridge" aria-hidden="true">↔</div>
          <article class="device-sync-copy">
            <span class="device-sync-copy-kicker">GOOGLE DRIVE BACKUP</span>
            <strong id="deviceSyncDriveTime">Connect to check</strong>
            <p id="deviceSyncDriveSummary">The app cannot inspect the private backup until you connect.</p>
          </article>
        </div>
        <div id="deviceSyncTimezone" class="device-sync-timezone"></div>

        <div id="deviceSyncMessage" class="device-sync-message" aria-live="polite"><strong id="deviceSyncRecommendation">Connect Google Drive to compare copies</strong><span>Nothing will be overwritten when you connect.</span></div>

        <div class="device-sync-actions" role="group" aria-label="Choose the latest cross-device study copy">
          <button type="button" id="deviceSyncConnect" class="primary-button" disabled>Connect Google Drive</button>
          <button type="button" id="deviceSyncBackup" class="secondary-button" disabled>Use this device as latest</button>
          <button type="button" id="deviceSyncRestore" class="secondary-button" disabled>Get latest from Drive</button>
          <button type="button" id="deviceSyncDetails" class="secondary-button">More sync details</button>
        </div>

        <div class="device-sync-steps" aria-label="Safe steps for switching devices">
          <div class="device-sync-step"><span class="device-sync-number">1</span><div><strong>Finish on the current device</strong><span>Use only one device at a time.</span></div></div>
          <div class="device-sync-step"><span class="device-sync-number">2</span><div><strong>Make the newest copy latest</strong><span>Choose this device or Drive after reviewing the timestamps.</span></div></div>
          <div class="device-sync-step"><span class="device-sync-number">3</span><div><strong>Open the other device</strong><span>Connect the same Google account and compare again.</span></div></div>
        </div>

        <div class="device-sync-footer"><div id="deviceSyncLastSync" class="field-help">No completed transfer recorded on this browser.</div><div class="field-help">Both overwrite choices create recovery history first.</div></div>
      </section>`;
replaceOnce('boards.html', oldCard, newCard);
replaceOnce('boards.html', './styles/device-sync.css?v=1', './styles/device-sync.css?v=2');
replaceOnce('boards.html', './boards-drive-backup.js?v=3', './boards-drive-backup.js?v=4');
replaceOnce('boards.html', './boards-device-sync.js?v=1', './boards-device-sync.js?v=2');

replaceOnce(
  'scripts/validate.mjs',
  `if (html.includes('<style>')) fail('boards.html must not contain embedded presentation CSS.');
`,
  `if (html.includes('<style>')) fail('boards.html must not contain embedded presentation CSS.');
for (const deviceSyncElement of ['deviceSyncLocalTime', 'deviceSyncDriveTime', 'deviceSyncBackup', 'deviceSyncRestore']) {
  if (!html.includes('id="' + deviceSyncElement + '"')) fail('Timestamp-aware Device Sync control is missing: ' + deviceSyncElement);
}
`
);

replaceOnce(
  'scripts/validate.mjs',
  `const driveCode = [
  read('boards-drive-backup.js'), read('boards-visible-drive-client.js'), read('boards-question-vault.js'),
  read('boards-hard-reset.js'), read('boards-config.js')
].join('\n');
`,
  `const driveCode = [
  read('boards-drive-backup.js'), read('boards-visible-drive-client.js'), read('boards-question-vault.js'),
  read('boards-hard-reset.js'), read('boards-config.js')
].join('\n');
const privateDriveCode = read('boards-drive-backup.js');
for (const capability of ['getSyncState', 'lastLocalChangeAt', 'ksboards:drive-sync-state', 'local-newer', 'drive-newer']) {
  if (!privateDriveCode.includes(capability)) fail('Timestamp-aware Drive sync capability is missing: ' + capability);
}
`
);

console.log('Applied timestamp-aware Device Sync patch.');
