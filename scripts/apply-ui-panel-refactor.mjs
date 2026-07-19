import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) throw new Error(`Required migration pattern not found: ${label}`);
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
}

function migrateDriveBackup() {
  const file = 'boards-drive-backup.js';
  let content = read(file);
  if (content.includes('const Panels = window.BoardsPanelTemplates;')) return;

  content = replaceRequired(
    content,
    /  const C = window\.BoardsCore;\n  if \(!Config \|\| !Store \|\| !C\) throw new Error\('Drive backup dependencies are unavailable\.'\);/,
    "  const C = window.BoardsCore;\n  const Panels = window.BoardsPanelTemplates;\n  const Registry = window.BoardsDashboardRegistry;\n  if (!Config || !Store || !C || !Panels || !Registry) throw new Error('Drive backup dependencies are unavailable.');",
    'Drive dependencies'
  );
  content = replaceRequired(content, /\n  function escapeHtml\(value\) \{[\s\S]*?\n  \}\n/, '\n', 'Drive escapeHtml');
  content = replaceRequired(
    content,
    /  function ensureUi\(\) \{[\s\S]*?\n  \}\n\n  function tokenValid/,
    `  function mountUi() {
    const existing = document.getElementById('driveBackupSection');
    if (existing) return existing;
    const section = Panels.createDriveBackupSection();
    section.querySelector('#connectGoogleDrive').addEventListener('click', connectDrive);
    section.querySelector('#driveBackupNow').addEventListener('click', function () { manualBackup().catch(handleError); });
    section.querySelector('#driveRestoreLatest').addEventListener('click', function () { restoreLatest().catch(handleError); });
    section.querySelector('#disconnectGoogleDrive').addEventListener('click', function () { disconnectSession('Disconnected from Google Drive for this browser session.'); });
    section.querySelector('#revokeGoogleDrive').addEventListener('click', revokeAccess);
    section.querySelector('#driveAutoBackup').addEventListener('change', function (event) { saveSettings({ autoBackup: !!event.target.checked }); if (event.target.checked) scheduleAutoBackup(500); });
    setTimeout(updateUi, 0);
    return section;
  }

  function ensureUi() {
    if (document.getElementById('driveBackupSection')) return;
    Registry.register({ id: 'private-drive-backup', region: 'data-tools', order: 200, mount: mountUi });
  }

  function tokenValid`,
    'Drive UI block'
  );
  content = replaceRequired(
    content,
    /    if \(!connected\) \{ container\.innerHTML = '<div class="analytics-empty">Connect Google Drive to load cloud history\.<\/div>'; return; \}\n    const list = remoteHistory\.snapshots \|\| \[\];\n    if \(!list\.length\) \{ container\.innerHTML = '<div class="analytics-empty">No historical Drive snapshots yet\.<\/div>'; return; \}\n    container\.innerHTML = list\.slice\(0, 10\)\.map\(function \(record\) \{[\s\S]*?    \}\)\.join\(''\);/,
    `    if (!connected) { container.innerHTML = Panels.emptyState('Connect Google Drive to load cloud history.'); return; }
    const list = remoteHistory.snapshots || [];
    container.innerHTML = Panels.cloudHistoryRows(list, formatDate, summary);`,
    'Drive history rendering'
  );
  write(file, content);
}

