(function () {
  'use strict';

  const DEFAULT_EVENT = 'ksboards:drive-sync-state';
  let stateEvent = DEFAULT_EVENT;
  let fallbackTimer = null;

  function element(id) {
    return document.getElementById(id);
  }

  function formatDate(value) {
    const timestamp = Number(value) || 0;
    if (!timestamp) return 'Not recorded yet';
    return new Date(timestamp).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function summaryText(value) {
    const info = value || {};
    return Number(info.questions || 0) + ' questions with saved responses · ' +
      Number(info.tests || 0) + ' saved tests · ' +
      Number(info.recoveryBackups || 0) + ' recovery backups';
  }

  function setTone(status, text, tone) {
    status.textContent = text;
    status.className = 'device-sync-status ' + (tone || 'neutral');
  }

  function decisionFor(state) {
    const relation = state && state.relation;
    if (!state || !state.connected) {
      return {
        status: 'Not connected',
        tone: 'neutral',
        title: 'Connect Google Drive to compare copies',
        message: 'Nothing will be overwritten when you connect. The app first compares this browser with the latest Drive backup.'
      };
    }
    if (state.syncing || relation === 'checking') {
      return {
        status: 'Checking Drive',
        tone: 'neutral',
        title: 'Comparing this device with Google Drive…',
        message: 'Wait for the comparison to finish before choosing a copy.'
      };
    }
    if (relation === 'in-sync') {
      return {
        status: 'In sync',
        tone: 'good',
        title: 'This device and Google Drive match',
        message: 'No decision is needed. Continue studying here; automatic backup will keep Drive current while connected.'
      };
    }
    if (relation === 'local-newer') {
      return {
        status: 'This device appears newer',
        tone: 'warning',
        title: 'Recommended: use this device as the latest copy',
        message: 'This device changed after the Drive backup. Choosing it preserves the prior Drive copy in cloud history before updating Drive.'
      };
    }
    if (relation === 'drive-newer') {
      return {
        status: 'Drive appears newer',
        tone: 'warning',
        title: 'Recommended: get the latest copy from Drive',
        message: 'The Drive backup was created after the last recorded change on this device. The current browser is preserved before restoring.'
      };
    }
    if (relation === 'no-drive-backup') {
      return {
        status: 'Drive has no backup',
        tone: 'warning',
        title: 'Use this device as the first Drive copy',
        message: 'Google Drive does not yet contain a current backup. Backing up this device creates one without deleting local progress.'
      };
    }
    return {
      status: 'Choose which copy is latest',
      tone: 'warning',
      title: 'The copies differ and need your choice',
      message: 'Review both timestamps and summaries. Choose the copy you know contains your newest work; the other copy is archived before replacement.'
    };
  }

  function renderState(state) {
    const status = element('deviceSyncStatus');
    const message = element('deviceSyncMessage');
    const connect = element('deviceSyncConnect');
    const useLocal = element('deviceSyncBackup');
    const useDrive = element('deviceSyncRestore');
    if (!status || !message || !connect || !useLocal || !useDrive) return;

    const safeState = state || { connected: false, syncing: false, relation: 'disconnected', local: null, drive: null };
    const decision = decisionFor(safeState);
    setTone(status, decision.status, decision.tone);

    const localTime = element('deviceSyncLocalTime');
    const localSummary = element('deviceSyncLocalSummary');
    const driveTime = element('deviceSyncDriveTime');
    const driveSummary = element('deviceSyncDriveSummary');
    const recommendation = element('deviceSyncRecommendation');
    const timezone = element('deviceSyncTimezone');

    if (localTime) localTime.textContent = formatDate(safeState.local && safeState.local.updatedAt);
    if (localSummary) localSummary.textContent = summaryText(safeState.local && safeState.local.summary);
    if (driveTime) {
      if (!safeState.connected) driveTime.textContent = 'Connect to check';
      else if (safeState.syncing) driveTime.textContent = 'Checking…';
      else if (!safeState.drive) driveTime.textContent = 'No Drive backup found';
      else driveTime.textContent = formatDate(safeState.drive.updatedAt);
    }
    if (driveSummary) {
      if (!safeState.connected) driveSummary.textContent = 'The app cannot inspect the private backup until you connect.';
      else if (!safeState.drive) driveSummary.textContent = 'No current Drive study backup is available.';
      else driveSummary.textContent = summaryText(safeState.drive.summary);
    }
    if (timezone) timezone.textContent = 'Times shown in ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '.';
    if (recommendation) recommendation.textContent = decision.title;
    message.innerHTML = '<strong>' + decision.title + '</strong><span>' + decision.message + '</span>';

    const inSync = safeState.relation === 'in-sync';
    connect.disabled = !!safeState.connected || !!safeState.syncing;
    connect.textContent = safeState.connected ? 'Google Drive connected' : 'Connect Google Drive';
    useLocal.disabled = !safeState.connected || !!safeState.syncing || inSync;
    useDrive.disabled = !safeState.connected || !!safeState.syncing || !safeState.drive || inSync;

    const lastSync = element('deviceSyncLastSync');
    if (lastSync) lastSync.textContent = safeState.lastSyncedAt ? 'Last completed transfer: ' + formatDate(safeState.lastSyncedAt) : 'No completed transfer recorded on this browser.';
  }

  function driveApi() {
    return window.BoardsDriveBackup;
  }

  function refreshFromApi() {
    const api = driveApi();
    if (!api || typeof api.getSyncState !== 'function') {
      renderState({ connected: false, syncing: false, relation: 'disconnected', local: null, drive: null });
      return;
    }
    stateEvent = api.syncStateEvent || DEFAULT_EVENT;
    try {
      renderState(api.getSyncState());
    } catch (error) {
      console.error(error);
      renderState({ connected: false, syncing: false, relation: 'disconnected', local: null, drive: null });
    }
  }

  function callDrive(method) {
    const api = driveApi();
    if (!api || typeof api[method] !== 'function') {
      refreshFromApi();
      return;
    }
    try {
      const result = api[method]();
      if (result && typeof result.catch === 'function') result.catch(function (error) { console.error(error); refreshFromApi(); });
    } finally {
      setTimeout(refreshFromApi, 0);
      setTimeout(refreshFromApi, 500);
    }
  }

  function showDetailedControls() {
    const section = element('driveBackupSection');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const firstControl = element('connectGoogleDrive');
    if (firstControl) setTimeout(function () { firstControl.focus({ preventScroll: true }); }, 450);
  }

  function init() {
    const card = element('deviceSyncCard');
    if (!card) return;
    element('deviceSyncConnect').addEventListener('click', function () { callDrive('connect'); });
    element('deviceSyncBackup').addEventListener('click', function () { callDrive('backupNow'); });
    element('deviceSyncRestore').addEventListener('click', function () { callDrive('restoreLatest'); });
    element('deviceSyncDetails').addEventListener('click', showDetailedControls);

    window.addEventListener(DEFAULT_EVENT, function (event) { renderState(event.detail); });
    refreshFromApi();
    clearInterval(fallbackTimer);
    fallbackTimer = setInterval(refreshFromApi, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();