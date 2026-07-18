(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Model = window.BoardsQuestionBankModel;
  const Registry = window.BoardsBankRegistry;
  const DriveFactory = window.BoardsVisibleDriveClient;
  if (!Config || !Store || !Model || !Registry || !DriveFactory || !Config.questionVault) {
    throw new Error('Question vault dependencies are unavailable.');
  }

  const Vault = Config.questionVault;
  const Platform = Config.platform;
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
      setStatus('Connected securely. Preparing the multi-bank study platform…', 'neutral');
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
      connect.textContent = connected ? 'Question platform connected' : 'Connect Question Platform';
      connect.disabled = connected || busy;
    }
    [syncBank, syncPerformance, correlated, createDraft, validateDraft].forEach(function (button) {
      if (button) button.disabled = !connected || busy || !folders.bankRoot;
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
        ? Registry.activeBank.title + ' · ' + Registry.capacity.currentCards + ' cards · platform capacity ' + Platform.maxTotalCards + ' cards'
        : 'Current bank: ' + Registry.activeBank.title + ' · not initialized yet.';
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
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">MULTI-BANK STUDY PLATFORM</div><h3>Question banks, performance, and AI workspace</h3>' +
      '<p class="field-help">Stores complete bank content and correlated performance in separate bank folders. Designed for up to ' + Platform.maxTotalCards + ' personal ABPN study cards.</p></div></div>' +
      '<div class="question-vault-actions"><button type="button" id="connectQuestionVault" class="primary-button">Connect Question Platform</button>' +
      '<button type="button" id="syncQuestionBankVault" class="secondary-button" disabled>Sync active bank</button>' +
      '<button type="button" id="syncQuestionPerformance" class="secondary-button" disabled>Sync performance</button>' +
      '<button type="button" id="refreshCorrelatedExport" class="secondary-button" disabled>Refresh AI context</button>' +
      '<a id="openQuestionVault" class="secondary-button" target="_blank" rel="noopener" hidden>Open platform in Drive</a>' +
      '<button type="button" id="disconnectQuestionVault" class="secondary-button" disabled>Disconnect session</button>' +
      '<button type="button" id="revokeQuestionVault" class="secondary-button" disabled>Revoke access</button></div>' +
      '<div id="questionVaultStatus" class="drive-backup-status neutral">Not connected. Uses only the limited drive.file permission.</div>' +
      '<div id="questionVaultSummary" class="question-vault-summary">Current bank: ' + escapeHtml(Registry.activeBank.title) + ' · not initialized yet.</div>' +
      '<div class="question-vault-note"><strong>Safety boundary:</strong> each bank has separate Production, Drafts, History, Test History, and Change Sets. AI Requests and Proposals are separate from production. Nothing in Drive publishes automatically.</div></article>' +
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">DRAFT WORKSPACE</div><h3>Protected active-bank editing</h3>' +
      '<p class="field-help">Create a draft for additions or revisions. Existing drafts are archived before replacement and validation produces an explicit change set.</p></div></div>' +
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
      setStatus('Disconnected for this browser session.', 'neutral');
    });
    document.getElementById('revokeQuestionVault').addEventListener('click', function () {
      drive.revoke(function () { setStatus('Question-platform access was revoked at Google.', 'good'); });
    });
    updateUi();
  }

  async function ensureJson(name, folder, payload, role) {
    const existing = await drive.readNamed(name, folder);
    if (existing.payload) return existing.payload;
    await drive.upsertJson(name, folder, payload, role);
    return payload;
  }

  async function writePlatformRegistry(master) {
    const existing = await drive.readNamed(Platform.registryFile, folders.registry);
    const previousBanks = existing.payload && Array.isArray(existing.payload.banks) ? existing.payload.banks : [];
    const currentEntry = Registry.registryEntry(Registry.activeBank, master.questionCount, master.bankHash);
    currentEntry.drivePath = 'Banks/' + Vault.bankFolder;
    currentEntry.lastProductionBuild = Config.build;
    const payload = Registry.platformRegistry(previousBanks, currentEntry);
    payload.folderModel = 'Registry + Banks/<bankId> + AI Workspace';
    await drive.upsertJson(Platform.registryFile, folders.registry, payload, 'bank-registry');
    return payload;
  }

  async function writeAIWorkspace() {
    const manifest = {
      schemaVersion: 1,
      platformId: Config.platformId,
      projectId: Config.projectId,
      purpose: 'Machine-readable workspace for personal ABPN study improvement.',
      personalUseOnly: true,
      productionAutoPublish: false,
      stableIdentity: 'bankId::questionId',
      folders: {
        requests: Platform.folders.aiRequests,
        proposals: Platform.folders.aiProposals,
        exports: Platform.folders.aiExports
      },
      supportedOperations: [
        'analyze-performance',
        'identify-slow-categories',
        'identify-repeated-distractor-errors',
        'propose-new-questions',
        'revise-question-text',
        'revise-answer-choices',
        'revise-correct-answer',
        'revise-explanation',
        'add-categories-tags-and-learning-objectives'
      ],
      rules: [
        'Read AI context from Exports.',
        'Write requested work as a proposal, never directly into Production.',
        'Preserve existing compositeId values.',
        'Assign new never-reused question ids for new cards.',
        'Record additions, changes, and retirements explicitly.',
        'Require validation and Git review before production.'
      ],
      updatedAt: Date.now()
    };
    await drive.upsertJson('ai-workspace-manifest.json', folders.ai, manifest, 'ai-workspace-manifest');

    await ensureJson('question-change-request-template.json', folders.aiRequests, {
      schemaVersion: 1,
      requestId: 'request-YYYYMMDD-description',
      bankId: Config.platform.bankId,
      operation: 'analyze-performance | add-questions | revise-questions | categorize',
      instructions: '',
      filters: { categoryIds: [], questionIds: [], status: [], accuracyBelow: null, averageSecondsAbove: null },
      constraints: { maximumNewQuestions: null, preserveQuestionIds: true, productionAutoPublish: false },
      requestedAt: null
    }, 'ai-request-template');

    await ensureJson('question-change-proposal-template.json', folders.aiProposals, {
      schemaVersion: 1,
      proposalId: 'proposal-YYYYMMDD-description',
      requestId: '',
      bankId: Config.platform.bankId,
      baseBankHash: '',
      rationale: '',
      additions: [],
      changes: [],
      retiredQuestionIds: [],
      validation: { valid: false, errors: [], warnings: [] },
      approvedForProduction: false
    }, 'ai-proposal-template');
  }

  async function writeBankManifest(patch) {
    const existing = await drive.readNamed(Vault.files.manifest, folders.production);
    const manifest = Object.assign({
      schemaVersion: Vault.schemaVersion,
      platformId: Config.platformId,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      bankId: Config.platform.bankId,
      bankTitle: Registry.activeBank.title,
      sourceRepository: Vault.repository,
      productionBranch: 'main',
      stagingBranch: Vault.stagingBranch,
      drivePath: 'Banks/' + Vault.bankFolder,
      safety: {
        driveProductionIsMirror: true,
        draftAutoPublishes: false,
        historyIsAppendOnly: true,
        completedTestHistoryIsAppendOnly: true,
        aiProposalsAutoPublish: false
      }
    }, existing.payload || {}, patch || {}, { updatedAt: Date.now() });
    await drive.upsertJson(Vault.files.manifest, folders.production, manifest, 'manifest');
    return manifest;
  }

  async function migrateLegacyCurrentBank() {
    const legacyProduction = await drive.findFolder(Vault.folders.production, rootFolder.id);
    if (!legacyProduction || legacyProduction.id === folders.production.id) return false;
    let imported = false;
    for (const name of [Vault.files.master, Vault.files.performance, Vault.files.correlated, Vault.files.testIndex]) {
      const current = await drive.readNamed(name, folders.production);
      if (current.payload) continue;
      const legacy = await drive.readNamed(name, legacyProduction);
      if (!legacy.payload) continue;
      await drive.upsertJson(name, folders.production, legacy.payload, 'legacy-import');
      imported = true;
    }
    if (imported) {
      await drive.appendJson('legacy-vault-import-' + timestampName() + '.json', folders.changes, {
        schemaVersion: 1,
        platformId: Config.platformId,
        bankId: Config.platform.bankId,
        importedAt: Date.now(),
        source: 'Legacy root-level Production folder',
        destructiveChanges: false,
        note: 'Legacy files were copied into the bank namespace. Original files were left untouched.'
      }, 'legacy-import-record');
    }
    return imported;
  }

  async function syncProduction(initializing) {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    setStatus('Validating and synchronizing ' + Registry.activeBank.title + '…', 'neutral');
    try {
      const local = Model.buildMasterPackage();
      const validation = Model.validatePackage(local);
      if (!validation.valid) throw new Error('The active bank failed validation: ' + validation.errors.slice(0, 3).join(' '));
      const existing = await drive.readNamed(Vault.files.master, folders.production);
      if (existing.payload && existing.payload.bankHash === local.bankHash) {
        await writeBankManifest({ bankHash: local.bankHash, questionCount: local.questionCount, sourceBuild: Config.build });
        await writePlatformRegistry(local);
        setStatus('Production mirror already matches the reviewed active bank.', 'good');
        return;
      }

      if (existing.payload) {
        const diff = Model.diffPackages(existing.payload, local);
        const message = 'Update this bank mirror? ' + diff.added.length + ' added, ' + diff.changed.length + ' changed, and ' + diff.removed.length + ' removed. The current production mirror will be archived first.';
        if (!initializing && !confirm(message)) {
          setStatus('Production mirror update canceled. No Drive question data changed.', 'warning');
          return;
        }
        await drive.appendJson('question-bank-master-' + timestampName() + '-' + (existing.payload.bankHash || 'unknown') + '.json', folders.history, existing.payload, 'production-history');
        await drive.appendJson('change-set-' + timestampName() + '.json', folders.changes, {
          schemaVersion: Vault.schemaVersion,
          platformId: Config.platformId,
          bankId: Config.platform.bankId,
          createdAt: Date.now(),
          fromBankHash: existing.payload.bankHash || '',
          toBankHash: local.bankHash,
          sourceBuild: Config.build,
          diff: diff
        }, 'change-set');
      }

      await drive.upsertJson(Vault.files.master, folders.production, local, 'production-master');
      await writeBankManifest({ bankHash: local.bankHash, questionCount: local.questionCount, sourceBuild: Config.build, lastProductionSyncAt: Date.now() });
      await writePlatformRegistry(local);
      Store.milestone('Question bank production mirror synchronized', { bankId: Config.platform.bankId, bankHash: local.bankHash, questionCount: local.questionCount });
      setStatus('Active-bank mirror synchronized. Any prior version was preserved in this bank’s History folder.', 'good');
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function archiveCompletedTests() {
    const localTests = Store.read(Config.storage.keys.tests, []);
    const indexResult = await drive.readNamed(Vault.files.testIndex, folders.production);
    const hadIndex = !!(indexResult.payload && Array.isArray(indexResult.payload.tests));
    const index = hadIndex ? indexResult.payload : {
      schemaVersion: Vault.schemaVersion,
      platformId: Config.platformId,
      projectId: Config.projectId,
      datasetId: Vault.datasetId,
      bankId: Config.platform.bankId,
      createdAt: Date.now(),
      tests: []
    };
    const known = new Set(index.tests.map(function (item) { return String(item.setId || ''); }));
    let added = 0;

    if (Array.isArray(localTests)) {
      for (const test of localTests) {
        const setId = String(test && test.setId || '');
        const testBankId = String(test && test.bankId || Config.platform.bankId);
        if (!setId || testBankId !== Config.platform.bankId || known.has(setId)) continue;
        const completedAt = Number(test.completedAt) || Date.now();
        const fileName = 'test-' + new Date(completedAt).toISOString().replace(/[:.]/g, '-') + '-' + safeFilePart(setId) + '.json';
        const packageValue = {
          schemaVersion: Vault.schemaVersion,
          platformId: Config.platformId,
          projectId: Config.projectId,
          datasetId: Vault.datasetId,
          bankId: Config.platform.bankId,
          environment: 'completed-test-history',
          archivedAt: Date.now(),
          test: Object.assign({ bankId: Config.platform.bankId }, test)
        };
        const file = await drive.upsertJson(fileName, folders.tests, packageValue, 'completed-test');
        index.tests.push({
          setId: setId,
          bankId: Config.platform.bankId,
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
    if (showMessage) setStatus('Synchronizing per-question timing, categories, distractors, and completed tests…', 'neutral');
    try {
      const master = Model.buildMasterPackage();
      const priorResult = await drive.readNamed(Vault.files.performance, folders.production);
      const performance = Model.buildPerformancePackage(master, priorResult.payload);
      const archive = await archiveCompletedTests();
      if (!showMessage && performance.performanceHash === lastPerformanceHash && archive.added === 0) return;
      await drive.upsertJson(Vault.files.performance, folders.production, performance, 'performance');
      await writeBankManifest({
        performanceHash: performance.performanceHash,
        historicalTestCount: performance.historicalTestCount,
        archivedTestCount: archive.index.testCount,
        lastPerformanceSyncAt: Date.now()
      });
      lastPerformanceHash = performance.performanceHash;
      if (showMessage) {
        setStatus('Performance synchronized. ' + archive.index.testCount + ' completed tests are preserved for this bank.', 'good');
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
    setStatus('Building AI-ready question, timing, category, and performance context…', 'neutral');
    try {
      const masterResult = await drive.readNamed(Vault.files.master, folders.production);
      const master = masterResult.payload || Model.buildMasterPackage();
      const priorPerformance = await drive.readNamed(Vault.files.performance, folders.production);
      const performance = Model.buildPerformancePackage(master, priorPerformance.payload);
      const correlated = Model.buildCorrelatedPackage(master, performance);
      await drive.upsertJson(Vault.files.correlated, folders.production, correlated, 'ai-ready-correlated');
      await drive.upsertJson(Config.platform.bankId + '-ai-context-latest.json', folders.aiExports, correlated, 'ai-context-export');
      await writeBankManifest({ correlatedHash: correlated.exportHash, lastCorrelatedExportAt: Date.now() });
      setStatus('AI context refreshed in both the active bank and AI Workspace/Exports.', 'good');
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
        draftId: Config.platform.bankId + '-draft-' + Date.now(),
        instructions: 'Edit this bank draft only. Do not replace Production directly. Changes require validation and review in ' + Vault.stagingBranch + '.'
      });
      await drive.upsertJson(Vault.files.draft, folders.drafts, draft, 'draft');
      setDraftStatus('Draft created from this bank’s Production mirror. Any earlier draft was archived first.', 'good');
    } finally {
      busy = false;
      updateUi();
    }
  }

  async function validateDraft() {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    setDraftStatus('Reading and validating the active-bank Drive draft…', 'neutral');
    try {
      const draftResult = await drive.readNamed(Vault.files.draft, folders.drafts);
      if (!draftResult.payload) {
        setDraftStatus('No Drive draft exists for this bank yet. Create one first.', 'warning');
        return;
      }
      const validation = Model.validatePackage(draftResult.payload);
      const productionResult = await drive.readNamed(Vault.files.master, folders.production);
      const diff = Model.diffPackages(productionResult.payload || Model.buildMasterPackage(), draftResult.payload);
      const summary = validation.valid
        ? 'Draft valid: ' + validation.questionCount + ' cards · ' + diff.added.length + ' added · ' + diff.changed.length + ' changed · ' + diff.removed.length + ' retired' + (validation.warnings.length ? ' · ' + validation.warnings.length + ' warnings.' : '.')
        : 'Draft invalid: ' + validation.errors.length + ' errors. ' + validation.errors.slice(0, 3).join(' ');
      setDraftStatus(summary, validation.valid ? (diff.removed.length ? 'warning' : 'good') : 'error');
      await drive.appendJson('draft-validation-' + timestampName() + '.json', folders.changes, {
        schemaVersion: Vault.schemaVersion,
        platformId: Config.platformId,
        bankId: Config.platform.bankId,
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
      setStatus('Platform initialized with the active bank, performance history, registry, and AI workspace.', 'good');
      return;
    }
    const local = Model.buildMasterPackage();
    await writePlatformRegistry(local);
    if (masterResult.payload.bankHash === local.bankHash) {
      setStatus('Question platform connected. The active bank matches reviewed production.', 'good');
    } else {
      const diff = Model.diffPackages(masterResult.payload, local);
      setStatus('The active bank differs from its Drive mirror: ' + diff.added.length + ' added, ' + diff.changed.length + ' changed, ' + diff.removed.length + ' retired. Review and use Sync active bank.', 'warning');
    }
    await syncPerformance(false);
  }

  async function initializeVault() {
    if (!drive.isConnected() || busy) return;
    busy = true;
    updateUi();
    try {
      rootFolder = await drive.ensureFolder(Platform.rootFolder, null, 'platform-root');
      folders.registry = await drive.ensureFolder(Platform.folders.registry, rootFolder.id, 'platform-registry');
      folders.banks = await drive.ensureFolder(Platform.folders.banks, rootFolder.id, 'platform-banks');
      folders.ai = await drive.ensureFolder(Platform.folders.aiWorkspace, rootFolder.id, 'ai-workspace');
      folders.aiRequests = await drive.ensureFolder(Platform.folders.aiRequests, folders.ai.id, 'ai-requests');
      folders.aiProposals = await drive.ensureFolder(Platform.folders.aiProposals, folders.ai.id, 'ai-proposals');
      folders.aiExports = await drive.ensureFolder(Platform.folders.aiExports, folders.ai.id, 'ai-exports');
      folders.bankRoot = await drive.ensureFolder(Vault.bankFolder, folders.banks.id, 'bank-root');
      folders.production = await drive.ensureFolder(Vault.folders.production, folders.bankRoot.id, 'production');
      folders.drafts = await drive.ensureFolder(Vault.folders.drafts, folders.bankRoot.id, 'drafts');
      folders.history = await drive.ensureFolder(Vault.folders.history, folders.bankRoot.id, 'history');
      folders.tests = await drive.ensureFolder(Vault.folders.tests, folders.bankRoot.id, 'test-history');
      folders.changes = await drive.ensureFolder(Vault.folders.changes, folders.bankRoot.id, 'changes');
      await writeAIWorkspace();
      await migrateLegacyCurrentBank();
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
    const message = error && error.message ? error.message : 'Question-platform operation failed.';
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

  window.BoardsQuestionVault = Object.freeze({
    connect: drive.connect,
    syncProduction: syncProduction,
    syncPerformance: syncPerformance,
    refreshCorrelated: refreshCorrelated,
    createDraft: createDraft,
    validateDraft: validateDraft,
    disconnect: drive.disconnect,
    revoke: drive.revoke
  });
})();
