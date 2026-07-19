(function () {
  'use strict';

  const DEFAULT_BANK_ID = 'ks-psychiatry-core';
  const SELECTION_KEY = 'ksBoardsSelectedQuestionBankV1';
  const CATALOG_EVENT = 'ksboards:question-bank-catalog-changed';
  const ACTIVE_EVENT = 'ksboards:active-question-bank-changed';

  function cleanId(value) {
    const id = String(value || '').trim().toLowerCase();
    if (!id || !/^[a-z0-9][a-z0-9._:-]*$/.test(id)) throw new Error('Question-bank ids may contain only letters, numbers, periods, colons, underscores, and hyphens.');
    return id;
  }

  function createRegistry(initialQuestions) {
    const catalog = new Map();

    function validateQuestions(questions, bankId) {
      const ids = new Set();
      questions.forEach(function (question, index) {
        const id = question && question.id != null ? String(question.id).trim() : '';
        if (!id) throw new Error('Question ' + (index + 1) + ' in ' + bankId + ' has no stable id.');
        if (ids.has(id)) throw new Error('Duplicate question id in ' + bankId + ': ' + id);
        ids.add(id);
      });
    }

    function normalizeDefinition(definition) {
      const value = Object.assign({}, definition || {});
      value.id = cleanId(value.id);
      value.title = String(value.title || value.id);
      value.shortTitle = String(value.shortTitle || value.title);
      value.description = String(value.description || '');
      value.status = String(value.status || 'active');
      value.source = String(value.source || 'static');
      value.legacyStorage = value.legacyStorage === true;
      value.questions = Array.isArray(value.questions) ? value.questions.slice() : [];
      validateQuestions(value.questions, value.id);
      value.ready = value.status === 'active' && value.questions.length > 0;
      value.questionCount = value.questions.length;
      return Object.freeze(value);
    }

    function publicDefinition(definition) {
      return Object.freeze({
        id: definition.id,
        title: definition.title,
        shortTitle: definition.shortTitle,
        description: definition.description,
        status: definition.status,
        source: definition.source,
        legacyStorage: definition.legacyStorage,
        ready: definition.ready,
        questionCount: definition.questionCount
      });
    }

    function list() {
      return Array.from(catalog.values()).map(publicDefinition).sort(function (a, b) {
        if (a.id === DEFAULT_BANK_ID) return -1;
        if (b.id === DEFAULT_BANK_ID) return 1;
        return a.title.localeCompare(b.title);
      });
    }

    function emit(name, detail) {
      try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); }
      catch (error) { console.warn('Could not publish question-bank registry event.', error); }
    }

    function register(definition, options) {
      const normalized = normalizeDefinition(definition);
      const existing = catalog.get(normalized.id);
      if (existing && JSON.stringify(publicDefinition(existing)) !== JSON.stringify(publicDefinition(normalized))) {
        throw new Error('A conflicting definition already exists for question bank ' + normalized.id + '.');
      }
      catalog.set(normalized.id, normalized);
      if (!(options && options.silent)) emit(CATALOG_EVENT, { bank: publicDefinition(normalized), banks: list() });
      return publicDefinition(normalized);
    }

    register({
      id: DEFAULT_BANK_ID,
      title: 'K&S Psychiatry Question Bank',
      shortTitle: 'K&S Psychiatry',
      description: 'The original K&S psychiatry study question bank.',
      status: 'active',
      source: 'data.js',
      legacyStorage: true,
      questions: Array.isArray(initialQuestions) ? initialQuestions : []
    }, { silent: true });

    (Array.isArray(window.BOARDS_QUESTION_BANKS) ? window.BOARDS_QUESTION_BANKS : []).forEach(function (definition) {
      register(definition, { silent: true });
    });

    function selectedId() {
      try { return cleanId(localStorage.getItem(SELECTION_KEY) || DEFAULT_BANK_ID); }
      catch (error) { return DEFAULT_BANK_ID; }
    }

    function activeInternal() {
      const requested = catalog.get(selectedId());
      if (requested && requested.ready) return requested;
      return catalog.get(DEFAULT_BANK_ID);
    }

    function activeBank() {
      return publicDefinition(activeInternal());
    }

    function select(bankId, options) {
      const id = cleanId(bankId);
      const bank = catalog.get(id);
      if (!bank) throw new Error('Question bank not found: ' + id);
      if (!bank.ready) throw new Error(bank.title + ' is listed but is not ready for practice yet.');
      const current = activeInternal();
      if (current.id === id) return publicDefinition(current);
      localStorage.setItem(SELECTION_KEY, id);
      emit(ACTIVE_EVENT, { previousBankId: current.id, bank: publicDefinition(bank) });
      if (!(options && options.reload === false)) window.location.reload();
      return publicDefinition(bank);
    }

    function storageNamespace(bankId) {
      const bank = catalog.get(cleanId(bankId || activeInternal().id));
      if (!bank) throw new Error('Question bank not found.');
      return bank.legacyStorage ? '' : 'abpnBank:' + bank.id + ':';
    }

    function applyIdentity() {
      const bank = activeInternal();
      const eyebrow = document.getElementById('activeBankEyebrow') || document.querySelector('.dashboard-eyebrow');
      const heading = document.getElementById('activeBankHeading') || document.querySelector('.bank-card h3');
      const description = document.getElementById('activeBankDescription') || document.querySelector('.bank-card .bank-heading p');
      if (eyebrow) eyebrow.textContent = bank.shortTitle.toUpperCase() + ' QUESTION BANK';
      if (heading) heading.textContent = bank.title;
      if (description) description.textContent = bank.description + ' ' + bank.questionCount + ' questions are loaded in this bank.';
      document.title = bank.title + ' · Psychiatry Board Practice';
    }

    const registry = Object.freeze({
      selectionKey: SELECTION_KEY,
      catalogEvent: CATALOG_EVENT,
      activeEvent: ACTIVE_EVENT,
      defaultBankId: DEFAULT_BANK_ID,
      register: register,
      list: list,
      get: function (id) { const bank = catalog.get(cleanId(id)); return bank ? publicDefinition(bank) : null; },
      activeBank: activeBank,
      activeQuestions: function () { return activeInternal().questions.slice(); },
      select: select,
      storageNamespace: storageNamespace,
      applyIdentity: applyIdentity
    });

    window.QUESTIONS = activeInternal().questions.slice();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyIdentity);
    else applyIdentity();
    return registry;
  }

  function createConfig(Registry) {
    const activeBank = Registry.activeBank();
    const namespace = Registry.storageNamespace(activeBank.id);
    const legacy = activeBank.legacyStorage;
    const storageKeys = Object.freeze(legacy ? {
      app: 'kaplanBoardPrepState',
      config: 'ksBoardsActiveSetv3',
      history: 'ksBoardsHistoryv3',
      settings: 'ksBoardsSettingsv3',
      tests: 'ksBoardsTestsV3',
      deletedTests: 'ksBoardsDeletedTestsV3',
      localBackups: 'ksBoardsBackupsV1',
      driveSettings: 'ksBoardsDriveSettingsV1'
    } : {
      app: namespace + 'appState',
      config: namespace + 'activeSet',
      history: namespace + 'history',
      settings: namespace + 'settings',
      tests: namespace + 'tests',
      deletedTests: namespace + 'deletedTests',
      localBackups: namespace + 'backups',
      driveSettings: namespace + 'driveSettings'
    });

    const driveStem = legacy ? 'psychiatry-board' : 'psychiatry-board-' + activeBank.id;
    const vaultPrefix = legacy ? '' : activeBank.id + '-';

    return Object.freeze({
      projectId: 'psychiatry-board-practice',
      appName: 'Psychiatry Board Practice',
      build: '2026.07.19.1',
      schemaVersion: 2,
      bank: Object.freeze({
        id: activeBank.id,
        title: activeBank.title,
        shortTitle: activeBank.shortTitle,
        description: activeBank.description,
        questionCount: activeBank.questionCount,
        legacyStorage: activeBank.legacyStorage,
        storageNamespace: namespace
      }),
      storage: Object.freeze({
        keys: storageKeys,
        backupKeys: Object.freeze([storageKeys.app, storageKeys.config, storageKeys.history, storageKeys.settings, storageKeys.tests, storageKeys.deletedTests, storageKeys.localBackups])
      }),
      drive: Object.freeze({
        clientId: '891140884034-l0dljgrr0982f1pidfgnr915mhrqplq5.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        currentFile: driveStem + '-current-v1.json',
        historyFile: driveStem + '-history-v1.json',
        maxHistory: 20,
        maxHistoryBytes: 4 * 1024 * 1024,
        autoSyncMinMs: 30000,
        retryLimit: 3
      }),
      questionVault: Object.freeze({
        schemaVersion: 1,
        datasetId: legacy ? 'psychiatry-board-question-bank' : 'psychiatry-board-question-bank-' + activeBank.id,
        bankId: activeBank.id,
        bankTitle: activeBank.title,
        bankFolder: activeBank.id,
        repository: 'saripalana/ks-study-guide',
        stagingBranch: 'question-bank-staging',
        scope: 'https://www.googleapis.com/auth/drive.file',
        rootFolder: 'Psychiatry Board Question Vault',
        folders: Object.freeze({ production: 'Production', drafts: 'Drafts', history: 'History', tests: 'Test History', changes: 'Change Sets' }),
        files: Object.freeze({
          manifest: vaultPrefix + 'vault-manifest.json',
          master: vaultPrefix + 'question-bank-master.json',
          performance: vaultPrefix + 'question-performance.json',
          correlated: vaultPrefix + 'question-bank-correlated-latest.json',
          draft: vaultPrefix + 'question-bank-draft.json',
          testIndex: vaultPrefix + 'completed-tests-index.json'
        }),
        performanceSyncMinMs: 60000
      }),
      exam: Object.freeze({ name: 'ABPN Psychiatry Certification Examination', date: '2026-09-08', displayDate: 'September 8, 2026', countdownBoundary: 'browser-local-midnight' }),
      hardReset: Object.freeze({ passcodeSha256: 'b625d589e853d767a8b042f3dafe9f03ebe267bc7da314b99a7600c3070d2957', confirmationPhrase: 'RESET ALL STUDY DATA' }),
      limits: Object.freeze({ savedTests: 50, localBackups: 12, deletedTestTombstones: 300, maxCardsPerBank: 5000, maxTotalCards: 5000 }),
      events: Object.freeze({ storageChanged: 'ksboards:storage-changed', milestone: 'ksboards:milestone', ready: 'ksboards:ready', bankCatalogChanged: Registry.catalogEvent, activeBankChanged: Registry.activeEvent })
    });
  }

  window.BoardsBootstrapQuestionBanks = function (questions) {
    if (window.BoardsQuestionBankRegistry && window.BoardsConfig) return window.BoardsConfig;
    const registry = createRegistry(questions);
    window.BoardsQuestionBankRegistry = registry;
    window.BoardsConfig = createConfig(registry);
    return window.BoardsConfig;
  };

  if (Array.isArray(window.QUESTIONS) && window.QUESTIONS.length) window.BoardsBootstrapQuestionBanks(window.QUESTIONS);
})();