function migrateQuestionVault() {
  const file = 'boards-question-vault.js';
  let content = read(file);
  if (content.includes('const Panels = window.BoardsPanelTemplates;')) return;

  content = replaceRequired(
    content,
    /  const DriveFactory = window\.BoardsVisibleDriveClient;\n  if \(!Config \|\| !Store \|\| !Model \|\| !DriveFactory \|\| !Config\.questionVault\) \{/,
    "  const DriveFactory = window.BoardsVisibleDriveClient;\n  const Panels = window.BoardsPanelTemplates;\n  const Registry = window.BoardsDashboardRegistry;\n  if (!Config || !Store || !Model || !DriveFactory || !Panels || !Registry || !Config.questionVault) {",
    'Vault dependencies'
  );
  content = replaceRequired(content, /\n  function escapeHtml\(value\) \{[\s\S]*?\n  \}\n/, '\n', 'Vault escapeHtml');
  content = replaceRequired(
    content,
    /  function ensureUi\(\) \{[\s\S]*?\n  \}\n\n  async function writeManifest/,
    `  function mountUi() {
    const existing = document.getElementById('questionVaultSection');
    if (existing) return existing;
    const section = Panels.createQuestionVaultSection(Vault.stagingBranch);
    section.querySelector('#connectQuestionVault').addEventListener('click', function () {
      try { drive.connect(); }
      catch (error) { handleError(error); }
    });
    section.querySelector('#syncQuestionBankVault').addEventListener('click', function () { syncProduction(false).catch(handleError); });
    section.querySelector('#syncQuestionPerformance').addEventListener('click', function () { syncPerformance(true).catch(handleError); });
    section.querySelector('#refreshCorrelatedExport').addEventListener('click', function () { refreshCorrelated().catch(handleError); });
    section.querySelector('#createQuestionDraft').addEventListener('click', function () { createDraft().catch(handleError); });
    section.querySelector('#validateQuestionDraft').addEventListener('click', function () { validateDraft().catch(handleError); });
    section.querySelector('#disconnectQuestionVault').addEventListener('click', function () {
      drive.disconnect();
      setStatus('Disconnected from the Question Vault for this browser session.', 'neutral');
    });
    section.querySelector('#revokeQuestionVault').addEventListener('click', function () {
      drive.revoke(function () { setStatus('Question Vault access was revoked at Google.', 'good'); });
    });
    setTimeout(updateUi, 0);
    return section;
  }

  function ensureUi() {
    if (document.getElementById('questionVaultSection')) return;
    Registry.register({ id: 'question-vault', region: 'data-tools', order: 300, mount: mountUi });
  }

  async function writeManifest`,
    'Vault UI block'
  );
  write(file, content);
}

function migrateHardReset() {
  const file = 'boards-hard-reset.js';
  let content = read(file);
  if (content.includes('const Panels = window.BoardsPanelTemplates;')) return;

  content = replaceRequired(
    content,
    /  const Model = window\.BoardsQuestionBankModel;\n  if \(!Config \|\| !Store \|\| !Model \|\| !Config\.hardReset \|\| !Config\.questionVault\) return;/,
    "  const Model = window.BoardsQuestionBankModel;\n  const Panels = window.BoardsPanelTemplates;\n  const Registry = window.BoardsDashboardRegistry;\n  if (!Config || !Store || !Model || !Panels || !Registry || !Config.hardReset || !Config.questionVault) return;",
    'Hard reset dependencies'
  );
  content = replaceRequired(content, /\n  function escapeHtml\(value\) \{[\s\S]*?\n  \}\n/, '\n', 'Hard reset escapeHtml');
  content = replaceRequired(content, /\n  function addStyles\(\) \{[\s\S]*?\n  \}\n/, '\n', 'Hard reset styles');
  content = replaceRequired(
    content,
    /  function ensureUi\(\) \{[\s\S]*?\n  \}\n\n  function modalStatus/,
    `  function mountUi() {
    const existing = document.getElementById('hardResetCard');
    if (existing) return existing;
    const card = Panels.createHardResetCard();
    const modal = Panels.createHardResetModal(Reset.confirmationPhrase);
    document.body.appendChild(modal);

    card.querySelector('#openHardReset').addEventListener('click', openModal);
    modal.querySelector('#cancelHardReset').addEventListener('click', closeModal);
    modal.querySelector('#confirmHardReset').addEventListener('click', beginReset);
    modal.addEventListener('click', function (event) { if (event.target === modal && !running) closeModal(); });
    return card;
  }

  function ensureUi() {
    if (document.getElementById('hardResetCard')) return;
    Registry.register({ id: 'absolute-reset', region: 'data-tools', order: 150, mount: mountUi });
  }

  function modalStatus`,
    'Hard reset UI block'
  );
  write(file, content);
}

function migrateValidator() {
  const file = 'scripts/validate.mjs';
  let content = read(file);
  if (!content.includes("'ui/panel-templates.js'")) {
    content = replaceRequired(
      content,
      /'ui\/dashboard-registry\.js', 'boards-dashboard\.js'/,
      "'ui/dashboard-registry.js', 'ui/panel-templates.js', 'boards-dashboard.js'",
      'Validator script order'
    );
  }
  if (!content.includes('The dashboard data-tools region is missing.')) {
    content = replaceRequired(
      content,
      /if \(!html\.includes\('strict-origin-when-cross-origin'\)\) fail\('The strict referrer policy is missing from boards\.html\.'\);/,
      "if (!html.includes('strict-origin-when-cross-origin')) fail('The strict referrer policy is missing from boards.html.');\nif (!html.includes('data-dashboard-region=\"data-tools\"')) fail('The dashboard data-tools region is missing.');\nif (!html.includes('./styles/feature-panels.css')) fail('The feature-panel stylesheet is missing from boards.html.');",
      'Validator HTML checks'
    );
  }
  if (!content.includes('Shared panel template is missing:')) {
    content = replaceRequired(
      content,
      /const modelCode = read\('boards-question-bank-model\.js'\);/,
      `const panelTemplateCode = read('ui/panel-templates.js');
for (const factory of [
  'createProgressManagementSection', 'createDriveBackupSection', 'createQuestionVaultSection',
  'createHardResetCard', 'createHardResetModal'
]) {
  if (!panelTemplateCode.includes(factory)) fail(\`Shared panel template is missing: \${factory}\`);
}
for (const operationalModule of [
  'boards-maintenance.js', 'boards-drive-backup.js', 'boards-question-vault.js', 'boards-hard-reset.js'
]) {
  const moduleCode = read(operationalModule);
  if (moduleCode.includes("createElement('style')") || moduleCode.includes('style.textContent')) {
    fail(\`\${operationalModule} must not inject presentation CSS.\`);
  }
  if (!moduleCode.includes('BoardsPanelTemplates') || !moduleCode.includes('BoardsDashboardRegistry')) {
    fail(\`\${operationalModule} must use shared panel templates and dashboard regions.\`);
  }
}

const modelCode = read('boards-question-bank-model.js');`,
      'Validator panel checks'
    );
  }
  write(file, content);
}

migrateDriveBackup();
migrateQuestionVault();
migrateHardReset();
migrateValidator();
console.log('One-time UI panel refactor applied successfully.');
