(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Model = window.BoardsQuestionBankModel;
  if (!Config || !Store || !Model || !Config.hardReset || !Config.questionVault) return;

  const Reset = Config.hardReset;
  const Vault = Config.questionVault;
  let tokenClient = null;
  let accessToken = '';
  let running = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function timestampName() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function setStatus(message, tone) {
    const element = document.getElementById('hardResetStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }

  function addStyles() {
    if (document.getElementById('hardResetCss')) return;
    const style = document.createElement('style');
    style.id = 'hardResetCss';
    style.textContent =
      '.hard-reset-card{border-color:#e1b4b4;background:#fffafa}' +
      '.hard-reset-warning{margin-top:12px;padding:11px 12px;border-left:4px solid #b53232;background:#fff0f0;border-radius:5px;color:#742020;font-size:12px;line-height:1.5}' +
      '.hard-reset-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,24,41,.58)}' +
      '.hard-reset-modal[hidden]{display:none}' +
      '.hard-reset-dialog{width:min(610px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:24px}' +
      '.hard-reset-dialog h2{margin:0 0 8px;color:#7f2020}' +
      '.hard-reset-dialog p{color:var(--muted);line-height:1.55}' +
      '.hard-reset-field{display:block;margin-top:15px;font-size:12px;font-weight:750;color:var(--navy-dark)}' +
      '.hard-reset-field input[type=password],.hard-reset-field input[type=text]{display:block;width:100%;margin-top:6px;padding:10px 11px;border:1px solid var(--border);border-radius:7px;font:inherit}' +
      '.hard-reset-check{display:flex;align-items:flex-start;gap:9px;margin-top:16px;font-size:12px;line-height:1.45;color:#5d3c3c}' +
      '.hard-reset-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px;flex-wrap:wrap}' +
      '.hard-reset-code-note{font-size:11px;color:var(--muted);margin-top:7px}' +
      '@media(max-width:620px){.hard-reset-actions>*{flex:1 1 150px}}';
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (document.getElementById('hardResetCard')) return;
    const section = document.getElementById('progressManagementSection');
    if (!section) return;
    addStyles();

    const card = document.createElement('article');
    card.id = 'hardResetCard';
    card.className = 'dashboard-card hard-reset-card';
    card.innerHTML =
      '<div class="card-heading-row"><div><div class="card-kicker">FRESH START</div><h3>Absolute reset of active study data</h3>' +
      '<p class="field-help">Clears answers, flags, tests, timing, analytics, active sets, local recovery records, and the active cloud performance state. The original question bank and archived recovery history remain protected.</p></div></div>' +
      '<button type="button" id="openHardReset" class="danger-button">Open absolute reset</button>' +
      '<div class="hard-reset-warning"><strong>High-impact action:</strong> a recovery file and cloud archives are created first. The configured code is only an accidental-click safeguard because this public website’s JavaScript can be inspected.</div>' +
      '<div id="hardResetStatus" class="drive-backup-status neutral">No absolute reset is pending.</div>';
    section.appendChild(card);

    const modal = document.createElement('div');
    modal.id = 'hardResetModal';
    modal.className = 'hard-reset-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="hard-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="hardResetTitle">' +
      '<h2 id="hardResetTitle">Start completely fresh?</h2>' +
      '<p>This resets active personal study data in this browser, the hidden Drive backup, and the visible Question Vault performance files. Historical cloud archives and the original GitHub question source are retained for recovery.</p>' +
      '<label class="hard-reset-field">Reset code<input id="hardResetCode" type="password" autocomplete="off" spellcheck="false"></label>' +
      '<div class="hard-reset-code-note">This is a confirmation code, not a secure account password.</div>' +
      '<label class="hard-reset-field">Type <strong>' + escapeHtml(Reset.confirmationPhrase) + '</strong><input id="hardResetPhrase" type="text" autocomplete="off" spellcheck="false"></label>' +
      '<label class="hard-reset-check"><input id="hardResetUnderstand" type="checkbox"><span>I understand that all active progress and test records will restart at zero, and that I may need to reconnect Google Drive after the reset.</span></label>' +
      '<div id="hardResetModalStatus" class="drive-backup-status neutral">The reset has not started.</div>' +
      '<div class="hard-reset-actions"><button type="button" id="cancelHardReset" class="secondary-button">Cancel</button><button type="button" id="confirmHardReset" class="danger-button">Archive and reset everything</button></div>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById('openHardReset').addEventListener('click', openModal);
    document.getElementById('cancelHardReset').addEventListener('click', closeModal);
    document.getElementById('confirmHardReset').addEventListener('click', beginReset);
    modal.addEventListener('click', function (event) { if (event.target === modal && !running) closeModal(); });
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
