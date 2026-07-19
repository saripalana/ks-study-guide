(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function fromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html).trim();
    return template.content.firstElementChild;
  }

  function emptyState(message) {
    return '<div class="analytics-empty">' + escapeHtml(message) + '</div>';
  }

  function createProgressManagementSection() {
    return fromHtml(
      '<section id="progressManagementSection" class="progress-management-section">' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">PROGRESS MANAGEMENT</div><h3>Reset questions safely</h3>' +
          '<p class="field-help">Every reset creates a recoverable backup. Saved Previous tests remain unless deleted separately.</p></div></div>' +
          '<div class="reset-action-row" role="group" aria-label="Question reset controls">' +
            '<button type="button" id="toggleResetSelection" class="secondary-button">Select questions</button>' +
            '<button type="button" id="clearResetSelection" class="secondary-button" disabled>Clear selection</button>' +
            '<button type="button" id="resetSelectedQuestions" class="danger-button" disabled>Reset selected</button>' +
            '<button type="button" id="resetEntireBank" class="danger-button">Reset entire bank</button>' +
          '</div>' +
          '<div id="resetSelectionSummary" class="reset-selection-summary" aria-live="polite"></div>' +
        '</article>' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">RECOVERY</div><h3>Reset backups</h3>' +
          '<p class="field-help">Restore a prior state or download a backup file.</p></div>' +
          '<button type="button" id="createManualBackup" class="secondary-button">Create backup</button></div>' +
          '<div id="backupHistory"></div>' +
        '</article>' +
      '</section>'
    );
  }

  function recoveryBackupRows(backups, formatDate) {
    if (!Array.isArray(backups) || !backups.length) {
      return emptyState('No reset backups yet. One will be created automatically before the first reset.');
    }
    return backups.map(function (backup) {
      const count = backup.metadata && backup.metadata.count ? ' · ' + Number(backup.metadata.count) + ' questions' : '';
      return '<div class="backup-row"><div><strong>' + escapeHtml(backup.reason) + '</strong><span>' +
        escapeHtml(formatDate(backup.createdAt)) + escapeHtml(count) +
        '</span></div><div class="backup-actions">' +
        '<button type="button" class="secondary-button restore-backup" data-id="' + escapeHtml(backup.id) + '">Restore</button>' +
        '<button type="button" class="secondary-button download-backup" data-id="' + escapeHtml(backup.id) + '">Download</button>' +
        '<button type="button" class="secondary-button delete-backup" data-id="' + escapeHtml(backup.id) + '">Delete</button>' +
        '</div></div>';
    }).join('');
  }

  function createDriveBackupSection() {
    return fromHtml(
      '<section id="driveBackupSection" class="progress-management-section">' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">GOOGLE DRIVE</div><h3>Private cloud backup</h3>' +
          '<p class="field-help">Stores only compact study progress in the hidden Google Drive app-data area. It cannot browse your normal Drive files.</p></div></div>' +
          '<div class="drive-backup-actions" role="group" aria-label="Private Drive backup controls">' +
            '<button type="button" id="connectGoogleDrive" class="primary-button">Connect Google Drive</button>' +
            '<button type="button" id="driveBackupNow" class="secondary-button" disabled>Back up now</button>' +
            '<button type="button" id="driveRestoreLatest" class="secondary-button" disabled>Restore latest Drive backup</button>' +
            '<button type="button" id="disconnectGoogleDrive" class="secondary-button" disabled>Disconnect session</button>' +
            '<button type="button" id="revokeGoogleDrive" class="secondary-button" disabled>Revoke Google access</button>' +
          '</div>' +
          '<label class="drive-auto-row"><input type="checkbox" id="driveAutoBackup" checked> Automatically update the current backup at most once every 30 seconds while connected</label>' +
          '<div id="driveBackupStatus" class="drive-backup-status neutral" aria-live="polite">Not connected. Access tokens remain only in temporary page memory.</div>' +
          '<div class="drive-backup-grid">' +
            '<div class="drive-backup-detail"><strong id="driveLastSync">Last successful sync: Never</strong><span>The current-state file is overwritten efficiently rather than duplicated after each answer.</span></div>' +
            '<div class="drive-backup-detail"><strong>Drive contents</strong><span id="driveCloudSummary">Connect to inspect your hidden Drive backup.</span></div>' +
          '</div>' +
        '</article>' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">CLOUD RECOVERY</div><h3>Historical Drive snapshots</h3>' +
          '<p class="field-help">A rolling history is added after completed tests, resets, deletions, restores, and manual backups—not after every answer.</p></div></div>' +
          '<div id="driveCloudHistory">' + emptyState('Connect Google Drive to load cloud history.') + '</div>' +
        '</article>' +
      '</section>'
    );
  }

  function cloudHistoryRows(records, formatDate, summarize) {
    if (!Array.isArray(records) || !records.length) return emptyState('No historical Drive snapshots yet.');
    return records.slice(0, 10).map(function (record) {
      const info = summarize(record.state);
      return '<div class="cloud-history-row"><div><strong>' + escapeHtml(record.reason || 'Cloud snapshot') + '</strong><span>' +
        escapeHtml(formatDate(record.createdAt)) + ' · ' + Number(info.questions || 0) + ' questions · ' + Number(info.tests || 0) +
        ' saved tests</span></div><button type="button" class="secondary-button restore-cloud-history" data-id="' +
        escapeHtml(record.id) + '">Restore</button></div>';
    }).join('');
  }

  function createQuestionVaultSection(stagingBranch) {
    return fromHtml(
      '<section id="questionVaultSection" class="progress-management-section">' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">QUESTION DATA VAULT</div><h3>Visible Google Drive question archive</h3>' +
          '<p class="field-help">Stores the complete question bank and correlated performance in a dedicated folder created by this app. It cannot browse unrelated Drive files.</p></div></div>' +
          '<div class="question-vault-actions" role="group" aria-label="Question Vault controls">' +
            '<button type="button" id="connectQuestionVault" class="primary-button">Connect Question Vault</button>' +
            '<button type="button" id="syncQuestionBankVault" class="secondary-button" disabled>Sync production mirror</button>' +
            '<button type="button" id="syncQuestionPerformance" class="secondary-button" disabled>Sync performance</button>' +
            '<button type="button" id="refreshCorrelatedExport" class="secondary-button" disabled>Refresh AI-ready export</button>' +
            '<a id="openQuestionVault" class="secondary-button" target="_blank" rel="noopener" hidden>Open vault in Drive</a>' +
            '<button type="button" id="disconnectQuestionVault" class="secondary-button" disabled>Disconnect vault session</button>' +
            '<button type="button" id="revokeQuestionVault" class="secondary-button" disabled>Revoke vault access</button>' +
          '</div>' +
          '<div id="questionVaultStatus" class="drive-backup-status neutral" aria-live="polite">Not connected. This optional vault uses only the limited drive.file permission.</div>' +
          '<div id="questionVaultSummary" class="question-vault-summary">Not initialized yet.</div>' +
          '<div class="question-vault-note"><strong>Safety boundary:</strong> the live site still uses the reviewed question bank in GitHub main. Drive Production is a mirror; Drive Drafts never publish automatically. Proposed question changes belong in the separate <code>' +
          escapeHtml(stagingBranch) + '</code> branch and require validation before merging.</div>' +
        '</article>' +
        '<article class="dashboard-card">' +
          '<div class="card-heading-row"><div><div class="card-kicker">DRAFT WORKSPACE</div><h3>Safe question editing environment</h3>' +
          '<p class="field-help">Create a draft copy for proposed question, answer, or explanation changes. Existing drafts are archived before replacement.</p></div></div>' +
          '<div class="question-vault-actions" role="group" aria-label="Question draft controls">' +
            '<button type="button" id="createQuestionDraft" class="secondary-button" disabled>Create or refresh draft</button>' +
            '<button type="button" id="validateQuestionDraft" class="secondary-button" disabled>Validate Drive draft</button>' +
          '</div>' +
          '<div id="questionDraftStatus" class="drive-backup-status neutral" aria-live="polite">No draft has been inspected during this session.</div>' +
        '</article>' +
      '</section>'
    );
  }

  function createHardResetCard() {
    return fromHtml(
      '<article id="hardResetCard" class="dashboard-card hard-reset-card">' +
        '<div class="card-heading-row"><div><div class="card-kicker">FRESH START</div><h3>Absolute reset of active study data</h3>' +
        '<p class="field-help">Clears answers, flags, tests, timing, analytics, active sets, local recovery records, and the active cloud performance state. The original question bank and archived recovery history remain protected.</p></div></div>' +
        '<button type="button" id="openHardReset" class="danger-button">Open absolute reset</button>' +
        '<div class="hard-reset-warning"><strong>High-impact action:</strong> a recovery file and cloud archives are created first. The configured code is only an accidental-click safeguard because this public website’s JavaScript can be inspected.</div>' +
        '<div id="hardResetStatus" class="drive-backup-status neutral" aria-live="polite">No absolute reset is pending.</div>' +
      '</article>'
    );
  }

  function createHardResetModal(confirmationPhrase) {
    return fromHtml(
      '<div id="hardResetModal" class="hard-reset-modal" hidden>' +
        '<div class="hard-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="hardResetTitle">' +
          '<h2 id="hardResetTitle">Start completely fresh?</h2>' +
          '<p>This resets active personal study data in this browser, the hidden Drive backup, and the visible Question Vault performance files. Historical cloud archives and the original GitHub question source are retained for recovery.</p>' +
          '<label class="hard-reset-field">Reset code<input id="hardResetCode" type="password" autocomplete="off" spellcheck="false"></label>' +
          '<div class="hard-reset-code-note">This is a confirmation code, not a secure account password.</div>' +
          '<label class="hard-reset-field">Type <strong>' + escapeHtml(confirmationPhrase) + '</strong><input id="hardResetPhrase" type="text" autocomplete="off" spellcheck="false"></label>' +
          '<label class="hard-reset-check"><input id="hardResetUnderstand" type="checkbox"><span>I understand that all active progress and test records will restart at zero, and that I may need to reconnect Google Drive after the reset.</span></label>' +
          '<div id="hardResetModalStatus" class="drive-backup-status neutral" aria-live="polite">The reset has not started.</div>' +
          '<div class="hard-reset-actions"><button type="button" id="cancelHardReset" class="secondary-button">Cancel</button><button type="button" id="confirmHardReset" class="danger-button">Archive and reset everything</button></div>' +
        '</div>' +
      '</div>'
    );
  }

  window.BoardsPanelTemplates = Object.freeze({
    emptyState: emptyState,
    createProgressManagementSection: createProgressManagementSection,
    recoveryBackupRows: recoveryBackupRows,
    createDriveBackupSection: createDriveBackupSection,
    cloudHistoryRows: cloudHistoryRows,
    createQuestionVaultSection: createQuestionVaultSection,
    createHardResetCard: createHardResetCard,
    createHardResetModal: createHardResetModal
  });
})();
