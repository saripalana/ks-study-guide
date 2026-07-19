(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const Panels = window.BoardsPanelTemplates;
  const Registry = window.BoardsDashboardRegistry;
  const Service = window.BoardsHardResetService;
  if (!Config || !Store || !Panels || !Registry || !Service || !Config.hardReset) throw new Error('Protected active-bank reset dependencies are unavailable.');

  const Reset = Config.hardReset;
  let running = false;

  function timestampName() { return new Date().toISOString().replace(/[:.]/g, '-'); }

  function setStatus(message, tone) {
    const element = document.getElementById('hardResetStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }

  function modalStatus(message, tone) {
    const element = document.getElementById('hardResetModalStatus');
    if (!element) return;
    element.textContent = message;
    element.className = 'drive-backup-status ' + (tone || 'neutral');
  }

  function downloadRecovery(snapshot) {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'psychiatry-board-' + Config.bank.id + '-before-absolute-reset-' + timestampName() + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  async function sha256(value) {
    if (!window.crypto || !window.crypto.subtle) throw new Error('This browser cannot verify the reset code securely enough.');
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
    return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  function openModal() {
    const modal = document.getElementById('hardResetModal');
    if (!modal) return;
    document.getElementById('hardResetCode').value = '';
    document.getElementById('hardResetPhrase').value = '';
    document.getElementById('hardResetUnderstand').checked = false;
    modalStatus('The ' + Config.bank.shortTitle + ' reset has not started.', 'neutral');
    modal.hidden = false;
    document.getElementById('hardResetCode').focus();
  }

  function closeModal() {
    if (running) return;
    const modal = document.getElementById('hardResetModal');
    if (modal) modal.hidden = true;
  }

  function decorate(card, modal) {
    const cardTitle = card.querySelector('h3');
    const cardCopy = card.querySelector('.field-help');
    const modalTitle = modal.querySelector('h2');
    const modalCopy = modal.querySelector('.hard-reset-dialog > p');
    const acknowledgment = modal.querySelector('.hard-reset-check span');
    if (cardTitle) cardTitle.textContent = 'Absolute reset — ' + Config.bank.shortTitle;
    if (cardCopy) cardCopy.textContent = 'Clears answers, flags, tests, timing, analytics, active sets, and recovery records only for ' + Config.bank.title + '. Other question banks and all protected source material remain unchanged.';
    if (modalTitle) modalTitle.textContent = 'Start ' + Config.bank.shortTitle + ' completely fresh?';
    if (modalCopy) modalCopy.textContent = 'This resets only ' + Config.bank.title + ' in this browser, its hidden Drive backup, and its visible Question Vault performance files. Other banks and historical archives remain protected.';
    if (acknowledgment) acknowledgment.textContent = 'I understand that active progress and test records for ' + Config.bank.title + ' will restart at zero, and that I may need to reconnect Google Drive afterward.';
  }

  function mountUi() {
    const existing = document.getElementById('hardResetCard');
    if (existing) return existing;
    const card = Panels.createHardResetCard();
    const modal = Panels.createHardResetModal(Reset.confirmationPhrase);
    decorate(card, modal);
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

  async function beginReset() {
    if (running) return;
    const code = document.getElementById('hardResetCode').value;
    const phrase = document.getElementById('hardResetPhrase').value;
    const understood = document.getElementById('hardResetUnderstand').checked;
    const confirmButton = document.getElementById('confirmHardReset');
    const cancelButton = document.getElementById('cancelHardReset');

    if (!understood) { modalStatus('Check the acknowledgment box before continuing.', 'warning'); return; }
    if (phrase !== Reset.confirmationPhrase) { modalStatus('The confirmation phrase does not match exactly.', 'error'); return; }
    if (await sha256(code) !== Reset.passcodeSha256) { modalStatus('The reset code is incorrect.', 'error'); return; }

    running = true;
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    const rescue = Store.captureSnapshot('Before active-bank absolute reset', true, 'absolute-reset-recovery');
    downloadRecovery(rescue);

    try {
      const result = await Service.execute(rescue, function (message) { modalStatus(message, 'neutral'); });
      if (window.BoardsDriveBackup && window.BoardsDriveBackup.disconnect) window.BoardsDriveBackup.disconnect('Disconnected after coordinated active-bank reset.');
      if (window.BoardsQuestionVault && window.BoardsQuestionVault.disconnect) window.BoardsQuestionVault.disconnect();
      setStatus(result.bankTitle + ' reset completed. Other question banks and protected archives remain unchanged.', 'good');
      modalStatus('Reset complete. Reloading the clean ' + Config.bank.shortTitle + ' dashboard…', 'good');
      setTimeout(function () { window.location.reload(); }, 1200);
    } catch (error) {
      try { Store.applySnapshot(rescue); } catch (_restoreError) { /* downloaded recovery remains available */ }
      modalStatus((error && error.message ? error.message : 'Absolute reset failed.') + ' The active bank’s browser state was restored when possible, and the downloaded recovery file remains available.', 'error');
      setStatus(Config.bank.title + ' reset did not complete.', 'error');
      running = false;
      confirmButton.disabled = false;
      cancelButton.disabled = false;
    }
  }

  function init() { ensureUi(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.BoardsHardReset = Object.freeze({ open: openModal, close: closeModal, begin: beginReset });
})();