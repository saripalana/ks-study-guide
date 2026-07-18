(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Model = window.BoardsQuestionBankModel;
  const DriveFactory = window.BoardsVisibleDriveClient;
  if (!Config || !Store || !Model || !DriveFactory || !Config.questionVault) {
    throw new Error('Question vault dependencies are unavailable.');
  }

  const Vault = Config.questionVault;
  let busy = false;
  let rootFolder = null;
  let folders = {};
  let pendingPerformanceTimer = null;
  let lastPerformanceHash = '';

  const drive = DriveFactory.create({
    clientId: Config.drive.clientId,
    scope: Vault.scope,
    retryLimit: Config.drive.retryLimit,
    onAuthorized: function () {
      setStatus('Connected securely. Preparing the dedicated question vault…', 'neutral');
      updateUi();
      initializeVault().catch(handleError);
    },
    onDisconnected: function () {
      rootFolder = null;
      folders = {};
      clearTimeout(pendingPerformanceTimer);
      updateUi();
    },
    onError: handleError
  });

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function timestampName() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function safeFilePart(value) {
    return String(value || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 100);
  }

  function setStatus(message, tone) {
    const element = document.getElementById('questionVaultStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }

  function setDraftStatus(message, tone) {
    const element = document.getElementById('questionDraftStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }

  function updateUi() {
    const connected = drive.isConnected();
    const connect = document.getElementById('connectQuestionVault');
    const syncBank = document.getElementById('syncQuestionBankVault');
    const syncPerformance = document.getElementById('syncQuestionPerformance');
    const correlated = document.getElementById('refreshCorrelatedExport');
    const createDraft = document.getElementById('createQuestionDraft');
    const validateDraft = document.getElementById('validateQuestionDraft');
    const open = document.getElementById('openQuestionVault');
    const disconnect = document.getElementById('disconnectQuestionVault');
    const revoke = document.getElementById('revokeQuestionVault');

    if (connect) {
      connect.textContent = connected ? 'Question Vault connected' : 'Connect Question Vault';
      connect.disabled = connected || busy;
    }
    [syncBank, syncPerformance, correlated, createDraft, validateDraft].forEach(function (button) {
      if (button) button.disabled = !connected || busy || !rootFolder;
    });
    if (open) {
      open.hidden = !rootFolder || !rootFolder.webViewLink;
      if (rootFolder && rootFolder.webViewLink) open.href = rootFolder.webViewLink;
    }
    if (disconnect) disconnect.disabled = !connected;
    if (revoke) revoke.disabled = !connected;

    const summary = document.getElementById('questionVaultSummary');
    if (summary) {
      summary.textContent = rootFolder
        ? 'Vault ready · Production, Drafts, History, Test History, and Change Sets are separated.'
        : 'Not initialized yet.';
    }
  }

  function ensureUi() {
    if (document.getElementById('questionVaultSection')) return;
    const column = document.querySelector('.dashboard-column-wide');
    if (!column) return;

    const style = document.createElement('style');
    style.id = 'questionVaultCss';
    style.textContent =
      '.question-vault-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}' +
      '.question-vault-note{margin-top:12px;padding:11px 12px;border-left:4px solid #6d55a4;background:#f5f2fb;border-radius:5px;color:#4b3d68;font-size:12px;line-height:1.5}' +
      '.question-vault-summary{margin-top:12px;color:var(--muted);font-size:12px}' +
      '.question-vault-actions a.secondary-button{display:inline-flex;align-items:center;text-decoration:none}';
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.id = 'questionVaultSection';
    section.className = 'progress-management-section';
    section.innerHTML =
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">QUESTION DATA VAULT</div><h3>Visible Google Drive question archive</h3>' +
      '<p class="field-help">Stores the complete question bank and correlated performance in a dedicated folder created by this app. It cannot browse unrelated Drive files.</p></div></div>' +
      '<div class="question-vault-actions"><button type="button" id="connectQuestionVault" class="primary-button">Connect Question Vault</button>' +
      '<button type="button" id="syncQuestionBankVault" class="secondary-button" disabled>Sync production mirror</button>' +
      '<button type="button" id="syncQuestionPerformance" class="secondary-button" disabled>Sync performance</button>' +
      '<button type="button" id="refreshCorrelatedExport" class="secondary-button" disabled>Refresh AI-ready export</button>' +
      '<a id="openQuestionVault" class="secondary-button" target="_blank" rel="noopener" hidden>Open vault in Drive</a>' +
      '<button type="button" id="disconnectQuestionVault" class="secondary-button" disabled>Disconnect vault session</button>' +
      '<button type="button" id="revokeQuestionVault" class="secondary-button" disabled>Revoke vault access</button></div>' +
      '<div id="questionVaultStatus" class="drive-backup-status neutral">Not connected. This optional vault uses only the limited drive.file permission.</div>' +
      '<div id="questionVaultSummary" class="question-vault-summary">Not initialized yet.</div>' +
      '<div class="question-vault-note"><strong>Safety boundary:</strong> the live site still uses the reviewed question bank in GitHub main. Drive Production is a mirror; Drive Drafts never publish automatically. Proposed question changes belong in the separate <code>' + escapeHtml(Vault.stagingBranch) + '</code> branch and require validation before merging.</div></article>' +
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">DRAFT WORKSPACE</div><h3>Safe question editing environment</h3>' +
      '<p class="field-help">Create a draft copy for proposed question, answer, or explanation changes. Existing drafts are archived before replacement.</p></div></div>' +
      '<div class="question-vault-actions"><button type="button" id="createQuestionDraft" class="secondary-button" disabled>Create or refresh draft</button>' +
      '<button type="button" id="validateQuestionDraft" class="secondary-button" disabled>Validate Drive draft</button></div>' +
      '<div id="questionDraftStatus" class="drive-backup-status neutral">No draft has been inspected during this session.</div></article>';

    const driveSection = document.getElementById('driveBackupSection');
    if (driveSection && driveSection.parentNode === column) driveSection.insertAdjacentElement('afterend', section);
    else column.appendChild(section);

    document.getElementById('connectQuestionVault').addEventListener('click', function () {
      try { drive.connect(); }
      catch (error) { handleError(error); }
    });
    document.getElementById('syncQuestionBankVault').addEventListener('click', function () { syncProduction(false).catch(handleError); });
    document.getElementById('syncQuestionPerformance').addEventListener('click', function () { syncPerformance(true).catch(handleError); });
    document.getElementById('refreshCorrelatedExport').addEventListener('click', function () { refreshCorrelated().catch(handleError); });
    document.getElementById('createQuestionDraft').addEventListener('click', function () { createDraft().catch(handleError); });
    document.getElementById('validateQuestionDraft').addEventListener('click', function () { validateDraft().catch(handleError); });
    document.getElementById('disconnectQuestionVault').addEventListener('click', function () {
      drive.disconnect();
      setStatus('Disconnected from the Question Vault for this browser session.', 'neutral');
    });
    document.getElementById('revokeQuestionVault').addEventListener('click', function () {
      drive.revoke(function () { setStatus('Question Vault access was revoked at Google.', 'good'); });
    });
    updateUi();
  }

  async function writeManifest(patch) {
    const existing = await drive.readNamed(Vault.files.manifest, folders.production);
    const manifest = Object.assign({
      schemaVersion: Vault.schemaVersion,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      sourceRepository: Vault.repository,
      productionBranch: 'main',
      stagingBranch: Vault.stagingBranch,
      safety: {
        driveProductionIsMirror: true,
        draftAutoPublishes: false,
        historyIsAppendOnly: true,
        completedTestHistoryIsAppendOnly: true
      }
    }, existing.payload || {}, patch || {}, { updatedAt: Date.now() });
    await drive.upsertJson(Vault.files.manifest, folders.production, manifest, 'manifest');
    return manifest;
  }

  async function syncProduction(initializing) {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    setStatus('Validating and synchronizing the production question mirror…', 'neutral');
    try {
      const local = Model.buildMasterPackage();
      const validation = Model.validatePackage(local);
      if (!validation.valid) throw new Error('The live question bank failed validation: ' + validation.errors.slice(0, 3).join(' '));
      const existing = await drive.readNamed(Vault.files.master, folders.production);
      if (existing.payload && existing.payload.bankHash === local.bankHash) {
        await writeManifest({ bankHash: local.bankHash, questionCount: local.questionCount, sourceBuild: Config.build });
        setStatus('Production mirror already matches the live reviewed question bank.', 'good');
        return;
      }

      if (existing.payload) {
        const diff = Model.diffPackages(existing.payload, local);
        const message = 'Update the Drive production mirror? ' + diff.added.length + ' added, ' + diff.changed.length + ' changed, and ' + diff.removed.length + ' removed. The existing production version will be archived first.';
        if (!initializing && !confirm(message)) {
          setStatus('Production mirror update canceled. No Drive question data changed.', 'warning');
          return;
        }
        await drive.appendJson('question-bank-master-' + timestampName() + '-' + (existing.payload.bankHash || 'unknown') + '.json', folders.history, existing.payload, 'production-history');
        await drive.appendJson('change-set-' + timestampName() + '.json', folders.changes, {
          schemaVersion: Vault.schemaVersion,
          projectId: Config.projectId,
          createdAt: Date.now(),
          fromBankHash: existing.payload.bankHash || '',
          toBankHash: local.bankHash,
          sourceBuild: Config.build,
          diff: diff
        }, 'change-set');
      }

      await drive.upsertJson(Vault.files.master, folders.production, local, 'production-master');
      await writeManifest({ bankHash: local.bankHash, questionCount: local.questionCount, sourceBuild: Config.build, lastProductionSyncAt: Date.now() });
      Store.milestone('Question bank production mirror synchronized', { bankHash: local.bankHash, questionCount: local.questionCount });
      setStatus('Production mirror synchronized. Any previous production version was preserved in History.', 'good');
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function archiveCompletedTests() {
    const localTests = Store.read(Config.storage.keys.tests, []);
    const indexResult = await drive.readNamed(Vault.files.testIndex, folders.production);
    const hadIndex = !!(indexResult.payload && Array.isArray(indexResult.payload.tests));
    const index = hadIndex
      ? indexResult.payload
      : {
          schemaVersion: Vault.schemaVersion,
          projectId: Config.projectId,
          datasetId: Vault.datasetId,
          createdAt: Date.now(),
          tests: []
        };
    const known = new Set(index.tests.map(function (item) { return String(item.setId || ''); }));
    let added = 0;

    if (Array.isArray(localTests)) {
      for (const test of localTests) {
        const setId = String(test && test.setId || '');
        if (!setId || known.has(setId)) continue;
        const completedAt = Number(test.completedAt) || Date.now();
        const fileName = 'test-' + new Date(completedAt).toISOString().replace(/[:.]/g, '-') + '-' + safeFilePart(setId) + '.json';
        const packageValue = {
          schemaVersion: Vault.schemaVersion,
          projectId: Config.projectId,
          datasetId: Vault.datasetId,
          environment: 'completed-test-history',
          archivedAt: Date.now(),
          test: test
        };
        const file = await drive.upsertJson(fileName, folders.tests, packageValue, 'completed-test');
        index.tests.push({
          setId: setId,
          completedAt: completedAt,
          archivedAt: Date.now(),
          fileId: file.id,
          fileName: fileName,
          mode: test.mode || '',
          total: Number(test.total) || 0,
          scorePct: Number(test.scorePct) || 0,
          bankBuild: Config.build
        });
        known.add(setId);
        added += 1;
      }
    }

    index.tests.sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });
    index.testCount = index.tests.length;
    if (added > 0 || !hadIndex) {
      index.updatedAt = Date.now();
      await drive.upsertJson(Vault.files.testIndex, folders.production, index, 'completed-test-index');
    }
    return { index: index, added: added };
  }

  async function syncPerformance(showMessage) {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    if (showMessage) setStatus('Synchronizing compact per-question performance and completed-test history…', 'neutral');
    try {
      const master = Model.buildMasterPackage();
      const priorResult = await drive.readNamed(Vault.files.performance, folders.production);
      const performance = Model.buildPerformancePackage(master, priorResult.payload);
      const archive = await archiveCompletedTests();
      if (!showMessage && performance.performanceHash === lastPerformanceHash && archive.added === 0) return;
      await drive.upsertJson(Vault.files.performance, folders.production, performance, 'performance');
      await writeManifest({
        performanceHash: performance.performanceHash,
        historicalTestCount: performance.historicalTestCount,
        archivedTestCount: archive.index.testCount,
        lastPerformanceSyncAt: Date.now()
      });
      lastPerformanceHash = performance.performanceHash;
      if (showMessage) {
        setStatus('Performance synchronized. ' + archive.index.testCount + ' completed tests are preserved in append-only Test History.', 'good');
      }
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function refreshCorrelated() {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    setStatus('Building the complete AI-ready question and performance export…', 'neutral');
    try {
      const masterResult = await drive.readNamed(Vault.files.master, folders.production);
      const master = masterResult.payload || Model.buildMasterPackage();
      const priorPerformance = await drive.readNamed(Vault.files.performance, folders.production);
      const performance = Model.buildPerformancePackage(master, priorPerformance.payload);
      const correlated = Model.buildCorrelatedPackage(master, performance);
      await drive.upsertJson(Vault.files.correlated, folders.production, correlated, 'ai-ready-correlated');
      await writeManifest({ correlatedHash: correlated.exportHash, lastCorrelatedExportAt: Date.now() });
      setStatus('AI-ready correlated export refreshed. It is visible inside the dedicated Drive vault.', 'good');
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function createDraft() {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    setDraftStatus('Preparing a protected draft copy…', 'neutral');
    try {
      const productionResult = await drive.readNamed(Vault.files.master, folders.production);
      const production = productionResult.payload || Model.buildMasterPackage();
      const draftResult = await drive.readNamed(Vault.files.draft, folders.drafts);
      if (draftResult.payload) {
        await drive.appendJson('question-bank-draft-archive-' + timestampName() + '.json', folders.history, draftResult.payload, 'draft-history');
      }
      const draft = Object.assign({}, production, {
        environment: 'draft',
        generatedAt: Date.now(),
        baseBankHash: production.bankHash,
        draftId: 'draft-' + Date.now(),
        instructions: 'Edit this draft only. Do not replace Production directly. Changes require validation and review in the ' + Vault.stagingBranch + ' GitHub branch.'
      });
      await drive.upsertJson(Vault.files.draft, folders.drafts, draft, 'draft');
      setDraftStatus('Draft created from Production. Any earlier draft was archived first.', 'good');
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function validateDraft() {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    setDraftStatus('Reading and validating the Drive draft…', 'neutral');
    try {
      const draftResult = await drive.readNamed(Vault.files.draft, folders.drafts);
      if (!draftResult.payload) {
        setDraftStatus('No Drive draft exists yet. Create one first.', 'warning');
        return;
      }
      const validation = Model.validatePackage(draftResult.payload);
      const productionResult = await drive.readNamed(Vault.files.master, folders.production);
      const diff = Model.diffPackages(productionResult.payload || Model.buildMasterPackage(), draftResult.payload);
      const summary = validation.valid
        ? 'Draft valid: ' + validation.questionCount + ' questions · ' + diff.added.length + ' added · ' + diff.changed.length + ' changed · ' + diff.removed.length + ' removed' + (validation.warnings.length ? ' · ' + validation.warnings.length + ' warnings.' : '.')
        : 'Draft invalid: ' + validation.errors.length + ' errors. ' + validation.errors.slice(0, 3).join(' ');
      setDraftStatus(summary, validation.valid ? (diff.removed.length ? 'warning' : 'good') : 'error');
      await drive.appendJson('draft-validation-' + timestampName() + '.json', folders.changes, {
        schemaVersion: Vault.schemaVersion,
        projectId: Config.projectId,
        createdAt: Date.now(),
        draftId: draftResult.payload.draftId || '',
        baseBankHash: draftResult.payload.baseBankHash || '',
        validation: validation,
        diff: diff,
        approvedForAutomaticPublish: false
      }, 'draft-validation');
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function inspectVault() {
    const masterResult = await drive.readNamed(Vault.files.master, folders.production);
    if (!masterResult.payload) {
      await syncProduction(true);
      await syncPerformance(false);
      await refreshCorrelated();
      setStatus('Question Vault initialized with Production, performance, and an AI-ready export.', 'good');
      return;
    }
    const local = Model.buildMasterPackage();
    if (masterResult.payload.bankHash === local.bankHash) {
      setStatus('Question Vault connected. Production matches the live reviewed question bank.', 'good');
    } else {
      const diff = Model.diffPackages(masterResult.payload, local);
      setStatus('The live question bank differs from the Drive Production mirror: ' + diff.added.length + ' added, ' + diff.changed.length + ' changed, ' + diff.removed.length + ' removed. Review and use Sync production mirror.', 'warning');
    }
    await syncPerformance(false);
  }

  async function initializeVault() {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    try {
      rootFolder = await drive.ensureFolder(Vault.rootFolder, null, 'root');
      folders.production = await drive.ensureFolder(Vault.folders.production, rootFolder.id, 'production');
      folders.drafts = await drive.ensureFolder(Vault.folders.drafts, rootFolder.id, 'drafts');
      folders.history = await drive.ensureFolder(Vault.folders.history, rootFolder.id, 'history');
      folders.tests = await drive.ensureFolder(Vault.folders.tests, rootFolder.id, 'test-history');
      folders.changes = await drive.ensureFolder(Vault.folders.changes, rootFolder.id, 'changes');
    } finally {
      busy = false;
      updateUi();
    }
    await inspectVault();
  }

  function schedulePerformanceSync(delay) {
    if (!drive.isConnected()) return;
    clearTimeout(pendingPerformanceTimer);
    pendingPerformanceTimer = setTimeout(function () {
      syncPerformance(false).catch(handleError);
    }, Math.max(1000, Number(delay) || Vault.performanceSyncMinMs));
  }

  function handleError(error) {
    busy = false;
    updateUi();
    const message = error && error.message ? error.message : 'Question Vault operation failed.';
    setStatus(message, 'error');
    console.error(error);
  }

  function init() {
    ensureUi();
    drive.initialize();
    window.addEventListener(Config.events.storageChanged, function () {
      if (drive.isConnected()) schedulePerformanceSync(Vault.performanceSyncMinMs);
    });
    window.addEventListener(Config.events.milestone, function () {
      if (drive.isConnected()) schedulePerformanceSync(5000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BoardsQuestionVault = {
    connect: drive.connect,
    syncProduction: syncProduction,
    syncPerformance: syncPerformance,
    refreshCorrelated: refreshCorrelated,
    createDraft: createDraft,
    validateDraft: validateDraft,
    disconnect: drive.disconnect,
    revoke: drive.revoke
  };
})();