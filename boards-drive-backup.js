(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  if (!Config || !Store || !C) throw new Error('Drive backup dependencies are unavailable.');

  const Drive = Config.drive;
  const Keys = Config.storage.keys;

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

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
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

  function setStatus(message, tone) {
    const element = document.getElementById('driveBackupStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
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
  }

  function ensureUi() {
    if (document.getElementById('driveBackupSection')) return;
    const column = document.querySelector('.dashboard-column-wide');
    if (!column) return;
    const style = document.createElement('style');
    style.id = 'driveBackupCss';
    style.textContent = '.drive-backup-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.drive-backup-status{margin-top:12px;padding:10px 12px;border-radius:6px;font-size:12px;border:1px solid var(--border);background:#f7f9fb;color:var(--muted)}.drive-backup-status.good{background:#edf8f1;border-color:#abd6ba;color:#17633a}.drive-backup-status.warning{background:#fff8e8;border-color:#e5c778;color:#765500}.drive-backup-status.error{background:#fff0f0;border-color:#e7b0b0;color:#8d2626}.drive-backup-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.drive-backup-detail{padding:11px;border:1px solid var(--border);border-radius:6px;background:#f8fafc;font-size:12px;color:var(--muted)}.drive-backup-detail strong{display:block;margin-bottom:4px;color:var(--navy-dark)}.drive-auto-row{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--muted)}.cloud-history-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid var(--border)}.cloud-history-row:first-child{border-top:0}.cloud-history-row span{display:block;margin-top:3px;color:var(--muted);font-size:11px}@media(max-width:700px){.drive-backup-grid{grid-template-columns:1fr}.cloud-history-row{align-items:flex-start;flex-direction:column}}';
    document.head.appendChild(style);
    const section = document.createElement('section');
    section.id = 'driveBackupSection';
    section.innerHTML = '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">GOOGLE DRIVE</div><h3>Private cloud backup</h3><p class="field-help">Stores only compact study progress in the hidden Google Drive app-data area. It cannot browse your normal Drive files.</p></div></div><div class="drive-backup-actions"><button type="button" id="connectGoogleDrive" class="primary-button">Connect Google Drive</button><button type="button" id="driveBackupNow" class="secondary-button" disabled>Back up now</button><button type="button" id="driveRestoreLatest" class="secondary-button" disabled>Restore latest Drive backup</button><button type="button" id="disconnectGoogleDrive" class="secondary-button" disabled>Disconnect session</button><button type="button" id="revokeGoogleDrive" class="secondary-button" disabled>Revoke Google access</button></div><label class="drive-auto-row"><input type="checkbox" id="driveAutoBackup" checked> Automatically update the current backup at most once every 30 seconds while connected</label><div id="driveBackupStatus" class="drive-backup-status neutral">Not connected. Access tokens remain only in temporary page memory.</div><div class="drive-backup-grid"><div class="drive-backup-detail"><strong id="driveLastSync">Last successful sync: Never</strong><span>The current-state file is overwritten efficiently rather than duplicated after each answer.</span></div><div class="drive-backup-detail"><strong>Drive contents</strong><span id="driveCloudSummary">Connect to inspect your hidden Drive backup.</span></div></div></article><article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">CLOUD RECOVERY</div><h3>Historical Drive snapshots</h3><p class="field-help">A rolling history is added after completed tests, resets, deletions, restores, and manual backups—not after every answer.</p></div></div><div id="driveCloudHistory"><div class="analytics-empty">Connect Google Drive to load cloud history.</div></div></article>';
    const maintenance = document.getElementById('progressManagementSection');
    if (maintenance && maintenance.parentNode === column) maintenance.insertAdjacentElement('afterend', section); else column.appendChild(section);
    document.getElementById('connectGoogleDrive').addEventListener('click', connectDrive);
    document.getElementById('driveBackupNow').addEventListener('click', function () { manualBackup().catch(handleError); });
    document.getElementById('driveRestoreLatest').addEventListener('click', function () { restoreLatest().catch(handleError); });
    document.getElementById('disconnectGoogleDrive').addEventListener('click', function () { disconnectSession('Disconnected from Google Drive for this browser session.'); });
    document.getElementById('revokeGoogleDrive').addEventListener('click', revokeAccess);
    document.getElementById('driveAutoBackup').addEventListener('change', function (event) { saveSettings({ autoBackup: !!event.target.checked }); if (event.target.checked) scheduleAutoBackup(500); });
    updateUi();
  }

  function tokenValid() { return !!accessToken && Date.now() < tokenExpiresAt - 30000; }

  function initializeTokenClient() {
    if (tokenClient) return true;
    if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: Drive.clientId,
      scope: Drive.scope,
      callback: function (response) {
        if (!response || response.error || !response.access_token) { setStatus('Google authorization was not completed.', 'error'); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, Drive.scope)) { setStatus('The hidden app-data permission was not granted.', 'error'); return; }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        connected = true;
        setStatus('Connected securely. Checking for an existing Drive backup…', 'neutral');
        updateUi();
        inspectRemote().catch(handleError);
      },
      error_callback: function () { setStatus('The Google authorization window was closed or blocked.', 'error'); }
    });
    return true;
  }

  function connectDrive() {
    if (!initializeTokenClient()) { setStatus('Google authorization is still loading. Try Connect again in a moment.', 'warning'); return; }
    tokenClient.requestAccessToken({ prompt: '' });
  }

  function clearConnectionState() {
    accessToken = '';
    tokenExpiresAt = 0;
    connected = false;
    syncing = false;
    syncReady = false;
    conflict = false;
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
        syncReady = false; conflict = true; setStatus('Drive contains different study data. Choose “Back up now” to keep this browser, or “Restore latest Drive backup” to use Drive.', 'warning');
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

  async function manualBackup() {
    if (!connected || syncing) return;
    syncing = true; updateUi(); setStatus('Saving this browser to Google Drive…', 'neutral');
    try {
      const local = currentSnapshot('Manual Drive backup');
      if (conflict && remoteCurrent) {
        if (!confirm('This will make the current browser data the latest Drive backup. The existing Drive state will first be preserved in cloud history. Continue?')) return;
        await appendCloudHistory(remoteCurrent.snapshot, 'Drive state before browser overwrite');
      }
      await uploadCurrent(local, true, 'Manual cloud backup');
      syncReady = true; conflict = false; pendingMilestoneReason = '';
      setStatus('Backup complete. Current data and a historical snapshot are stored in Drive.', 'good');
    } finally { syncing = false; updateUi(); }
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

  async function restoreLatest() {
    if (!remoteCurrent || syncing) return;
    if (!confirm('Restore the latest Google Drive backup on this browser? The current browser state will first be preserved in cloud and local recovery history.')) return;
    syncing = true; updateUi();
    try { await appendCloudHistory(historySnapshot('Browser state before Drive restore'), 'Browser state before Drive restore'); applySnapshot(remoteCurrent.snapshot); }
    finally { syncing = false; updateUi(); }
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
    if (!connected) { container.innerHTML = '<div class="analytics-empty">Connect Google Drive to load cloud history.</div>'; return; }
    const list = remoteHistory.snapshots || [];
    if (!list.length) { container.innerHTML = '<div class="analytics-empty">No historical Drive snapshots yet.</div>'; return; }
    container.innerHTML = list.slice(0, 10).map(function (record) {
      const info = summary(record.state);
      return '<div class="cloud-history-row"><div><strong>' + escapeHtml(record.reason || 'Cloud snapshot') + '</strong><span>' + escapeHtml(formatDate(record.createdAt)) + ' · ' + info.questions + ' questions · ' + info.tests + ' saved tests</span></div><button type="button" class="secondary-button restore-cloud-history" data-id="' + escapeHtml(record.id) + '">Restore</button></div>';
    }).join('');
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.BoardsDriveBackup = Object.freeze({ connect: connectDrive, backupNow: manualBackup, restoreLatest: restoreLatest, disconnect: disconnectSession, revoke: revokeAccess });
})();
