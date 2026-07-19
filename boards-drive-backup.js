(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  const Panels = window.BoardsPanelTemplates;
  const Registry = window.BoardsDashboardRegistry;
  if (!Config || !Store || !C || !Panels || !Registry) throw new Error('Drive backup dependencies are unavailable.');

  const Drive = Config.drive;
  const Keys = Config.storage.keys;
  const SYNC_STATE_EVENT = 'ksboards:drive-sync-state';

  let tokenClient = null;
  let accessToken = '';
  let tokenExpiresAt = 0;
  let connected = false;
  let syncing = false;
  let syncReady = false;
  let conflict = false;
  let remoteCurrent = null;
  let remoteHistory = { schemaVersion: Config.schemaVersion, projectId: Config.projectId, updatedAt: 0, snapshots: [], file: null };
  let lastUploadedHash = '';
  let lastSignificantHash = '';
  let lastUploadAt = 0;
  let pendingTimer = null;
  let pendingMilestoneReason = '';
  let pendingAutomaticSync = false;

  function settings() {
    const value = Store.read(Keys.driveSettings, {});
    if (typeof value.autoBackup !== 'boolean') value.autoBackup = true;
    return value;
  }

  function saveSettings(patch) {
    const value = Object.assign({}, settings(), patch || {});
    Store.write(Keys.driveSettings, value, { reason: 'Drive backup settings updated' });
    return value;
  }

  function formatDate(value) {
    if (!value) return 'Never';
    return new Date(value).toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function currentSnapshot(reason) {
    return Store.captureSnapshot(reason || 'Current Drive backup', true, 'current');
  }

  function historySnapshot(reason) {
    return Store.captureSnapshot(reason || 'Historical Drive snapshot', false, 'history');
  }

  function significantHash() {
    const tests = Store.read(Keys.tests, []);
    const backups = Store.read(Keys.localBackups, []);
    const deleted = Store.read(Keys.deletedTests, []);
    const config = Store.read(Keys.config, null);
    const compact = {
      tests: Array.isArray(tests) ? tests.map(function (test) { return [test.setId, test.completedAt, test.scorePct, test.total]; }) : [],
      backups: Array.isArray(backups) ? backups.map(function (backup) { return [backup.id, backup.createdAt, backup.reason]; }) : [],
      deleted: Array.isArray(deleted) ? deleted.slice() : [],
      completed: config && config.status === 'completed' ? [config.setId, config.completedAt] : null
    };
    return Store.hashString(JSON.stringify(compact));
  }

  function summary(snapshot) {
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

  function setStatus(message, tone) {
    const element = document.getElementById('driveBackupStatus');
    if (element) {
      element.textContent = message;
      element.className = 'drive-backup-status ' + (tone || 'neutral');
    }
    emitSyncState();
  }

  function updateUi() {
    const connect = document.getElementById('connectGoogleDrive');
    const backup = document.getElementById('driveBackupNow');
    const restore = document.getElementById('driveRestoreLatest');
    const disconnect = document.getElementById('disconnectGoogleDrive');
    const revoke = document.getElementById('revokeGoogleDrive');
    const auto = document.getElementById('driveAutoBackup');
    const last = document.getElementById('driveLastSync');
    const cloud = document.getElementById('driveCloudSummary');

    if (connect) { connect.textContent = connected ? 'Google Drive connected' : 'Connect Google Drive'; connect.disabled = connected || syncing; }
    if (backup) backup.disabled = !connected || syncing;
    if (restore) restore.disabled = !connected || syncing || !remoteCurrent;
    if (disconnect) disconnect.disabled = !connected;
    if (revoke) revoke.disabled = !connected || syncing;
    if (auto) auto.checked = settings().autoBackup;
    if (last) last.textContent = 'Last successful sync: ' + formatDate(settings().lastSyncedAt);
    if (cloud) {
      if (!remoteCurrent) cloud.textContent = connected ? 'No current Drive backup found yet.' : 'Connect to inspect your hidden Drive backup.';
      else {
        const data = summary(remoteCurrent.snapshot);
        cloud.textContent = data.questions + ' questions with saved responses · ' + data.tests + ' saved tests · ' + data.recoveryBackups + ' recovery backups';
      }
    }
    renderCloudHistory();
    emitSyncState();
  }

  function mountUi() {
    const existing = document.getElementById('driveBackupSection');
    if (existing) return existing;
    const section = Panels.createDriveBackupSection();
    section.querySelector('#connectGoogleDrive').addEventListener('click', connectDrive);
    section.querySelector('#driveBackupNow').addEventListener('click', function () { manualBackup().catch(handleError); });
    section.querySelector('#driveRestoreLatest').addEventListener('click', function () { restoreLatest().catch(handleError); });
    section.querySelector('#disconnectGoogleDrive').addEventListener('click', function () { disconnectSession('Disconnected from Google Drive for this browser session.'); });
    section.querySelector('#revokeGoogleDrive').addEventListener('click', revokeAccess);
    section.querySelector('#driveAutoBackup').addEventListener('change', function (event) { saveSettings({ autoBackup: !!event.target.checked }); if (event.target.checked) scheduleAutoBackup(500); });
    setTimeout(updateUi, 0);
    return section;
  }

  function ensureUi() {
    if (document.getElementById('driveBackupSection')) return;
    Registry.register({ id: 'private-drive-backup', region: 'data-tools', order: 200, mount: mountUi });
  }

  function tokenValid() { return !!accessToken && Date.now() < tokenExpiresAt - 30000; }

  function initializeTokenClient() {
    if (tokenClient) return true;
    if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: Drive.clientId,
      scope: Drive.scope,
      callback: function (response) {
        if (!response || response.error || !response.access_token) {
          pendingAutomaticSync = false;
          setStatus('Google authorization was not completed.', 'error');
          return;
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, Drive.scope)) {
          pendingAutomaticSync = false;
          setStatus('The hidden app-data permission was not granted.', 'error');
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        connected = true;
        setStatus('Connected securely. Checking for an existing Drive backup…', 'neutral');
        updateUi();
        inspectRemote().then(function () {
          if (!pendingAutomaticSync) return null;
          pendingAutomaticSync = false;
          return syncLatest({ skipInspect: true });
        }).catch(function (error) {
          pendingAutomaticSync = false;
          handleError(error);
        });
      },
      error_callback: function () {
        pendingAutomaticSync = false;
        setStatus('The Google authorization window was closed or blocked.', 'error');
      }
    });
    return true;
  }

  function connectDrive() {
    if (!initializeTokenClient()) {
      setStatus('Google authorization is still loading. Try Connect again in a moment.', 'warning');
      return false;
    }
    tokenClient.requestAccessToken({ prompt: '' });
    return true;
  }

  function clearConnectionState() {
    accessToken = '';
    tokenExpiresAt = 0;
    connected = false;
    syncing = false;
    syncReady = false;
    conflict = false;
    pendingAutomaticSync = false;
    remoteCurrent = null;
    remoteHistory = { schemaVersion: Config.schemaVersion, projectId: Config.projectId, updatedAt: 0, snapshots: [], file: null };
    clearTimeout(pendingTimer);
  }

  function disconnectSession(message) { clearConnectionState(); setStatus(message || 'Disconnected from Google Drive for this browser session.', 'neutral'); updateUi(); }

  function revokeAccess() {
    if (!tokenValid() || !window.google || !google.accounts || !google.accounts.oauth2) { disconnectSession('The session was disconnected. Google authorization had already expired.'); return; }
    if (!confirm('Revoke this app’s Google Drive permission? You will need to authorize it again before future cloud backups.')) return;
    const token = accessToken;
    syncing = true;
    updateUi();
    google.accounts.oauth2.revoke(token, function (result) {
      clearConnectionState();
      if (result && result.successful) setStatus('Google Drive access was revoked successfully.', 'good');
      else setStatus('The session was disconnected, but Google did not confirm revocation. You can also remove access in your Google Account settings.', 'warning');
      updateUi();
    });
  }

  function wait(milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); }

  async function driveFetch(url, options, attempt) {
    const retryAttempt = Number(attempt) || 0;
    if (!tokenValid()) { disconnectSession('Google authorization expired. Click Connect Google Drive again.'); throw new Error('Google authorization expired. Click Connect Google Drive again.'); }
    const request = Object.assign({}, options || {});
    const headers = new Headers(request.headers || {});
    headers.set('Authorization', 'Bearer ' + accessToken);
    request.headers = headers;
    const response = await fetch(url, request);
    if (response.status === 401) { disconnectSession('Google authorization expired. Click Connect Google Drive again.'); throw new Error('Google authorization expired. Click Connect Google Drive again.'); }
    if ((response.status === 429 || response.status >= 500) && retryAttempt < Drive.retryLimit) {
      await wait(500 * Math.pow(2, retryAttempt) + Math.floor(Math.random() * 250));
      return driveFetch(url, options, retryAttempt + 1);
    }
    if (!response.ok) { const body = await response.text(); throw new Error('Google Drive request failed (' + response.status + '). ' + body.slice(0, 180)); }
    return response;
  }

  function driveQueryName(name) { return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  async function findFile(name) {
    const query = "name='" + driveQueryName(name) + "' and trashed=false";
    const response = await driveFetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=10&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size,appProperties)&q=' + encodeURIComponent(query));
    const data = await response.json();
    return data.files && data.files.length ? data.files[0] : null;
  }
  async function readDriveJson(file) { if (!file) return null; return (await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media')).json(); }

  async function createDriveJson(name, payload, type) {
    const boundary = 'ks_board_' + Math.random().toString(36).slice(2);
    const metadata = { name: name, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { projectId: Config.projectId, backupType: type, schemaVersion: String(Config.schemaVersion) } };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(payload) + '\r\n--' + boundary + '--';
    return (await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body })).json();
  }
  async function updateDriveJson(file, payload) { return (await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=id,name,modifiedTime,size', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(); }
  function upsertDriveJson(file, name, payload, type) { return file ? updateDriveJson(file, payload) : createDriveJson(name, payload, type); }

  function normalizeHistoryPayload(payload, file) {
    const result = { schemaVersion: Config.schemaVersion, projectId: Config.projectId, updatedAt: Number(payload && payload.updatedAt) || 0, snapshots: [], file: file || null };
    const snapshots = payload && Array.isArray(payload.snapshots) ? payload.snapshots : [];
    snapshots.forEach(function (record) {
      try {
        const state = Store.normalizeSnapshot(record.state || record);
        result.snapshots.push({ id: record.id || ('cloud-' + state.createdAt + '-' + Math.random().toString(36).slice(2, 7)), createdAt: Number(record.createdAt) || state.createdAt, reason: record.reason || state.reason, hash: state.hash, state: state });
      } catch (error) { console.warn('Skipped an invalid Drive history record.', error); }
    });
    return result;
  }

  async function inspectRemote() {
    syncing = true;
    updateUi();
    try {
      const currentFile = await findFile(Drive.currentFile);
      const historyFile = await findFile(Drive.historyFile);
      const currentPayload = currentFile ? await readDriveJson(currentFile) : null;
      const historyPayload = historyFile ? await readDriveJson(historyFile) : null;
      remoteCurrent = currentFile && currentPayload ? { file: currentFile, snapshot: Store.normalizeSnapshot(currentPayload) } : null;
      remoteHistory = normalizeHistoryPayload(historyPayload, historyFile);
      const local = currentSnapshot('Connection check');
      if (!remoteCurrent) {
        syncReady = true; conflict = false; await uploadCurrent(local, true, 'Initial cloud backup'); setStatus('Connected and backed up. Automatic backup is ready.', 'good');
      } else if (remoteCurrent.snapshot.hash === local.hash) {
        syncReady = true; conflict = false; lastUploadedHash = local.hash; lastSignificantHash = significantHash();
        if (remoteCurrent.snapshot.schemaVersion !== Config.schemaVersion) await uploadCurrent(local, false);
        setStatus('Connected. This browser matches the latest Drive backup.', 'good');
      } else {
        syncReady = false; conflict = true; setStatus('Drive contains different study data. Automatic sync will compare timestamps before choosing a source.', 'warning');
      }
    } finally { syncing = false; updateUi(); }
  }

  function trimHistory(payload) { payload.snapshots = (payload.snapshots || []).slice(0, Drive.maxHistory); while (payload.snapshots.length > 1 && JSON.stringify(payload).length > Drive.maxHistoryBytes) payload.snapshots.pop(); return payload; }

  async function appendCloudHistory(snapshot, reason) {
    const normalized = Store.normalizeSnapshot(snapshot);
    const list = Array.isArray(remoteHistory.snapshots) ? remoteHistory.snapshots.slice() : [];
    if (list.length && list[0].hash === normalized.hash) return;
    list.unshift({ id: 'cloud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), createdAt: Date.now(), reason: reason || normalized.reason || 'Cloud snapshot', hash: normalized.hash, state: normalized });
    const payload = trimHistory({ schemaVersion: Config.schemaVersion, projectId: Config.projectId, updatedAt: Date.now(), snapshots: list });
    const metadata = await upsertDriveJson(remoteHistory.file, Drive.historyFile, payload, 'history');
    remoteHistory = normalizeHistoryPayload(payload, metadata);
  }

  async function uploadCurrent(snapshot, addHistory, historyReason) {
    const normalized = Store.normalizeSnapshot(snapshot);
    const metadata = await upsertDriveJson(remoteCurrent && remoteCurrent.file, Drive.currentFile, normalized, 'current');
    remoteCurrent = { file: metadata, snapshot: normalized };
    lastUploadedHash = normalized.hash;
    lastUploadAt = Date.now();
    saveSettings({ lastSyncedAt: lastUploadAt, lastSyncedHash: normalized.hash });
    if (addHistory) await appendCloudHistory(historySnapshot(historyReason || normalized.reason), historyReason || normalized.reason);
    lastSignificantHash = significantHash();
  }

  async function pushLocalAsLatest(options) {
    if (!connected || syncing) return { action: 'unavailable', state: getSyncState() };
    const config = options || {};
    syncing = true;
    updateUi();
    setStatus(config.statusMessage || 'Saving this device as the latest Google Drive copy…', 'neutral');
    try {
      const local = currentSnapshot(config.snapshotReason || 'Device chosen as latest');
      const differentRemote = !!(remoteCurrent && remoteCurrent.snapshot.hash !== local.hash);
      if (config.confirmOverwrite && differentRemote && !confirm('This will make the current browser data the latest Drive backup. The existing Drive state will first be preserved in cloud history. Continue?')) {
        return { action: 'cancelled', state: getSyncState() };
      }
      if (differentRemote) await appendCloudHistory(remoteCurrent.snapshot, config.remoteHistoryReason || 'Drive state before device overwrite');
      await uploadCurrent(local, true, config.historyReason || 'Device selected as latest source');
      syncReady = true;
      conflict = false;
      pendingMilestoneReason = '';
      setStatus('Sync complete. This device is now the latest copy in Google Drive.', 'good');
      return { action: 'used-local', state: getSyncState() };
    } finally {
      syncing = false;
      updateUi();
    }
  }

  async function manualBackup() {
    return pushLocalAsLatest({
      confirmOverwrite: true,
      snapshotReason: 'Manual Drive backup',
      historyReason: 'Manual cloud backup',
      remoteHistoryReason: 'Drive state before browser overwrite',
      statusMessage: 'Saving this browser to Google Drive…'
    });
  }

  function applySnapshot(snapshot) {
    const rescueBackups = Store.read(Keys.localBackups, []);
    if (window.BoardsMaintenance && window.BoardsMaintenance.backupNow) window.BoardsMaintenance.backupNow('Before restoring from Google Drive', { type: 'pre-drive-restore' });
    const latestBackups = Store.read(Keys.localBackups, []).concat(rescueBackups).filter(function (backup, index, array) { return backup && backup.id && array.findIndex(function (candidate) { return candidate.id === backup.id; }) === index; }).slice(0, Config.limits.localBackups);
    Store.applySnapshot(snapshot, { preserveKeys: [Keys.localBackups, Keys.driveSettings] });
    Store.write(Keys.localBackups, latestBackups, { reason: 'Local recovery retained after Drive restore' });
    saveSettings({ lastRestoredAt: Date.now() });
    window.location.reload();
  }

  async function pullDriveAsLatest(options) {
    if (!remoteCurrent || syncing) return { action: 'unavailable', state: getSyncState() };
    const config = options || {};
    if (config.confirmRestore && !confirm('Restore the latest Google Drive backup on this browser? The current browser state will first be preserved in cloud and local recovery history.')) {
      return { action: 'cancelled', state: getSyncState() };
    }
    syncing = true;
    updateUi();
    setStatus(config.statusMessage || 'Retrieving the latest Google Drive copy onto this device…', 'neutral');
    try {
      await appendCloudHistory(historySnapshot(config.localHistoryReason || 'Browser state before Drive restore'), config.localHistoryReason || 'Browser state before Drive restore');
      const snapshot = remoteCurrent.snapshot;
      setStatus('Drive copy selected. Restoring this device now…', 'good');
      applySnapshot(snapshot);
      return { action: 'used-drive', state: getSyncState() };
    } finally {
      syncing = false;
      updateUi();
    }
  }

  async function restoreLatest() {
    return pullDriveAsLatest({ confirmRestore: true });
  }

  async function chooseSource(source) {
    if (source === 'local') {
      return pushLocalAsLatest({
        confirmOverwrite: false,
        snapshotReason: 'Device manually selected as latest',
        historyReason: 'Manual source choice: device',
        remoteHistoryReason: 'Drive state before manual device choice'
      });
    }
    if (source === 'drive') {
      return pullDriveAsLatest({
        confirmRestore: false,
        localHistoryReason: 'Browser state before manual Drive choice'
      });
    }
    throw new Error('Choose either this device or Google Drive as the sync source.');
  }

  async function syncLatest(options) {
    const config = options || {};
    if (!connected) {
      pendingAutomaticSync = true;
      if (!connectDrive()) {
        pendingAutomaticSync = false;
        throw new Error('Google authorization is still loading. Try Sync now again in a moment.');
      }
      return { action: 'connecting', state: getSyncState() };
    }
    if (syncing) return { action: 'busy', state: getSyncState() };

    try {
      if (!config.skipInspect) await inspectRemote();
      const state = getSyncState();
      if (state.relation === 'in-sync') {
        setStatus('Already in sync. This device and Google Drive match.', 'good');
        return { action: 'in-sync', state: state };
      }
      if (state.relation === 'no-drive-backup' || state.relation === 'local-newer') {
        return pushLocalAsLatest({
          confirmOverwrite: false,
          snapshotReason: 'Automatic newest-copy sync from device',
          historyReason: 'Automatic sync: device was newer',
          remoteHistoryReason: 'Drive state before automatic device update'
        });
      }
      if (state.relation === 'drive-newer') {
        return pullDriveAsLatest({
          confirmRestore: false,
          localHistoryReason: 'Browser state before automatic Drive update'
        });
      }
      setStatus('Automatic sync could not safely determine the newest copy. Choose the source manually.', 'warning');
      return { action: 'needs-choice', state: state };
    } catch (error) {
      handleError(error);
      throw error;
    }
  }

  async function restoreHistory(id) {
    const record = remoteHistory.snapshots.find(function (item) { return item.id === id; });
    if (!record || !confirm('Restore this historical Drive snapshot? The current browser state will first be preserved.')) return;
    syncing = true; updateUi();
    try { await appendCloudHistory(historySnapshot('Browser state before historical restore'), 'Browser state before historical restore'); applySnapshot(record.state); }
    finally { syncing = false; updateUi(); }
  }

  function renderCloudHistory() {
    const container = document.getElementById('driveCloudHistory');
    if (!container) return;
    if (!connected) { container.innerHTML = Panels.emptyState('Connect Google Drive to load cloud history.'); return; }
    const list = remoteHistory.snapshots || [];
    container.innerHTML = Panels.cloudHistoryRows(list, formatDate, summary);
    container.querySelectorAll('.restore-cloud-history').forEach(function (button) { button.addEventListener('click', function () { restoreHistory(button.getAttribute('data-id')).catch(handleError); }); });
  }

  async function autoBackup() {
    if (!connected || !syncReady || syncing || !settings().autoBackup || !tokenValid()) return;
    const snapshot = currentSnapshot('Automatic Drive backup');
    if (snapshot.hash === lastUploadedHash && !pendingMilestoneReason) return;
    if (Date.now() - lastUploadAt < Drive.autoSyncMinMs) { scheduleAutoBackup(Drive.autoSyncMinMs - (Date.now() - lastUploadAt) + 500); return; }
    syncing = true; updateUi();
    try {
      const significant = significantHash();
      const historyReason = pendingMilestoneReason || (lastSignificantHash && significant !== lastSignificantHash ? 'Completed test or recovery milestone' : '');
      await uploadCurrent(snapshot, !!historyReason, historyReason || undefined);
      pendingMilestoneReason = '';
      setStatus('Automatically backed up at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.', 'good');
    } finally { syncing = false; updateUi(); }
  }

  function scheduleAutoBackup(delay) { clearTimeout(pendingTimer); pendingTimer = setTimeout(function () { autoBackup().catch(handleError); }, Math.max(500, Number(delay) || 5000)); }
  function handleError(error) { syncing = false; updateUi(); setStatus(error && error.message ? error.message : 'Google Drive backup failed.', 'error'); console.error(error); }

  function init() {
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.BoardsDriveBackup = Object.freeze({
    connect: connectDrive,
    backupNow: manualBackup,
    restoreLatest: restoreLatest,
    syncLatest: syncLatest,
    chooseSource: chooseSource,
    disconnect: disconnectSession,
    revoke: revokeAccess,
    getSyncState: getSyncState,
    syncStateEvent: SYNC_STATE_EVENT
  });
})();
