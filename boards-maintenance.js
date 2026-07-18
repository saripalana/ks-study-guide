(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  if (!Config || !Store || !C) throw new Error('Maintenance dependencies are unavailable.');

  const KEYS = Config.storage.keys;
  let selecting = false;
  const selected = new Set();

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

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
    const list = backupList();
    container.innerHTML = list.length ? list.map(function (backup) {
      const count = backup.metadata && backup.metadata.count ? ' · ' + backup.metadata.count + ' questions' : '';
      return '<div class="backup-row"><div><strong>' + escapeHtml(backup.reason) + '</strong><span>' + formatDate(backup.createdAt) + count + '</span></div><div class="backup-actions"><button type="button" class="secondary-button restore-backup" data-id="' + escapeHtml(backup.id) + '">Restore</button><button type="button" class="secondary-button download-backup" data-id="' + escapeHtml(backup.id) + '">Download</button><button type="button" class="secondary-button delete-backup" data-id="' + escapeHtml(backup.id) + '">Delete</button></div></div>';
    }).join('') : '<div class="analytics-empty">No reset backups yet. One will be created automatically before the first reset.</div>';
  }

  function addStyles() {
    if (document.getElementById('maintenanceCss')) return;
    const style = document.createElement('style');
    style.id = 'maintenanceCss';
    style.textContent =
      '.progress-management-section{display:flex;flex-direction:column;gap:18px}.reset-action-row{display:flex;flex-wrap:wrap;gap:9px}.reset-selection-summary{margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:#f7f9fb;color:var(--muted);font-size:12px}.bank-grid.reset-selection-mode{padding:7px;border:2px dashed #2768a5;border-radius:7px;background:#f4f8fc}.bank-grid.reset-selection-mode .bank-tile{cursor:pointer}.bank-tile.reset-selected{outline:3px solid #6d55a4;outline-offset:1px;background:#eee9fb!important;border-color:#6d55a4!important;color:#4b347d!important}.bank-tile.reset-selected:before{content:"✓";position:absolute;left:2px;top:0;font-size:9px;font-weight:900}.backup-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--border)}.backup-row:first-child{border-top:0}.backup-row>div:first-child span{display:block;margin-top:4px;color:var(--muted);font-size:11px}.backup-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.danger-button:disabled,.secondary-button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:700px){.backup-row{align-items:flex-start;flex-direction:column}.backup-actions{justify-content:flex-start}.reset-action-row>*{flex:1 1 150px}}';
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (document.getElementById('progressManagementSection')) return;
    const column = document.querySelector('.dashboard-column-wide');
    if (!column) return;
    addStyles();

    const section = document.createElement('section');
    section.id = 'progressManagementSection';
    section.className = 'progress-management-section';
    section.innerHTML =
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">PROGRESS MANAGEMENT</div><h3>Reset questions safely</h3><p class="field-help">Every reset creates a recoverable backup. Saved Previous tests remain unless deleted separately.</p></div></div><div class="reset-action-row"><button type="button" id="toggleResetSelection" class="secondary-button">Select questions</button><button type="button" id="clearResetSelection" class="secondary-button" disabled>Clear selection</button><button type="button" id="resetSelectedQuestions" class="danger-button" disabled>Reset selected</button><button type="button" id="resetEntireBank" class="danger-button">Reset entire bank</button></div><div id="resetSelectionSummary" class="reset-selection-summary"></div></article>' +
      '<article class="dashboard-card"><div class="card-heading-row"><div><div class="card-kicker">RECOVERY</div><h3>Reset backups</h3><p class="field-help">Restore a prior state or download a backup file.</p></div><button type="button" id="createManualBackup" class="secondary-button">Create backup</button></div><div id="backupHistory"></div></article>';

    const analytics = document.getElementById('analyticsSection');
    if (analytics && analytics.parentNode === column) analytics.insertAdjacentElement('afterend', section);
    else column.appendChild(section);

    document.getElementById('toggleResetSelection').addEventListener('click', function () {
      selecting = !selecting;
      syncTiles();
    });
    document.getElementById('clearResetSelection').addEventListener('click', function () {
      selected.clear();
      syncTiles();
    });
    document.getElementById('resetSelectedQuestions').addEventListener('click', function () {
      resetQuestions(Array.from(selected), 'resetting selected questions');
    });
    document.getElementById('resetEntireBank').addEventListener('click', function () {
      resetQuestions(C.fullBank.map(function (question) { return question.id; }), 'resetting the entire question bank');
    });
    document.getElementById('createManualBackup').addEventListener('click', function () {
      alert(backupNow('Manual backup', { type: 'manual' }) ? 'Backup created.' : 'Backup could not be saved.');
    });
    renderBackups();
    syncTiles();
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
