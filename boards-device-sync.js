(function () {
  'use strict';

  const DEFAULT_EVENT = 'ksboards:drive-sync-state';
  let fallbackTimer = null;
  let latestState = { connected: false, syncing: false, relation: 'disconnected', local: null, drive: null };

  function element(id) { return document.getElementById(id); }

  function ensureStylesheet() {
    const href = './styles/device-sync.css?v=4';
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
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
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
    if (!state || !state.connected) return {
      status: 'Not connected', tone: 'neutral',
      title: 'Connect to check your saved progress',
      message: 'The same button will connect Google Drive, compare both copies, and safely use the clearly newer one.',
      primary: 'Connect and sync'
    };
    if (state.syncing || relation === 'checking') return {
      status: 'Syncing', tone: 'neutral', title: 'Comparing this device with Google Drive…',
      message: 'Please keep this page open while the saved copies are checked.', primary: 'Syncing…'
    };
    if (relation === 'in-sync') return {
      status: 'In sync', tone: 'good', title: 'Your progress is up to date',
      message: 'This browser and Google Drive match. The button will safely check again.', primary: 'Check sync'
    };
    if (relation === 'local-newer') return {
      status: 'This device is newer', tone: 'warning', title: 'Your newest progress is on this device',
      message: 'Sync will update Google Drive after preserving its prior copy.', primary: 'Sync newest progress'
    };
    if (relation === 'drive-newer') return {
      status: 'Drive is newer', tone: 'warning', title: 'Your newest progress is in Google Drive',
      message: 'Sync will update this browser after preserving its current copy.', primary: 'Sync newest progress'
    };
    if (relation === 'no-drive-backup') return {
      status: 'No Drive copy yet', tone: 'warning', title: 'Create your first secure Drive copy',
      message: 'Your current browser progress will be saved without changing it.', primary: 'Create Drive copy'
    };
    return {
      status: 'Your choice is needed', tone: 'warning', title: 'The newest copy is not clear',
      message: 'Press sync and the app will show both copies so you can choose safely.', primary: 'Review and sync'
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
      else if (!safeState.drive) driveTime.textContent = 'No Drive copy found';
      else driveTime.textContent = formatDate(safeState.drive.updatedAt);
    }
    if (driveSummary) {
      if (!safeState.connected) driveSummary.textContent = 'Connect Google Drive before selecting this source.';
      else if (!safeState.drive) driveSummary.textContent = 'No current Drive study copy is available.';
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
    if (!status || !message || !syncNow) return;

    const decision = decisionFor(latestState);
    setTone(status, decision.status, decision.tone);
    message.innerHTML = '<strong id="deviceSyncRecommendation">' + decision.title + '</strong><span>' + decision.message + '</span>';
    syncNow.disabled = !!latestState.syncing;
    syncNow.textContent = decision.primary;

    const lastSync = element('deviceSyncLastSync');
    if (lastSync) lastSync.textContent = latestState.lastSyncedAt
      ? 'Last completed sync: ' + formatDate(latestState.lastSyncedAt)
      : 'No completed sync recorded on this browser.';
    updateChoiceDialog(latestState);
  }

  function driveApi() { return window.BoardsDriveBackup; }

  function refreshFromApi() {
    const api = driveApi();
    if (!api || typeof api.getSyncState !== 'function') {
      renderState({ connected: false, syncing: false, relation: 'disconnected', local: null, drive: null });
      return;
    }
    try { renderState(api.getSyncState()); }
    catch (error) {
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
    if (reasonBox) reasonBox.textContent = reason || 'The automatic comparison could not safely choose a source. Select the copy containing your newest work.';
    dialogStatus('', tone);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute('open', '');
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
      openChoiceDialog('Device Sync is temporarily unavailable. Reload the page and try again.', 'error');
      return;
    }
    try {
      const result = await api.syncLatest();
      if (result && result.action === 'needs-choice') {
        refreshFromApi();
        openChoiceDialog('The saved copies differ, but timestamps do not identify a safe automatic winner. Choose the copy containing your newest work.');
      }
    } catch (error) {
      refreshFromApi();
      openChoiceDialog('Sync encountered an error: ' + (error && error.message ? error.message : 'Unknown synchronization error.'), 'error');
    } finally {
      setTimeout(refreshFromApi, 0);
      setTimeout(refreshFromApi, 500);
    }
  }

  async function chooseSource(source) {
    const api = driveApi();
    if (!api || typeof api.chooseSource !== 'function') {
      dialogStatus('Directional sync is unavailable. Reload the page and try again.', 'error');
      return;
    }
    dialogStatus(source === 'local' ? 'Saving this device as the newest copy…' : 'Retrieving the Google Drive copy…');
    try {
      const result = await api.chooseSource(source);
      if (result && (result.action === 'used-local' || result.action === 'used-drive')) {
        dialogStatus('Sync completed.', 'good');
        setTimeout(closeChoiceDialog, 500);
      } else if (result && result.action === 'unavailable') {
        dialogStatus('That source is not currently available. Connect again and retry.', 'error');
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
      dialogStatus('Google Drive connection is unavailable.', 'error');
      return;
    }
    dialogStatus('Opening Google authorization…');
    try { api.connect(); }
    catch (error) { dialogStatus(error && error.message ? error.message : 'Could not start Google authorization.', 'error'); }
  }

  async function init() {
    const card = element('deviceSyncCard');
    if (!card) return;
    ensureStylesheet();
    try {
      const view = await import('./ui/device-sync-view.js?v=3');
      view.mountDeviceSyncView(card);
    } catch (error) {
      console.error('Device Sync view could not load.', error);
      return;
    }

    element('deviceSyncNow').addEventListener('click', runAutomaticSync);
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