(function () {
  'use strict';

  const DEFAULT_BANK = Object.freeze({
    id: 'ks-psychiatry-core',
    title: 'K&S Psychiatry Core',
    shortTitle: 'K&S Core',
    description: 'Primary psychiatry question bank for personal ABPN board preparation.',
    sourceFile: 'data.js',
    sourceType: 'legacy-global',
    stagingBranch: 'question-bank-staging',
    driveFolder: 'ks-psychiatry-core',
    legacyStorage: true,
    boardExam: 'ABPN Psychiatry Certification'
  });

  const suppliedBank = window.BOARDS_BANK_BOOTSTRAP && typeof window.BOARDS_BANK_BOOTSTRAP === 'object'
    ? window.BOARDS_BANK_BOOTSTRAP
    : {};
  const activeBank = Object.freeze(Object.assign({}, DEFAULT_BANK, suppliedBank));

  function safeBankId(value) {
    const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!normalized) throw new Error('A stable bank id is required.');
    return normalized;
  }

  const bankId = safeBankId(activeBank.id);
  const legacy = activeBank.legacyStorage === true && bankId === DEFAULT_BANK.id;
  const prefix = 'abpnBank:' + bankId + ':';

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
    app: prefix + 'app:v1',
    config: prefix + 'active-set:v1',
    history: prefix + 'question-history:v1',
    settings: prefix + 'settings:v1',
    tests: prefix + 'tests:v1',
    deletedTests: prefix + 'deleted-tests:v1',
    localBackups: prefix + 'recovery:v1',
    driveSettings: prefix + 'drive-settings:v1'
  });

  const currentBackupFile = legacy
    ? 'psychiatry-board-current-v1.json'
    : 'abpn-' + bankId + '-current-v1.json';
  const historyBackupFile = legacy
    ? 'psychiatry-board-history-v1.json'
    : 'abpn-' + bankId + '-history-v1.json';

  const timingBands = Object.freeze([
    Object.freeze({ id: 'under-30', label: 'Under 30 seconds', minSeconds: 0, maxSeconds: 29.999 }),
    Object.freeze({ id: '30-59', label: '30–59 seconds', minSeconds: 30, maxSeconds: 59.999 }),
    Object.freeze({ id: '60-89', label: '60–89 seconds', minSeconds: 60, maxSeconds: 89.999 }),
    Object.freeze({ id: '90-119', label: '90–119 seconds', minSeconds: 90, maxSeconds: 119.999 }),
    Object.freeze({ id: '120-plus', label: '120 seconds or longer', minSeconds: 120, maxSeconds: null })
  ]);

  window.BoardsConfig = Object.freeze({
    projectId: 'psychiatry-board-practice',
    platformId: 'abpn-personal-study-platform',
    appName: 'Psychiatry Board Practice',
    build: '2026.07.18.5',
    schemaVersion: 3,
    platform: Object.freeze({
      purpose: 'Personal ABPN psychiatry board study',
      personalUseOnly: true,
      maxTotalCards: 5000,
      expectedTotalCards: 2500,
      activeBank: activeBank,
      bankId: bankId,
      registrySchemaVersion: 1,
      registryFile: 'bank-registry.json',
      rootFolder: 'Psychiatry Board Question Vault',
      folders: Object.freeze({
        registry: 'Registry',
        banks: 'Banks',
        aiWorkspace: 'AI Workspace',
        aiRequests: 'Requests',
        aiProposals: 'Proposals',
        aiExports: 'Exports'
      })
    }),
    storage: Object.freeze({
      keys: storageKeys,
      backupKeys: Object.freeze([
        storageKeys.app,
        storageKeys.config,
        storageKeys.history,
        storageKeys.settings,
        storageKeys.tests,
        storageKeys.deletedTests,
        storageKeys.localBackups
      ])
    }),
    drive: Object.freeze({
      clientId: '891140884034-l0dljgrr0982f1pidfgnr915mhrqplq5.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      currentFile: currentBackupFile,
      historyFile: historyBackupFile,
      maxHistory: 20,
      maxHistoryBytes: 4 * 1024 * 1024,
      autoSyncMinMs: 30000,
      retryLimit: 3
    }),
    questionVault: Object.freeze({
      schemaVersion: 2,
      datasetId: bankId,
      bankId: bankId,
      bankTitle: activeBank.title,
      bankFolder: activeBank.driveFolder || bankId,
      repository: 'saripalana/ks-study-guide',
      stagingBranch: activeBank.stagingBranch || 'question-bank-staging',
      scope: 'https://www.googleapis.com/auth/drive.file',
      rootFolder: 'Psychiatry Board Question Vault',
      folders: Object.freeze({
        production: 'Production',
        drafts: 'Drafts',
        history: 'History',
        tests: 'Test History',
        changes: 'Change Sets'
      }),
      files: Object.freeze({
        manifest: 'vault-manifest.json',
        master: 'question-bank-master.json',
        performance: 'question-performance.json',
        correlated: 'question-bank-correlated-latest.json',
        draft: 'question-bank-draft.json',
        testIndex: 'completed-tests-index.json'
      }),
      timingBands: timingBands,
      recentAttemptsPerQuestion: 8,
      performanceSyncMinMs: 60000
    }),
    limits: Object.freeze({
      savedTests: 50,
      localBackups: 12,
      deletedTestTombstones: 300,
      maxCardsPerBank: 5000
    }),
    events: Object.freeze({
      storageChanged: 'ksboards:storage-changed',
      milestone: 'ksboards:milestone',
      ready: 'ksboards:ready'
    })
  });
})();
