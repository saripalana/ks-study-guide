(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Model = window.BoardsQuestionBankModel;
  const Panels = window.BoardsPanelTemplates;
  const Registry = window.BoardsDashboardRegistry;
  if (!Config || !Store || !Model || !Panels || !Registry || !Config.hardReset || !Config.questionVault) return;

  const Reset = Config.hardReset;
  const Vault = Config.questionVault;
  let tokenClient = null;
  let accessToken = '';
  let running = false;


  function timestampName() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function setStatus(message, tone) {
    const element = document.getElementById('hardResetStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }


  function mountUi() {
    const existing = document.getElementById('hardResetCard');
    if (existing) return existing;
    const card = Panels.createHardResetCard();
    const modal = Panels.createHardResetModal(Reset.confirmationPhrase);
    document.body.appendChild(modal);

    card.querySelector('#openHardReset').addEventListener('click', openModal);
    modal.querySelector('#cancelHardReset').addEventListener('click', closeModal);
    modal.querySelector('#confirmHardReset').addEventListener('click', beginReset);
    modal.addEventListener('click', function (event) { if (event.target === modal && !running) closeModal(); });
    return card;
  }

  function ensureUi() {
    if (document.getElementById('hardResetCard')) return;
    Registry.register({ id: 'absolute-reset', region: 'data-tools', order: 150, mount: mountUi });
  }

  function modalStatus(message, tone) {
    const element = document.getElementById('hardResetModalStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }

  function openModal() {
    const modal = document.getElementById('hardResetModal');
    if (!modal) return;
    document.getElementById('hardResetCode').value = '';
    document.getElementById('hardResetPhrase').value = '';
    document.getElementById('hardResetUnderstand').checked = false;
    modalStatus('The reset has not started.', 'neutral');
    modal.hidden = false;
    document.getElementById('hardResetCode').focus();
  }

  function closeModal() {
    if (running) return;
    const modal = document.getElementById('hardResetModal');
    if (modal) modal.hidden = true;
  }

  async function sha256(value) {
    if (!window.crypto || !window.crypto.subtle) throw new Error('This browser cannot verify the reset code securely enough.');
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
    return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  function downloadRecovery(snapshot) {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'psychiatry-board-before-absolute-reset-' + timestampName() + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function requestResetToken() {
    return new Promise(function (resolve, reject) {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        reject(new Error('Google authorization is still loading. Wait a moment and try again.'));
        return;
      }
      const combinedScope = Config.drive.scope + ' ' + Vault.scope;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: Config.drive.clientId,
        scope: combinedScope,
        callback: function (response) {
          if (!response || response.error || !response.access_token) {
            reject(new Error('Google authorization was not completed. No data were reset.'));
            return;
          }
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, Config.drive.scope, Vault.scope)) {
            reject(new Error('Both limited Drive permissions are required for an absolute reset. No data were reset.'));
            return;
          }
          accessToken = response.access_token;
          resolve(accessToken);
        },
        error_callback: function () { reject(new Error('The Google authorization window was closed or blocked. No data were reset.')); }
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  async function driveFetch(url, options) {
    const request = Object.assign({}, options || {});
    const headers = new Headers(request.headers || {});
    headers.set('Authorization', 'Bearer ' + accessToken);
    request.headers = headers;
    const response = await fetch(url, request);
    if (!response.ok) {
      const body = await response.text();
      throw new Error('Google Drive reset operation failed (' + response.status + '). ' + body.slice(0, 180));
    }
    return response;
  }

  function queryEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function findNamed(name, parentId, spaces) {
    let query = "name='" + queryEscape(name) + "' and trashed=false";
    if (parentId) query += " and '" + queryEscape(parentId) + "' in parents";
    const url = 'https://www.googleapis.com/drive/v3/files?spaces=' + encodeURIComponent(spaces || 'drive') + '&pageSize=20&fields=files(id,name,parents,webViewLink,appProperties)&q=' + encodeURIComponent(query);
    const payload = await (await driveFetch(url)).json();
    return payload.files && payload.files.length ? payload.files[0] : null;
  }

  async function readJson(file) {
    if (!file) return null;
    return (await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media')).json();
  }

  async function createJson(name, parent, payload, type, appData) {
    const boundary = '-------ksreset' + Math.random().toString(36).slice(2);
    const metadata = {
      name: name,
      mimeType: 'application/json',
      parents: [appData ? 'appDataFolder' : parent],
      appProperties: { ksProject: Config.projectId, ksType: type || 'absolute-reset' }
    };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(payload) + '\r\n--' + boundary + '--';
    return (await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents,webViewLink', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    })).json();
  }

  async function updateJson(file, payload) {
    return (await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=id,name,parents,webViewLink', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })).json();
  }

  async function upsertJson(name, parent, payload, type, appData) {
    const existing = await findNamed(name, appData ? null : parent, appData ? 'appDataFolder' : 'drive');
    return existing ? updateJson(existing, payload) : createJson(name, parent, payload, type, appData);
  }

  async function appendJson(name, parent, payload, type) {
    return createJson(name, parent, payload, type, false);
  }

  function trimCloudHistory(payload) {
    payload.snapshots = (payload.snapshots || []).slice(0, Config.drive.maxHistory);
    while (payload.snapshots.length > 1 && JSON.stringify(payload).length > Config.drive.maxHistoryBytes) payload.snapshots.pop();
    return payload;
  }

  async function archiveHiddenBackup(rescue) {
    const historyFile = await findNamed(Config.drive.historyFile, null, 'appDataFolder');
    const existing = historyFile ? await readJson(historyFile) : null;
    const snapshots = existing && Array.isArray(existing.snapshots) ? existing.snapshots.slice() : [];
    if (!snapshots.length || snapshots[0].hash !== rescue.hash) {
      snapshots.unshift({
        id: 'absolute-reset-' + Date.now(),
        createdAt: Date.now(),
        reason: 'Before absolute hard reset',
        hash: rescue.hash,
        state: rescue
      });
    }
    const history = trimCloudHistory({
      schemaVersion: Config.schemaVersion,
      projectId: Config.projectId,
      updatedAt: Date.now(),
      snapshots: snapshots
    });
    await upsertJson(Config.drive.historyFile, null, history, 'history', true);
  }

  async function locateVisibleVault() {
    const root = await findNamed(Vault.rootFolder, null, 'drive');
    if (!root) throw new Error('The visible Question Vault was not found. Connect Question Vault before using absolute reset.');
    const production = await findNamed(Vault.folders.production, root.id, 'drive');
    const history = await findNamed(Vault.folders.history, root.id, 'drive');
    const changes = await findNamed(Vault.folders.changes, root.id, 'drive');
    if (!production || !history || !changes) throw new Error('The visible Question Vault folder structure is incomplete. No data were reset.');
    return { root: root, production: production, history: history, changes: changes };
  }

  async function archiveVisibleStudyData(folders, resetId) {
    const archiveNames = [
      { name: Vault.files.performance, prefix: 'question-performance-before-reset-' },
      { name: Vault.files.correlated, prefix: 'correlated-export-before-reset-' },
      { name: Vault.files.testIndex, prefix: 'completed-tests-index-before-reset-' }
    ];
    for (const item of archiveNames) {
      const file = await findNamed(item.name, folders.production.id, 'drive');
      const payload = file ? await readJson(file) : null;
      if (payload) await appendJson(item.prefix + timestampName() + '.json', folders.history.id, payload, 'pre-reset-history');
    }
    await appendJson('absolute-reset-' + timestampName() + '.json', folders.changes.id, {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      resetId: resetId,
      createdAt: Date.now(),
      action: 'start-new-study-generation',
      originalQuestionBankPreserved: true,
      historicalFilesPreserved: true,
      activeProgressCleared: true
    }, 'absolute-reset-change-set');
  }

  function clearLocalStudyData() {
    const exact = new Set(Config.storage.backupKeys.concat([Config.storage.keys.driveSettings, Config.storage.keys.app]));
    const remove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && (exact.has(key) || key.indexOf('ksBoards') === 0)) remove.push(key);
    }
    remove.forEach(function (key) { localStorage.removeItem(key); });
  }

  async function publishEmptyCloudState(folders, resetId) {
    const master = Model.buildMasterPackage();
    const performance = Model.buildPerformancePackage(master, null);
    performance.resetId = resetId;
    performance.studyGenerationStartedAt = Date.now();
    const correlated = Model.buildCorrelatedPackage(master, performance);
    correlated.resetId = resetId;
    correlated.studyGenerationStartedAt = performance.studyGenerationStartedAt;
    const testIndex = {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resetId: resetId,
      testCount: 0,
      tests: []
    };

    await upsertJson(Vault.files.performance, folders.production.id, performance, 'performance', false);
    await upsertJson(Vault.files.correlated, folders.production.id, correlated, 'ai-ready-correlated', false);
    await upsertJson(Vault.files.testIndex, folders.production.id, testIndex, 'completed-test-index', false);

    const manifestFile = await findNamed(Vault.files.manifest, folders.production.id, 'drive');
    const manifest = Object.assign({}, manifestFile ? await readJson(manifestFile) : {}, {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      updatedAt: Date.now(),
      activeStudyGenerationId: resetId,
      lastAbsoluteResetAt: Date.now(),
      performanceHash: performance.performanceHash,
      correlatedHash: correlated.exportHash,
      historicalTestCount: 0,
      archivedTestCount: 0
    });
    await upsertJson(Vault.files.manifest, folders.production.id, manifest, 'manifest', false);

    const emptyCurrent = Store.captureSnapshot('Absolute hard reset completed', true, 'current');
    await upsertJson(Config.drive.currentFile, null, emptyCurrent, 'current', true);
  }

  async function beginReset() {
    if (running) return;
    const code = document.getElementById('hardResetCode').value;
    const phrase = document.getElementById('hardResetPhrase').value;
    const understood = document.getElementById('hardResetUnderstand').checked;
    const button = document.getElementById('confirmHardReset');

    if (!understood) { modalStatus('Check the acknowledgment box before continuing.', 'warning'); return; }
    if (phrase !== Reset.confirmationPhrase) { modalStatus('The confirmation phrase does not match exactly.', 'error'); return; }
    if (await sha256(code) !== Reset.passcodeSha256) { modalStatus('The reset code is incorrect.', 'error'); return; }

    running = true;
    button.disabled = true;
    document.getElementById('cancelHardReset').disabled = true;
    const resetId = 'reset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const rescue = Store.captureSnapshot('Before absolute hard reset', true, 'absolute-reset-recovery');
    downloadRecovery(rescue);

    try {
      modalStatus('Authorizing the two limited Drive areas…', 'neutral');
      await requestResetToken();
      modalStatus('Archiving the hidden backup and visible performance files…', 'neutral');
      await archiveHiddenBackup(rescue);
      const folders = await locateVisibleVault();
      await archiveVisibleStudyData(folders, resetId);

      if (window.BoardsDriveBackup && window.BoardsDriveBackup.disconnect) window.BoardsDriveBackup.disconnect('Disconnected for coordinated absolute reset.');
      if (window.BoardsQuestionVault && window.BoardsQuestionVault.disconnect) window.BoardsQuestionVault.disconnect();

      modalStatus('Clearing active browser study data…', 'neutral');
      clearLocalStudyData();
      modalStatus('Publishing the new empty active state to Google Drive…', 'neutral');
      await publishEmptyCloudState(folders, resetId);

      setStatus('Absolute reset completed. Active study data restarted at zero; protected archives remain available.', 'good');
      modalStatus('Reset complete. Reloading the clean study dashboard…', 'good');
      setTimeout(function () { window.location.reload(); }, 1200);
    } catch (error) {
      try { Store.applySnapshot(rescue); } catch (_restoreError) { /* downloaded recovery remains available */ }
      modalStatus((error && error.message ? error.message : 'Absolute reset failed.') + ' The browser state was restored when possible, and the downloaded recovery file remains available.', 'error');
      setStatus('Absolute reset did not complete.', 'error');
      running = false;
      button.disabled = false;
      document.getElementById('cancelHardReset').disabled = false;
    }
  }

  function init() {
    ensureUi();
    const section = document.getElementById('progressManagementSection');
    if (!section) {
      setTimeout(init, 250);
      return;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
