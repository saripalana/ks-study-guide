(function () {
  'use strict';

  let mirrorTimer = null;
  let observer = null;

  function element(id) {
    return document.getElementById(id);
  }

  function toneFromStatus(status) {
    if (!status) return 'neutral';
    if (status.classList.contains('good')) return 'good';
    if (status.classList.contains('warning')) return 'warning';
    if (status.classList.contains('error')) return 'error';
    return 'neutral';
  }

  function connectedFromDetails(connectButton) {
    return !!connectButton && /connected/i.test(connectButton.textContent || '');
  }

  function mirrorDetailedControls() {
    const topConnect = element('deviceSyncConnect');
    const topBackup = element('deviceSyncBackup');
    const topRestore = element('deviceSyncRestore');
    const topStatus = element('deviceSyncStatus');
    const topMessage = element('deviceSyncMessage');
    const topLastSync = element('deviceSyncLastSync');
    if (!topConnect || !topBackup || !topRestore || !topStatus || !topMessage) return;

    const detailConnect = element('connectGoogleDrive');
    const detailBackup = element('driveBackupNow');
    const detailRestore = element('driveRestoreLatest');
    const detailStatus = element('driveBackupStatus');
    const detailLastSync = element('driveLastSync');
    const apiReady = !!window.BoardsDriveBackup;

    if (!apiReady || !detailConnect || !detailBackup || !detailRestore || !detailStatus) {
      topConnect.disabled = true;
      topBackup.disabled = true;
      topRestore.disabled = true;
      topStatus.textContent = 'Sync controls loading';
      topStatus.className = 'device-sync-status neutral';
      topMessage.innerHTML = '<strong>Please wait:</strong> the secure Google Drive controls are still loading.';
      return;
    }

    const connected = connectedFromDetails(detailConnect);
    const tone = toneFromStatus(detailStatus);
    topConnect.disabled = detailConnect.disabled;
    topConnect.textContent = connected ? 'Google Drive connected' : 'Connect Google Drive';
    topBackup.disabled = detailBackup.disabled;
    topRestore.disabled = detailRestore.disabled;

    if (tone === 'good') topStatus.textContent = 'Connected and current';
    else if (tone === 'warning') topStatus.textContent = 'Choose backup or restore';
    else if (tone === 'error') topStatus.textContent = 'Sync needs attention';
    else topStatus.textContent = connected ? 'Connected' : 'Not connected';
    topStatus.className = 'device-sync-status ' + tone;

    topMessage.innerHTML = '<strong>Current status:</strong> ' + detailStatus.textContent;
    if (topLastSync) topLastSync.textContent = detailLastSync ? detailLastSync.textContent : 'Last successful sync: Never';
  }

  function callDrive(method) {
    const api = window.BoardsDriveBackup;
    if (!api || typeof api[method] !== 'function') {
      mirrorDetailedControls();
      return;
    }
    try {
      const result = api[method]();
      if (result && typeof result.catch === 'function') {
        result.catch(function (error) {
          console.error(error);
          mirrorDetailedControls();
        });
      }
    } finally {
      setTimeout(mirrorDetailedControls, 0);
      setTimeout(mirrorDetailedControls, 500);
    }
  }

  function showDetailedControls() {
    const section = element('driveBackupSection');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const firstControl = element('connectGoogleDrive');
    if (firstControl) setTimeout(function () { firstControl.focus({ preventScroll: true }); }, 450);
  }

  function startMirroring() {
    const detailSection = element('driveBackupSection');
    if (observer) observer.disconnect();
    if (detailSection) {
      observer = new MutationObserver(mirrorDetailedControls);
      observer.observe(detailSection, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
    }
    clearInterval(mirrorTimer);
    mirrorTimer = setInterval(mirrorDetailedControls, 1000);
    mirrorDetailedControls();
  }

  function init() {
    const card = element('deviceSyncCard');
    if (!card) return;
    element('deviceSyncConnect').addEventListener('click', function () { callDrive('connect'); });
    element('deviceSyncBackup').addEventListener('click', function () { callDrive('backupNow'); });
    element('deviceSyncRestore').addEventListener('click', function () { callDrive('restoreLatest'); });
    element('deviceSyncDetails').addEventListener('click', showDetailedControls);

    let attempts = 0;
    const waitForDrivePanel = setInterval(function () {
      attempts += 1;
      if (window.BoardsDriveBackup && element('driveBackupSection')) {
        clearInterval(waitForDrivePanel);
        startMirroring();
      } else if (attempts >= 50) {
        clearInterval(waitForDrivePanel);
        mirrorDetailedControls();
      }
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
