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
    build: '2026.07.18.2',
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
