(function () {
  'use strict';

  const storageKeys = Object.freeze({
    app: 'kaplanBoardPrepState',
    config: 'ksBoardsActiveSetv3',
    history: 'ksBoardsHistoryv3',
    settings: 'ksBoardsSettingsv3',
    tests: 'ksBoardsTestsV3',
    deletedTests: 'ksBoardsDeletedTestsV3',
    localBackups: 'ksBoardsBackupsV1',
    driveSettings: 'ksBoardsDriveSettingsV1'
  });

  window.BoardsConfig = Object.freeze({
    projectId: 'psychiatry-board-practice',
    appName: 'Psychiatry Board Practice',
    build: '2026.07.18.3',
    schemaVersion: 2,
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
      currentFile: 'psychiatry-board-current-v1.json',
      historyFile: 'psychiatry-board-history-v1.json',
      maxHistory: 20,
      maxHistoryBytes: 4 * 1024 * 1024,
      autoSyncMinMs: 30000,
      retryLimit: 3
    }),
    questionVault: Object.freeze({
      schemaVersion: 1,
      datasetId: 'psychiatry-board-question-bank',
      repository: 'saripalana/ks-study-guide',
      stagingBranch: 'question-bank-staging',
      scope: 'https://www.googleapis.com/auth/drive.file',
      rootFolder: 'Psychiatry Board Question Vault',
      folders: Object.freeze({
        production: 'Production',
        drafts: 'Drafts',
        history: 'History',
        changes: 'Change Sets'
      }),
      files: Object.freeze({
        manifest: 'vault-manifest.json',
        master: 'question-bank-master.json',
        performance: 'question-performance.json',
        correlated: 'question-bank-correlated-latest.json',
        draft: 'question-bank-draft.json'
      }),
      performanceSyncMinMs: 60000
    }),
    limits: Object.freeze({
      savedTests: 50,
      localBackups: 12,
      deletedTestTombstones: 300
    }),
    events: Object.freeze({
      storageChanged: 'ksboards:storage-changed',
      milestone: 'ksboards:milestone',
      ready: 'ksboards:ready'
    })
  });
})();