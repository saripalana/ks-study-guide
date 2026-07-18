(function () {
  'use strict';

  const C = window.BoardsCore;
  if (!C) return;

  const CLIENT_ID = '891140884034-l0dljgrr0982f1pidfgnr915mhrqplq5.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const CURRENT_FILE = 'psychiatry-board-current-v1.json';
  const HISTORY_FILE = 'psychiatry-board-history-v1.json';
  const SETTINGS_KEY = 'ksBoardsDriveSettingsV1';
  const LOCAL_BACKUPS_KEY = 'ksBoardsBackupsV1';
  const MAX_CLOUD_HISTORY = 20;
  const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
  const AUTO_SYNC_MIN_MS = 30000;

  let tokenClient = null;
  let accessToken = '';
  let tokenExpiresAt = 0;
  let connected = false;
  let syncing = false;
  let syncReady = false;
  let conflict = false;
  let remoteCurrent = null;
  let remoteHistory = { schemaVersion: 1, updatedAt: 0, snapshots: [] };
  let lastUploadedHash = '';
  let lastSignificantHash = '';
  let lastUploadAt = 0;
  let pendingTimer = null;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function settings() {
    const value = readJson(SETTINGS_KEY, {});
    if (typeof value.autoBackup !== 'boolean') value.autoBackup = true;
    return value;
  }

  function saveSettings(patch) {
    const value = Object.assign({}, settings(), patch || {});
    writeJson(SETTINGS_KEY, value);
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

  function hashString(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function relevantKeys(includeLocalRecovery) {
    const output = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || key === SETTINGS_KEY) continue;
      if (key !== C.KEY.app && key.indexOf('ksBoards') !== 0) continue;
      if (!includeLocalRecovery && key === LOCAL_BACKUPS_KEY) continue;
      output.push(key);
    }
    return output.sort();
  }

  function captureState(reason, includeLocalRecovery) {
    const keys = {};
    relevantKeys(includeLocalRecovery).forEach(function (key) {
      keys[key] = localStorage.getItem(key);
    });
    const canonical = JSON.stringify(keys);
    return {
      schemaVersion: 1,
      app: 'ks-study-guide',
      kind: includeLocalRecovery ? 'current' : 'history',
      createdAt: Date.now(),
      reason: reason || 'Backup',
      origin: window.location.origin,
      hash: hashString(canonical),
      keys: keys
    };
  }

  function currentSnapshot(reason) {
    return captureState(reason, true);
  }

  function historySnapshot(reason) {
    return captureState(reason, false);
  }

  function significantHash() {
    const tests = readJson('ksBoardsTestsV3', []);
    const backups = readJson(LOCAL_BACKUPS_KEY, []);
    const deleted = readJson('ksBoardsDeletedTestsV3', []);
    const config = readJson(C.KEY.config, null);
    const compact = {
      tests: Array.isArray(tests) ? tests.map(function (test) {
        return [test.setId, test.completedAt, test.scorePct, test.total];
      }) : [],
      backups: Array.isArray(backups) ? backups.map(function (backup) {
        return [backup.id, backup.createdAt, backup.reason];
      }) : [],
      deleted: Array.isArray(deleted) ? deleted.slice() : [],
      completed: config && config.status === 'completed' ? [config.setId, config.completedAt] : null
    };
    return hashString(JSON.stringify(compact));
  }

  function summary(snapshot) {
    const keys = snapshot && snapshot.keys ? snapshot.keys : {};
    let app = {};
    let tests = [];
    let backups = [];
    try { app = JSON.parse(keys[C.KEY.app] || '{}'); } catch (error) {}
    try { tests = JSON.parse(keys.ksBoardsTestsV3 || '[]'); } catch (error) {}
    try { backups = JSON.parse(keys[LOCAL_BACKUPS_KEY] || '[]'); } catch (error) {}
    const answered = new Set([
      ...Object.keys(app.answered || {}),
      ...Object.keys(app.testAnswers || {})
    ]);
    return {
      questions: answered.size,
      tests: Array.isArray(tests) ? tests.length : 0,
      recoveryBackups: Array.isArray(backups) ? backups.length : 0
    };
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
    const auto = document.getElementById('driveAutoBackup');
    const last = document.getElementById('driveLastSync');
    const cloud = document.getElementById('driveCloudSummary');

    if (connect) connect.textContent = connected ? 'Google Drive connected' : 'Connect Google Drive';
    if (connect) connect.disabled = connected || syncing;
    if (backup) backup.disabled = !connected || syncing;
    if (restore) restore.disabled = !connected || syncing || !remoteCurrent;
    if (disconnect) disconnect.disabled = !connected;
    if (auto) auto.checked = settings().autoBackup;
    if (last) last.textContent = 'Last successful sync: ' + formatDate(settings().lastSyncedAt);

    if (cloud) {
      if (!remoteCurrent || !remoteCurrent.payload) {
        cloud.textContent = connected ? 'No current Drive backup found yet.' : 'Connect to inspect your hidden Drive backup.';
      } else {
        const data = summary(remoteCurrent.payload);
        cloud.textContent = data.questions + ' questions with saved responses · ' + data.tests + ' saved tests · ' + data.recoveryBackups + ' local recovery backups';
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
    style.textContent =
      '.drive-backup-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}' +
      '.drive-backup-status{margin-top:12px;padding:10px 12px;border-radius:6px;font-size:12px;border:1px solid var(--border);background:#f7f9fb;color:var(--muted)}' +
      '.drive-backup-status.good{background:#edf8f1;border-color:#abd6ba;color:#17633a}' +
      '.drive-backup-status.warning{background:#fff8e8;border-color:#e5c778;color:#765500}' +
      '.drive-backup-status.error{background:#fff0f0;border-color:#e7b0b0;color:#8d2626}' +
      '.drive-backup-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}' +
      '.drive-backup-detail{padding:11px;border:1px solid var(--border);border-radius:6px;background:#f8fafc;font-size:12px;color:var(--muted)}' +
      '.drive-backup-detail strong{display:block;margin-bottom:4px;color:var(--navy-dark)}' +
      '.drive-auto-row{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--muted)}' +
      '.cloud-history-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid var(--border)}' +
      '.cloud-history-row:first-child{border-top:0}.cloud-history-row span{display:block;margin-top:3px;color:var(--muted);font-size:11px}' +
      '@media(max-width:700px){.drive-backup-grid{grid-template-columns:1fr}.cloud-history-row{align-items:flex-start;flex-direction:column}}';
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.id = 'driveBackupSection';
    section.innerHTML =
      '<article class="dashboard-card">' +
        '<div class="card-heading-row"><div><div class="card-kicker">GOOGLE DRIVE</div><h3>Private cloud backup</h3>' +
        '<p class="field-help">Stores only compact study progress in the hidden Google Drive app-data area. It cannot browse your normal Drive files.</p></div></div>' +
        '<div class="drive-backup-actions">' +
          '<button type="button" id="connectGoogleDrive" class="primary-button">Connect Google Drive</button>' +
          '<button type="button" id="driveBackupNow" class="secondary-button" disabled>Back up now</button>' +
          '<button type="button" id="driveRestoreLatest" class="secondary-button" disabled>Restore latest Drive backup</button>' +
          '<button type="button" id="disconnectGoogleDrive" class="secondary-button" disabled>Disconnect session</button>' +
        '</div>' +
        '<label class="drive-auto-row"><input type="checkbox" id="driveAutoBackup" checked> Automatically update the current backup at most once every 30 seconds while connected</label>' +
        '<div id="driveBackupStatus" class="drive-backup-status neutral">Not connected. No Google token is stored in the repository or in browser storage.</div>' +
        '<div class="drive-backup-grid"><div class="drive-backup-detail"><strong id="driveLastSync">Last successful sync: Never</strong><span>Current state is overwritten efficiently instead of creating a new file after every answer.</span></div>' +
        '<div class="drive-backup-detail"><strong>Drive contents</strong><span id="driveCloudSummary">Connect to inspect your hidden Drive backup.</span></div></div>' +
      '</article>' +
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">CLOUD RECOVERY</div><h3>Historical Drive snapshots</h3>' +
      '<p class="field-help">A rolling history is added after completed tests, resets, deletions, restores, and manual backups—not after every answer.</p></div></div>' +
      '<div id="driveCloudHistory"><div class="analytics-empty">Connect Google Drive to load cloud history.</div></div></article>';

    const maintenance = document.getElementById('progressManagementSection');
    if (maintenance && maintenance.parentNode === column) maintenance.insertAdjacentElement('afterend', section);
    else column.appendChild(section);

    document.getElementById('connectGoogleDrive').addEventListener('click', connectDrive);
    document.getElementById('driveBackupNow').addEventListener('click', function () {
      manualBackup().catch(handleError);
    });
    document.getElementById('driveRestoreLatest').addEventListener('click', function () {
      restoreLatest().catch(handleError);
    });
    document.getElementById('disconnectGoogleDrive').addEventListener('click', disconnectSession);
    document.getElementById('driveAutoBackup').addEventListener('change', function (event) {
      saveSettings({ autoBackup: !!event.target.checked });
      if (event.target.checked) scheduleAutoBackup(500);
    });
    updateUi();
  }

  function tokenValid() {
    return !!accessToken && Date.now() < tokenExpiresAt - 30000;
  }

  function initializeTokenClient() {
    if (tokenClient) return true;
    if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: function (response) {
        if (!response || response.error || !response.access_token) {
          setStatus('Google authorization was not completed.', 'error');
          return;
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
          setStatus('The hidden app-data permission was not granted.', 'error');
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        connected = true;
        setStatus('Connected securely. Checking for an existing Drive backup…', 'neutral');
        updateUi();
        inspectRemote().catch(handleError);
      },
      error_callback: function () {
        setStatus('The Google authorization window was closed or blocked.', 'error');
      }
    });
    return true;
  }

  function connectDrive() {
    if (!initializeTokenClient()) {
      setStatus('Google authorization is still loading. Try Connect again in a moment.', 'warning');
      return;
    }
    tokenClient.requestAccessToken({ prompt: '' });
  }

  function disconnectSession() {
    accessToken = '';
    tokenExpiresAt = 0;
    connected = false;
    syncing = false;
    syncReady = false;
    conflict = false;
    remoteCurrent = null;
    remoteHistory = { schemaVersion: 1, updatedAt: 0, snapshots: [] };
    setStatus('Disconnected from Google Drive for this browser session.', 'neutral');
    updateUi();
  }

  async function driveFetch(url, options) {
    if (!tokenValid()) {
      disconnectSession();
      throw new Error('Google authorization expired. Click Connect Google Drive again.');
    }
    const request = Object.assign({}, options || {});
    const headers = new Headers(request.headers || {});
    headers.set('Authorization', 'Bearer ' + accessToken);
    request.headers = headers;
    const response = await fetch(url, request);
    if (response.status === 401) {
      disconnectSession();
      throw new Error('Google authorization expired. Click Connect Google Drive again.');
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error('Google Drive request failed (' + response.status + '). ' + body.slice(0, 180));
    }
    return response;
  }

  function driveQueryName(name) {
    return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function findFile(name) {
    const query = "name='" + driveQueryName(name) + "' and trashed=false";
    const url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=10&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size,appProperties)&q=' + encodeURIComponent(query);
    const response = await driveFetch(url);
    const data = await response.json();
    return data.files && data.files.length ? data.files[0] : null;
  }

  async function readDriveJson(file) {
    if (!file) return null;
    const response = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media');
    return response.json();
  }

  async function createDriveJson(name, payload, type) {
    const boundary = 'ks_board_' + Math.random().toString(36).slice(2);
    const metadata = {
      name: name,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
      appProperties: { app: 'ks-study-guide', backupType: type, schemaVersion: '1' }
    };
    const body = '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n--' + boundary + '\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(payload) + '\r\n--' + boundary + '--';
    const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    });
    return response.json();
  }

  async function updateDriveJson(file, payload) {
    const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=id,name,modifiedTime,size', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  async function upsertDriveJson(file, name, payload, type) {
    return file ? updateDriveJson(file, payload) : createDriveJson(name, payload, type);
  }

  async function inspectRemote() {
    syncing = true;
    updateUi();
    try {
      const currentFile = await findFile(CURRENT_FILE);
      const historyFile = await findFile(HISTORY_FILE);
      const currentPayload = currentFile ? await readDriveJson(currentFile) : null;
      const historyPayload = historyFile ? await readDriveJson(historyFile) : null;
      remoteCurrent = currentFile ? { file: currentFile, payload: currentPayload } : null;
      remoteHistory = historyPayload && Array.isArray(historyPayload.snapshots)
        ? Object.assign({ schemaVersion: 1, updatedAt: 0 }, historyPayload)
        : { schemaVersion: 1, updatedAt: 0, snapshots: [] };
      remoteHistory.file = historyFile;

      const local = currentSnapshot('Connection check');
      if (!remoteCurrent) {
        syncReady = true;
        conflict = false;
        await uploadCurrent(local, true, 'Initial cloud backup');
        setStatus('Connected and backed up. Automatic backup is ready.', 'good');
      } else if (remoteCurrent.payload && remoteCurrent.payload.hash === local.hash) {
        syncReady = true;
        conflict = false;
        lastUploadedHash = local.hash;
        lastSignificantHash = significantHash();
        setStatus('Connected. This browser matches the latest Drive backup.', 'good');
      } else {
        syncReady = false;
        conflict = true;
        setStatus('Drive contains different study data. Choose “Back up now” to keep this browser, or “Restore latest Drive backup” to use Drive.', 'warning');
      }
    } finally {
      syncing = false;
      updateUi();
    }
  }

  function trimHistory(payload) {
    payload.snapshots = (payload.snapshots || []).slice(0, MAX_CLOUD_HISTORY);
    while (payload.snapshots.length > 1 && JSON.stringify(payload).length > MAX_HISTORY_BYTES) {
      payload.snapshots.pop();
    }
    return payload;
  }

  async function appendCloudHistory(snapshot, reason) {
    const record = {
      id: 'cloud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      reason: reason || snapshot.reason || 'Cloud snapshot',
      hash: snapshot.hash,
      state: snapshot
    };
    const list = Array.isArray(remoteHistory.snapshots) ? remoteHistory.snapshots.slice() : [];
    if (list.length && list[0].hash === record.hash) return;
    list.unshift(record);
    const payload = trimHistory({ schemaVersion: 1, updatedAt: Date.now(), snapshots: list });
    const file = remoteHistory.file || null;
    const metadata = await upsertDriveJson(file, HISTORY_FILE, payload, 'history');
    remoteHistory = payload;
    remoteHistory.file = metadata;
  }

  async function uploadCurrent(snapshot, addHistory, historyReason) {
    const file = remoteCurrent && remoteCurrent.file ? remoteCurrent.file : null;
    const metadata = await upsertDriveJson(file, CURRENT_FILE, snapshot, 'current');
    remoteCurrent = { file: metadata, payload: snapshot };
    lastUploadedHash = snapshot.hash;
    lastUploadAt = Date.now();
    saveSettings({ lastSyncedAt: lastUploadAt, lastSyncedHash: snapshot.hash });
    if (addHistory) await appendCloudHistory(historySnapshot(historyReason || snapshot.reason), historyReason || snapshot.reason);
    lastSignificantHash = significantHash();
  }

  async function manualBackup() {
    if (!connected || syncing) return;
    syncing = true;
    updateUi();
    setStatus('Saving this browser to Google Drive…', 'neutral');
    try {
      const local = currentSnapshot('Manual Drive backup');
      if (conflict && remoteCurrent && remoteCurrent.payload) {
        if (!confirm('This will make the current browser data the latest Drive backup. The existing Drive state will first be preserved in cloud history. Continue?')) return;
        await appendCloudHistory({
          schemaVersion: remoteCurrent.payload.schemaVersion || 1,
          app: remoteCurrent.payload.app || 'ks-study-guide',
          kind: 'history',
          createdAt: Date.now(),
          reason: 'Drive state before browser overwrite',
          origin: remoteCurrent.payload.origin || window.location.origin,
          hash: remoteCurrent.payload.hash || hashString(JSON.stringify(remoteCurrent.payload.keys || {})),
          keys: Object.fromEntries(Object.entries(remoteCurrent.payload.keys || {}).filter(function (entry) {
            return entry[0] !== LOCAL_BACKUPS_KEY;
          }))
        }, 'Drive state before browser overwrite');
      }
      await uploadCurrent(local, true, 'Manual cloud backup');
      syncReady = true;
      conflict = false;
      setStatus('Backup complete. Current data and a historical snapshot are stored in Drive.', 'good');
    } finally {
      syncing = false;
      updateUi();
    }
  }

  function mergeRecoveryBackups(existing) {
    const current = readJson(LOCAL_BACKUPS_KEY, []);
    const merged = [];
    const seen = new Set();
    [].concat(existing || [], current || []).forEach(function (backup) {
      if (!backup || !backup.id || seen.has(backup.id)) return;
      seen.add(backup.id);
      merged.push(backup);
    });
    merged.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    writeJson(LOCAL_BACKUPS_KEY, merged.slice(0, 12));
  }

  function applySnapshot(snapshot, preserveExistingRecovery) {
    if (!snapshot || !snapshot.keys) throw new Error('The selected Drive backup is invalid.');
    let rescueBackups = readJson(LOCAL_BACKUPS_KEY, []);
    if (window.BoardsMaintenance && window.BoardsMaintenance.backupNow) {
      window.BoardsMaintenance.backupNow('Before restoring from Google Drive', { type: 'pre-drive-restore' });
      rescueBackups = readJson(LOCAL_BACKUPS_KEY, []);
    }

    relevantKeys(true).forEach(function (key) {
      if (key !== SETTINGS_KEY) localStorage.removeItem(key);
    });
    Object.entries(snapshot.keys).forEach(function (entry) {
      const key = entry[0];
      const value = entry[1];
      if (key === SETTINGS_KEY) return;
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
    if (preserveExistingRecovery || snapshot.kind === 'history') mergeRecoveryBackups(rescueBackups);
    saveSettings({ lastRestoredAt: Date.now() });
    window.location.reload();
  }

  async function restoreLatest() {
    if (!remoteCurrent || !remoteCurrent.payload || syncing) return;
    if (!confirm('Restore the latest Google Drive backup on this browser? The current browser state will first be added to cloud history and to local recovery backups.')) return;
    syncing = true;
    updateUi();
    try {
      await appendCloudHistory(historySnapshot('Browser state before Drive restore'), 'Browser state before Drive restore');
      applySnapshot(remoteCurrent.payload, true);
    } finally {
      syncing = false;
      updateUi();
    }
  }

  async function restoreHistory(id) {
    const record = (remoteHistory.snapshots || []).find(function (item) { return item.id === id; });
    if (!record || !record.state) return;
    if (!confirm('Restore this historical Drive snapshot? The current browser state will first be preserved.')) return;
    syncing = true;
    updateUi();
    try {
      await appendCloudHistory(historySnapshot('Browser state before historical restore'), 'Browser state before historical restore');
      applySnapshot(record.state, true);
    } finally {
      syncing = false;
      updateUi();
    }
  }

  function renderCloudHistory() {
    const container = document.getElementById('driveCloudHistory');
    if (!container) return;
    if (!connected) {
      container.innerHTML = '<div class="analytics-empty">Connect Google Drive to load cloud history.</div>';
      return;
    }
    const list = Array.isArray(remoteHistory.snapshots) ? remoteHistory.snapshots : [];
    if (!list.length) {
      container.innerHTML = '<div class="analytics-empty">No historical Drive snapshots yet.</div>';
      return;
    }
    container.innerHTML = list.slice(0, 10).map(function (record) {
      const info = summary(record.state || {});
      return '<div class="cloud-history-row"><div><strong>' + escapeHtml(record.reason || 'Cloud snapshot') + '</strong>' +
        '<span>' + escapeHtml(formatDate(record.createdAt)) + ' · ' + info.questions + ' questions · ' + info.tests + ' saved tests</span></div>' +
        '<button type="button" class="secondary-button restore-cloud-history" data-id="' + escapeHtml(record.id) + '">Restore</button></div>';
    }).join('');
    container.querySelectorAll('.restore-cloud-history').forEach(function (button) {
      button.addEventListener('click', function () {
        restoreHistory(button.getAttribute('data-id')).catch(handleError);
      });
    });
  }

  async function autoBackup() {
    if (!connected || !syncReady || syncing || !settings().autoBackup || !tokenValid()) return;
    const snapshot = currentSnapshot('Automatic Drive backup');
    if (snapshot.hash === lastUploadedHash) return;
    if (Date.now() - lastUploadAt < AUTO_SYNC_MIN_MS) {
      scheduleAutoBackup(AUTO_SYNC_MIN_MS - (Date.now() - lastUploadAt) + 500);
      return;
    }
    syncing = true;
    updateUi();
    try {
      const sig = significantHash();
      const addHistory = !!lastSignificantHash && sig !== lastSignificantHash;
      await uploadCurrent(snapshot, addHistory, addHistory ? 'Completed test or recovery milestone' : 'Automatic Drive backup');
      setStatus('Automatically backed up at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.', 'good');
    } finally {
      syncing = false;
      updateUi();
    }
  }

  function scheduleAutoBackup(delay) {
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(function () {
      autoBackup().catch(handleError);
    }, Math.max(500, Number(delay) || 5000));
  }

  function handleError(error) {
    syncing = false;
    updateUi();
    const message = error && error.message ? error.message : 'Google Drive backup failed.';
    setStatus(message, 'error');
    console.error(error);
  }

  function init() {
    ensureUi();
    initializeTokenClient();
    setInterval(function () {
      ensureUi();
      initializeTokenClient();
      if (connected && settings().autoBackup) scheduleAutoBackup(1000);
    }, 10000);
    window.addEventListener('message', function () {
      if (connected && settings().autoBackup) scheduleAutoBackup(5000);
    });
    document.addEventListener('click', function (event) {
      if (!connected || !settings().autoBackup) return;
      if (event.target.closest('.choice,.delete-history,#resetSelectedQuestions,#resetEntireBank,#createManualBackup,.restore-backup')) {
        scheduleAutoBackup(5000);
      }
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && connected && settings().autoBackup) scheduleAutoBackup(0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BoardsDriveBackup = {
    connect: connectDrive,
    backupNow: manualBackup,
    restoreLatest: restoreLatest,
    disconnect: disconnectSession
  };
})();