(function () {
  'use strict';

  const DEFAULT_EVENT = 'ksboards:drive-sync-state';
  let fallbackTimer = null;
  let latestState = { connected: false, syncing: false, relation: 'disconnected', local: null, drive: null };

  function element(id) {
    return document.getElementById(id);
  }

  function ensureStylesheet() {
    const href = './styles/device-sync.css?v=3';
    if (document.querySelector('link[href="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
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
        status: 'Not connected', tone: 'neutral',
        title: 'Connect and sync to compare copies',
        message: 'The app will connect, compare both copies, and use the clearly newer source automatically.',
        primary: 'Connect and sync'
      };
    }
    if (state.syncing || relation === 'checking') {
      return {
        status: 'Syncing', tone: 'neutral',
        title: 'Comparing this device with Google Drive…',
        message: 'Hashes, timestamps, and saved-data summaries are being checked.',
        primary: 'Syncing…'
      };
    }
    if (relation === 'in-sync') {
      return {
        status: 'In sync', tone: 'good',
        title: 'This device and Google Drive match',
        message: 'No transfer is needed. Sync now will recheck both copies.',
        primary: 'Check again'
      };
    }
    if (relation === 'local-newer') {
      return {
        status: 'This device is newer', tone: 'warning',
        title: 'Sync now will update Google Drive from this device',
        message: 'The prior Drive copy will be archived before it is updated.',
        primary: 'Sync newest copy'
      };
    }
    if (relation === 'drive-newer') {
      return {
        status: 'Drive is newer', tone: 'warning',
        title: 'Sync now will update this device from Google Drive',
        message: 'The current browser copy will be preserved before Drive is restored.',
        primary: 'Sync newest copy'
      };
    }
    if (relation === 'no-drive-backup') {
      return {
        status: 'Drive has no backup', tone: 'warning',
        title: 'Sync now will create the first Drive backup from this device',
        message: 'Your local progress remains unchanged while the Drive copy is created.',
        primary: 'Create Drive backup'
      };
    }
    return {
      status: 'Choice required', tone: 'warning',
      title: 'The copies differ, but the newest source is unclear',
      message: 'Sync now will open a source-choice window instead of guessing.',
      primary: 'Review and sync'
    };
  }

  function updateChoiceDialog(state) {
    const safeState = state || latestState;
    const localTime = element('deviceSyncChoiceLocalTime');
    const localSummary = element('deviceSyncChoiceLocalSummary');
    const driveTime = element('deviceSyncChoiceDriveTime');
    const driveSummary = element('deviceSyncChoiceDriveSummary');
    const chooseLocal = element('deviceSyncChooseLocal');
    const chooseDrive = element('deviceSyncChooseDrive');
    const reconnect = element('deviceSyncChoiceConnect');

    if (localTime) localTime.textContent = formatDate(safeState.local && safeState.local.updatedAt);
    if (localSummary) localSummary.textContent = summaryText(safeState.local && safeState.local.summary);
    if (driveTime) {
      if (!safeState.connected) driveTime.textContent = 'Connect to check';
      else if (safeState.syncing) driveTime.textContent = 'Checking…';
      else if (!safeState.drive) driveTime.textContent = 'No Drive backup found';
      else driveTime.textContent = formatDate(safeState.drive.updatedAt);
    }
    if (driveSummary) {
      if (!safeState.connected) driveSummary.textContent = 'Connect Google Drive before selecting this source.';
      else if (!safeState.drive) driveSummary.textContent = 'No current Drive study backup is available.';
      else driveSummary.textContent = summaryText(safeState.drive.summary);
    }
    if (chooseLocal) chooseLocal.disabled = !safeState.connected || !!safeState.syncing;
    if (chooseDrive) chooseDrive.disabled = !safeState.connected || !!safeState.syncing || !safeState.drive;
    if (reconnect) {
      reconnect.hidden = !!safeState.connected;
      reconnect.disabled = !!safeState.syncing;
    }
  }

  function renderState(state) {
    latestState = state || { connected: false, syncing: false, relation: 'disconnected', local: null, drive: null };
    const status = element('deviceSyncStatus');
    const message = element('deviceSyncMessage');
    const syncNow = element('deviceSyncNow');
    const choose = element('deviceSyncChoose');
    if (!status || !message || !syncNow || !choose) return;

    const decision = decisionFor(latestState);
    setTone(status, decision.status, decision.tone);

    const localTime = element('deviceSyncLocalTime');
    const localSummary = element('deviceSyncLocalSummary');
    const driveTime = element('deviceSyncDriveTime');
    const driveSummary = element('deviceSyncDriveSummary');
    const timezone = element('deviceSyncTimezone');

    if (localTime) localTime.textContent = formatDate(latestState.local && latestState.local.updatedAt);
    if (localSummary) localSummary.textContent = summaryText(latestState.local && latestState.local.summary);
    if (driveTime) {
      if (!latestState.connected) driveTime.textContent = 'Connect to check';
      else if (latestState.syncing) driveTime.textContent = 'Checking…';
      else if (!latestState.drive) driveTime.textContent = 'No Drive backup found';
      else driveTime.textContent = formatDate(latestState.drive.updatedAt);
    }
    if (driveSummary) {
      if (!latestState.connected) driveSummary.textContent = 'The app cannot inspect the private backup until you connect.';
      else if (!latestState.drive) driveSummary.textContent = 'No current Drive study backup is available.';
      else driveSummary.textContent = summaryText(latestState.drive.summary);
    }
    if (timezone) timezone.textContent = 'Times shown in ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '.';
    message.innerHTML = '<strong id="deviceSyncRecommendation">' + decision.title + '</strong><span>' + decision.message + '</span>';

    syncNow.disabled = !!latestState.syncing;
    syncNow.textContent = decision.primary;
    choose.disabled = !!latestState.syncing;

    const lastSync = element('deviceSyncLastSync');
    if (lastSync) lastSync.textContent = latestState.lastSyncedAt ? 'Last completed transfer: ' + formatDate(latestState.lastSyncedAt) : 'No completed transfer recorded on this browser.';
    updateChoiceDialog(latestState);
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
    try {
      renderState(api.getSyncState());
    } catch (error) {
      console.error(error);
      renderState({ connected: false, syncing: false, relation: 'disconnected', local: null, drive: null });
    }
  }

  function dialogStatus(text, tone) {
    const status = element('deviceSyncChoiceStatus');
    if (!status) return;
    status.textContent = text || '';
    status.className = 'device-sync-dialog-status' + (tone ? ' ' + tone : '');
  }

  function openChoiceDialog(reason, tone) {
    const dialog = element('deviceSyncChoiceDialog');
    const reasonBox = element('deviceSyncChoiceReason');
    if (!dialog) return;
    updateChoiceDialog(latestState);
    if (reasonBox) reasonBox.textContent = reason || 'The automatic comparison could not safely choose a source. Review both copies and select the one that contains your newest work.';
    dialogStatus('', tone);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeChoiceDialog() {
    const dialog = element('deviceSyncChoiceDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  async function runAutomaticSync() {
    const api = driveApi();
    if (!api || typeof api.syncLatest !== 'function') {
      openChoiceDialog('Automatic sync is unavailable. Open the detailed controls or reconnect Google Drive.', 'error');
      return;
    }
    dialogStatus('Checking both copies…');
    try {
      const result = await api.syncLatest();
      if (result && result.action === 'needs-choice') {
        refreshFromApi();
        openChoiceDialog('The timestamps or saved states do not identify a safe automatic winner. Choose which copy contains your newest work.');
      }
    } catch (error) {
      refreshFromApi();
      openChoiceDialog('Automatic sync encountered an error: ' + (error && error.message ? error.message : 'Unknown synchronization error.'), 'error');
    } finally {
      setTimeout(refreshFromApi, 0);
      setTimeout(refreshFromApi, 500);
    }
  }

  async function chooseSource(source) {
    const api = driveApi();
    if (!api || typeof api.chooseSource !== 'function') {
      dialogStatus('The directional sync controls are unavailable. Reconnect Google Drive or open More sync details.', 'error');
      return;
    }
    dialogStatus(source === 'local' ? 'Saving this device as the latest copy…' : 'Retrieving the Google Drive copy…');
    try {
      const result = await api.chooseSource(source);
      if (result && result.action === 'used-local') {
        dialogStatus('This device is now the latest Google Drive copy.', 'good');
        setTimeout(closeChoiceDialog, 500);
      } else if (result && result.action === 'unavailable') {
        dialogStatus('That source is not currently available. Reconnect Google Drive and try again.', 'error');
      }
    } catch (error) {
      dialogStatus(error && error.message ? error.message : 'The selected transfer failed.', 'error');
    } finally {
      setTimeout(refreshFromApi, 0);
      setTimeout(refreshFromApi, 500);
    }
  }

  function reconnectFromDialog() {
    const api = driveApi();
    if (!api || typeof api.connect !== 'function') {
      dialogStatus('Google Drive connection controls are unavailable.', 'error');
      return;
    }
    dialogStatus('Opening Google authorization…');
    try { api.connect(); }
    catch (error) { dialogStatus(error && error.message ? error.message : 'Could not start Google authorization.', 'error'); }
  }

  function showDetailedControls() {
    const section = element('driveBackupSection');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const firstControl = element('connectGoogleDrive');
    if (firstControl) setTimeout(function () { firstControl.focus({ preventScroll: true }); }, 450);
  }

  async function init() {
    const card = element('deviceSyncCard');
    if (!card) return;
    ensureStylesheet();
    try {
      const view = await import('./ui/device-sync-view.js?v=2');
      view.mountDeviceSyncView(card);
    } catch (error) {
      console.error('Device Sync view could not load.', error);
      return;
    }

    element('deviceSyncNow').addEventListener('click', runAutomaticSync);
    element('deviceSyncChoose').addEventListener('click', function () { openChoiceDialog(); });
    element('deviceSyncDetails').addEventListener('click', showDetailedControls);
    element('deviceSyncChooseLocal').addEventListener('click', function () { chooseSource('local'); });
    element('deviceSyncChooseDrive').addEventListener('click', function () { chooseSource('drive'); });
    element('deviceSyncChoiceConnect').addEventListener('click', reconnectFromDialog);
    element('deviceSyncChoiceDialog').addEventListener('close', function () { dialogStatus(''); });

    window.addEventListener(DEFAULT_EVENT, function (event) { renderState(event.detail); });
    refreshFromApi();
    clearInterval(fallbackTimer);
    fallbackTimer = setInterval(refreshFromApi, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
