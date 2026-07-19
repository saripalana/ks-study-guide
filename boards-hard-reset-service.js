(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Model = window.BoardsQuestionBankModel;
  const VaultScope = window.BoardsVaultBankScope;
  if (!Config || !Store || !Model || !VaultScope) throw new Error('Active-bank reset service dependencies are unavailable.');

  const Vault = Config.questionVault;
  let accessToken = '';

  function timestampName() { return new Date().toISOString().replace(/[:.]/g, '-'); }
  function queryEscape(value) { return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function bankIdentity(payload) { return VaultScope.identity(payload); }

  function activeLocalKeys() {
    return Array.from(new Set(Config.storage.backupKeys.concat([
      Config.storage.keys.driveSettings,
      window.BoardsBankConsistency && window.BoardsBankConsistency.quarantineKey
    ].filter(Boolean))));
  }

  function clearActiveLocalData() {
    activeLocalKeys().forEach(function (key) { localStorage.removeItem(key); });
  }

  function authorize() {
    return new Promise(function (resolve, reject) {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        reject(new Error('Google authorization is still loading. Wait a moment and try again.'));
        return;
      }
      const combinedScope = Config.drive.scope + ' ' + Vault.scope;
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: Config.drive.clientId,
        scope: combinedScope,
        include_granted_scopes: true,
        callback: function (response) {
          if (!response || response.error || !response.access_token) {
            reject(new Error('Google authorization was not completed. No data were reset.'));
            return;
          }
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, Config.drive.scope, Vault.scope)) {
            reject(new Error('Both limited Drive permissions are required. No data were reset.'));
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

  async function findNamed(name, parentId, spaces, mimeType) {
    let query = "name='" + queryEscape(name) + "' and trashed=false";
    if (parentId) query += " and '" + queryEscape(parentId) + "' in parents";
    if (mimeType) query += " and mimeType='" + queryEscape(mimeType) + "'";
    const url = 'https://www.googleapis.com/drive/v3/files?spaces=' + encodeURIComponent(spaces || 'drive') + '&pageSize=20&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,parents,webViewLink,appProperties)&q=' + encodeURIComponent(query);
    const payload = await (await driveFetch(url)).json();
    return payload.files && payload.files.length ? payload.files[0] : null;
  }

  async function readJson(file) {
    if (!file) return null;
    return (await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media')).json();
  }

  function assertBank(payload, label) {
    VaultScope.validatePayload(payload, label);
    return payload;
  }

  async function createJson(name, parent, payload, role, appData) {
    const boundary = 'active_bank_reset_' + Math.random().toString(36).slice(2);
    const metadata = {
      name: name,
      mimeType: 'application/json',
      parents: [appData ? 'appDataFolder' : parent],
      appProperties: {
        projectId: Config.projectId,
        bankId: Config.bank.id,
        bankTitle: String(Config.bank.title).slice(0, 120),
        vaultRole: role || 'active-bank-reset',
        schemaVersion: String(Config.schemaVersion)
      }
    };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(bankIdentity(payload), null, 2) + '\r\n--' + boundary + '--';
    return (await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents,webViewLink,appProperties', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body
    })).json();
  }

  async function updateJson(file, payload) {
    const properties = file && file.appProperties || {};
    if (properties.bankId && properties.bankId !== Config.bank.id) throw new Error('Refusing to update a cloud file belonging to another question bank.');
    return (await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=id,name,parents,webViewLink,appProperties', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bankIdentity(payload), null, 2)
    })).json();
  }

  async function upsertJson(name, parent, payload, role, appData) {
    const existing = await findNamed(name, appData ? null : parent, appData ? 'appDataFolder' : 'drive', 'application/json');
    if (existing) {
      const previous = await readJson(existing);
      assertBank(previous, name);
      return updateJson(existing, payload);
    }
    return createJson(name, parent, payload, role, appData);
  }

  async function archiveHiddenBackup(rescue) {
    const historyFile = await findNamed(Config.drive.historyFile, null, 'appDataFolder', 'application/json');
    const existing = historyFile ? await readJson(historyFile) : null;
    if (existing) assertBank(existing, 'Hidden Drive history');
    const snapshots = existing && Array.isArray(existing.snapshots) ? existing.snapshots.slice() : [];
    if (!snapshots.length || snapshots[0].hash !== rescue.hash) {
      snapshots.unshift(bankIdentity({
        id: 'absolute-reset-' + Config.bank.id + '-' + Date.now(),
        createdAt: Date.now(),
        reason: 'Before active-bank absolute reset',
        hash: rescue.hash,
        state: rescue
      }));
    }
    const history = bankIdentity({
      schemaVersion: Config.schemaVersion,
      projectId: Config.projectId,
      updatedAt: Date.now(),
      snapshots: snapshots.slice(0, Config.drive.maxHistory)
    });
    while (history.snapshots.length > 1 && JSON.stringify(history).length > Config.drive.maxHistoryBytes) history.snapshots.pop();
    await upsertJson(Config.drive.historyFile, null, history, 'history', true);
  }

  async function locateVisibleVault() {
    const folderMime = 'application/vnd.google-apps.folder';
    const globalRoot = await findNamed(Vault.rootFolder, null, 'drive', folderMime);
    if (!globalRoot) throw new Error('The visible Question Vault was not found. Connect the active bank’s Question Vault before using absolute reset.');
    let bankRoot = globalRoot;
    if (!Vault.legacyLayout) {
      const banksRoot = await findNamed(Vault.banksFolder, globalRoot.id, 'drive', folderMime);
      bankRoot = banksRoot ? await findNamed(Vault.bankFolder, banksRoot.id, 'drive', folderMime) : null;
      if (!bankRoot) throw new Error('The visible Question Vault has not been initialized for ' + Config.bank.title + '.');
    }
    const production = await findNamed(Vault.folders.production, bankRoot.id, 'drive', folderMime);
    const history = await findNamed(Vault.folders.history, bankRoot.id, 'drive', folderMime);
    const changes = await findNamed(Vault.folders.changes, bankRoot.id, 'drive', folderMime);
    if (!production || !history || !changes) throw new Error('The active bank’s visible Question Vault folder structure is incomplete. No data were reset.');
    return { globalRoot: globalRoot, bankRoot: bankRoot, production: production, history: history, changes: changes };
  }

  async function archiveVisibleStudyData(folders, resetId) {
    const archiveNames = [
      { name: Vault.files.performance, prefix: 'question-performance-before-reset-' },
      { name: Vault.files.correlated, prefix: 'correlated-export-before-reset-' },
      { name: Vault.files.testIndex, prefix: 'completed-tests-index-before-reset-' }
    ];
    for (const item of archiveNames) {
      const file = await findNamed(item.name, folders.production.id, 'drive', 'application/json');
      const payload = file ? await readJson(file) : null;
      if (payload) {
        assertBank(payload, item.name);
        await createJson(item.prefix + Config.bank.id + '-' + timestampName() + '.json', folders.history.id, payload, 'pre-reset-history', false);
      }
    }
    await createJson('absolute-reset-' + Config.bank.id + '-' + timestampName() + '.json', folders.changes.id, {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      resetId: resetId,
      createdAt: Date.now(),
      action: 'start-new-study-generation',
      originalQuestionBankPreserved: true,
      historicalFilesPreserved: true,
      activeProgressCleared: true,
      resetScope: 'active-bank'
    }, 'absolute-reset-change-set', false);
  }

  async function publishEmptyCloudState(folders, resetId) {
    const master = Model.buildMasterPackage();
    const performance = Model.buildPerformancePackage(master, null);
    performance.resetId = resetId;
    performance.studyGenerationStartedAt = Date.now();
    const correlated = Model.buildCorrelatedPackage(master, performance);
    correlated.resetId = resetId;
    correlated.studyGenerationStartedAt = performance.studyGenerationStartedAt;
    const testIndex = bankIdentity({
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resetId: resetId,
      testCount: 0,
      tests: []
    });
    await upsertJson(Vault.files.performance, folders.production.id, performance, 'performance', false);
    await upsertJson(Vault.files.correlated, folders.production.id, correlated, 'ai-ready-correlated', false);
    await upsertJson(Vault.files.testIndex, folders.production.id, testIndex, 'completed-test-index', false);

    const manifestFile = await findNamed(Vault.files.manifest, folders.production.id, 'drive', 'application/json');
    const existingManifest = manifestFile ? await readJson(manifestFile) : {};
    if (existingManifest) assertBank(existingManifest, 'Question Vault manifest');
    const manifest = bankIdentity(Object.assign({}, existingManifest || {}, {
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      updatedAt: Date.now(),
      activeStudyGenerationId: resetId,
      lastAbsoluteResetAt: Date.now(),
      performanceHash: performance.performanceHash,
      correlatedHash: correlated.exportHash,
      historicalTestCount: 0,
      archivedTestCount: 0
    }));
    await upsertJson(Vault.files.manifest, folders.production.id, manifest, 'manifest', false);

    const emptyCurrent = Store.captureSnapshot('Active-bank absolute reset completed', true, 'current');
    await upsertJson(Config.drive.currentFile, null, emptyCurrent, 'current', true);
  }

  async function execute(rescue, onProgress) {
    const progress = typeof onProgress === 'function' ? onProgress : function () {};
    progress('Authorizing the two limited Drive areas…');
    await authorize();
    progress('Archiving ' + Config.bank.title + ' hidden and visible cloud state…');
    await archiveHiddenBackup(rescue);
    const folders = await locateVisibleVault();
    await archiveVisibleStudyData(folders, 'reset-' + Config.bank.id + '-' + Date.now());
    const resetId = 'reset-' + Config.bank.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    progress('Clearing only ' + Config.bank.title + ' browser study data…');
    clearActiveLocalData();
    progress('Publishing the clean ' + Config.bank.title + ' cloud state…');
    await publishEmptyCloudState(folders, resetId);
    return { resetId: resetId, bankId: Config.bank.id, bankTitle: Config.bank.title };
  }

  window.BoardsHardResetService = Object.freeze({
    execute: execute,
    activeLocalKeys: activeLocalKeys,
    clearActiveLocalData: clearActiveLocalData,
    locateVisibleVault: locateVisibleVault
  });
})();