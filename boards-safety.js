(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  if (!Config || !Store) return;

  function enforceRecoveryRetention() {
    const container = document.getElementById('backupHistory');
    if (!container) return;
    const rows = container.querySelectorAll('.backup-row');
    rows.forEach(function (row) {
      const button = row.querySelector('.delete-backup');
      if (!button) return;
      const retain = rows.length === 1;
      button.disabled = retain;
      button.title = retain ? 'At least one local recovery backup is retained for safety.' : '';
    });
  }

  function attachBackupObserver() {
    const container = document.getElementById('backupHistory');
    if (!container || container.dataset.retentionObserver === 'true') return;
    container.dataset.retentionObserver = 'true';
    new MutationObserver(enforceRecoveryRetention).observe(container, { childList: true, subtree: true });
    enforceRecoveryRetention();
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('#discardSetBtn')) {
      setTimeout(function () {
        Store.milestone('Active practice set removed', { type: 'discard-active-set' });
      }, 0);
    }
  });

  function init() {
    attachBackupObserver();
    window.addEventListener(Config.events.storageChanged, function (event) {
      if (event.detail && event.detail.key === Config.storage.keys.localBackups) setTimeout(enforceRecoveryRetention, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BoardsSafety = Object.freeze({ enforceRecoveryRetention: enforceRecoveryRetention });
})();
