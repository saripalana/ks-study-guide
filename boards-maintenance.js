(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  const Panels = window.BoardsPanelTemplates;
  const Registry = window.BoardsDashboardRegistry;
  if (!Config || !Store || !C || !Panels || !Registry) throw new Error('Maintenance dependencies are unavailable.');

  const KEYS = Config.storage.keys;
  let selecting = false;
  const selected = new Set();

  function formatDate(value) {
    return new Date(value).toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function backupList() {
    const value = Store.read(KEYS.localBackups, []);
    return Array.isArray(value) ? value : [];
  }

  function saveBackups(backups) {
    let retained = backups.slice(0, Config.limits.localBackups);
    while (retained.length) {
      try {
        Store.write(KEYS.localBackups, retained, { reason: 'Local recovery backups updated' });
        return true;
      } catch (error) {
        retained.pop();
      }
    }
    return false;
  }

  function backupNow(reason, metadata) {
    const backup = {
      id: 'backup-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      reason: reason || 'Manual backup',
      metadata: metadata || {},
      state: Store.captureSnapshot(reason || 'Manual backup', false, 'local-recovery')
    };
    const list = backupList();
    list.unshift(backup);
    const saved = saveBackups(list);
    renderBackups();
    if (saved) Store.milestone(reason || 'Manual backup', metadata || {});
    return saved ? backup.id : null;
  }

  function backupState(backup) {
    if (backup.state) return backup.state;
    if (backup.snapshot) return { snapshot: backup.snapshot, reason: backup.reason, createdAt: backup.createdAt };
    return backup;
  }

  function restoreBackup(id) {
    const backup = backupList().find(function (item) { return item.id === id; });
    if (!backup || !confirm('Restore this backup? A backup of the current state will be created first.')) return;
    const rescueId = backupNow('Before restoring an older backup', { type: 'pre-restore', restoring: id });
    if (!rescueId) {
      alert('Restore canceled because the current state could not be backed up.');
      return;
    }
    const preserved = backupList();
    Store.applySnapshot(backupState(backup), { preserveKeys: [KEYS.localBackups] });
    Store.write(KEYS.localBackups, preserved, { reason: 'Recovery history preserved after restore' });
    Store.milestone('Local recovery backup restored', { backupId: id });
    window.location.reload();
  }

  function downloadBackup(id) {
    const backup = backupList().find(function (item) { return item.id === id; });
    if (!backup) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'psychiatry-board-backup-' + new Date(backup.createdAt).toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function deleteBackup(id) {
    if (!confirm('Delete this recovery backup permanently?')) return;
    saveBackups(backupList().filter(function (item) { return item.id !== id; }));
    renderBackups();
  }

  function resetQuestions(ids, label) {
    const unique = Array.from(new Set(ids)).filter(function (id) { return C.byId.has(id); });
    if (!unique.length) return;
    const all = unique.length === C.fullBank.length;
    const message = all
      ? 'Reset progress for the entire question bank? Saved Previous tests will remain. A recovery backup will be created first.'
      : 'Reset progress for ' + unique.length + ' selected question' + (unique.length === 1 ? '' : 's') + '? Saved Previous tests will remain. A recovery backup will be created first.';
    if (!confirm(message)) return;

    const backupId = backupNow('Before ' + label, { type: 'question-reset', count: unique.length, ids: unique });
    if (!backupId) {
      alert('Reset canceled because a recovery backup could not be saved.');
      return;
    }

    const resetSet = new Set(unique);
    const app = C.appState();
    unique.forEach(function (id) {
      delete app.answered[id];
      delete app.testAnswers[id];
      delete app.flagged[id];
      delete app.missed[id];
    });
    app.testSubmitted = {};
    app.atSummary = false;
    app.index = 0;
    app.view = 'study';
    Store.write(KEYS.app, app, { reason: 'Question progress reset' });

    const history = C.historyState();
    unique.forEach(function (id) { delete history[id]; });
    Store.write(KEYS.history, history, { reason: 'Question status history reset' });

    const config = C.activeConfig();
    if (config && config.ids.some(function (id) { return resetSet.has(id); })) {
      if (all || config.status === 'completed') {
        Store.remove(KEYS.config, { reason: 'Active set removed after progress reset' });
      } else {
        config.questionTimes = config.questionTimes || {};
        unique.forEach(function (id) { delete config.questionTimes[id]; });
        config.status = 'in_progress';
        delete config.completedAt;
        Store.write(KEYS.config, config, { reason: 'Active set updated after progress reset' });
      }
    }

    selected.clear();
    selecting = false;
    Store.milestone(all ? 'Entire question bank reset' : 'Selected questions reset', { count: unique.length });
    refreshAll();
  }

  function questionIdForTile(tile) {
    const explicit = tile.getAttribute('data-question-id');
    if (explicit && C.byId.has(explicit)) return explicit;
    const index = Number(tile.textContent.trim()) - 1;
    const question = C.fullBank[index];
    return question ? question.id : null;
  }

  function updateSelectionSummary() {
    const summary = document.getElementById('resetSelectionSummary');
    const toggle = document.getElementById('toggleResetSelection');
    const reset = document.getElementById('resetSelectedQuestions');
    const clear = document.getElementById('clearResetSelection');
    if (summary) {
      summary.textContent = selecting
        ? selected.size + ' question' + (selected.size === 1 ? '' : 's') + ' selected. Click question tiles above to add or remove them.'
        : 'Turn on selection mode, then click question numbers in All question statuses.';
    }
    if (toggle) toggle.textContent = selecting ? 'Stop selecting' : 'Select questions';
    if (reset) reset.disabled = !selected.size;
    if (clear) clear.disabled = !selected.size;
  }

  function syncTiles() {
    const grid = document.getElementById('bankGrid');
    if (!grid) return;
    grid.classList.toggle('reset-selection-mode', selecting);
    grid.querySelectorAll('.bank-tile').forEach(function (tile) {
      const id = questionIdForTile(tile);
      if (id) tile.setAttribute('data-question-id', id);
      const isSelected = !!id && selected.has(id);
      tile.classList.toggle('reset-selected', isSelected);
      if (selecting) tile.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      else tile.removeAttribute('aria-pressed');
    });
    updateSelectionSummary();
  }

  function renderBackups() {
    const container = document.getElementById('backupHistory');
    if (!container) return;
    container.innerHTML = Panels.recoveryBackupRows(backupList(), formatDate);
  }

  function mountUi() {
    const existing = document.getElementById('progressManagementSection');
    if (existing) return existing;
    const section = Panels.createProgressManagementSection();

    section.querySelector('#toggleResetSelection').addEventListener('click', function () {
      selecting = !selecting;
      syncTiles();
    });
    section.querySelector('#clearResetSelection').addEventListener('click', function () {
      selected.clear();
      syncTiles();
    });
    section.querySelector('#resetSelectedQuestions').addEventListener('click', function () {
      resetQuestions(Array.from(selected), 'resetting selected questions');
    });
    section.querySelector('#resetEntireBank').addEventListener('click', function () {
      resetQuestions(C.fullBank.map(function (question) { return question.id; }), 'resetting the entire question bank');
    });
    section.querySelector('#createManualBackup').addEventListener('click', function () {
      alert(backupNow('Manual backup', { type: 'manual' }) ? 'Backup created.' : 'Backup could not be saved.');
    });
    section.querySelector('#backupHistory').innerHTML = Panels.recoveryBackupRows(backupList(), formatDate);
    setTimeout(syncTiles, 0);
    return section;
  }

  function ensureUi() {
    if (document.getElementById('progressManagementSection')) return;
    Registry.register({ id: 'progress-management', region: 'data-tools', order: 100, mount: mountUi });
  }

  function refreshAll() {
    if (window.BoardsDashboard && window.BoardsDashboard.render) window.BoardsDashboard.render();
    ensureUi();
    renderBackups();
    setTimeout(syncTiles, 0);
  }

  function handleClick(event) {
    const restore = event.target.closest('.restore-backup');
    if (restore) { event.preventDefault(); restoreBackup(restore.getAttribute('data-id')); return; }
    const download = event.target.closest('.download-backup');
    if (download) { event.preventDefault(); downloadBackup(download.getAttribute('data-id')); return; }
    const remove = event.target.closest('.delete-backup');
    if (remove) { event.preventDefault(); deleteBackup(remove.getAttribute('data-id')); return; }

    const grid = document.getElementById('bankGrid');
    const tile = event.target.closest('.bank-tile');
    if (selecting && tile && grid && grid.contains(tile)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = questionIdForTile(tile);
      if (id) {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        syncTiles();
      }
    }
  }

  function init() {
    ensureUi();
    document.addEventListener('click', handleClick, true);
    const grid = document.getElementById('bankGrid');
    if (grid) {
      new MutationObserver(function () { setTimeout(syncTiles, 0); }).observe(grid, { childList: true, subtree: true });
    }
    Store.subscribe(function (change) {
      if (change.key === KEYS.localBackups) renderBackups();
      if (change.key === KEYS.app || change.key === KEYS.history || change.key === KEYS.config) setTimeout(syncTiles, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BoardsMaintenance = Object.freeze({
    backupNow: backupNow,
    restoreBackup: restoreBackup,
    resetQuestions: resetQuestions,
    resetEntireBank: function () {
      resetQuestions(C.fullBank.map(function (question) { return question.id; }), 'resetting the entire question bank');
    },
    render: refreshAll
  });
})();
