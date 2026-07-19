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

  function bankOptions(banks, activeBankId) {
    return (banks || []).map(function (bank) {
      const selected = bank.id === activeBankId;
      const unavailable = !bank.ready;
      const stateLabel = selected ? 'Current bank' : (unavailable ? 'Not ready' : 'Switch bank');
      return '<button type="button" class="question-bank-option' + (selected ? ' selected' : '') + '" data-bank-id="' +
        escapeHtml(bank.id) + '" role="option" aria-selected="' + (selected ? 'true' : 'false') + '"' +
        (unavailable ? ' disabled' : '') + '>' +
        '<span class="question-bank-option-main"><strong>' + escapeHtml(bank.title) + '</strong><span>' +
        escapeHtml(bank.description || 'Personal psychiatry study question bank.') + '</span></span>' +
        '<span class="question-bank-option-meta"><strong>' + Number(bank.questionCount || 0) + '</strong><span>questions</span><em>' +
        escapeHtml(stateLabel) + '</em></span></button>';
    }).join('');
  }

  function createSelector(banks, activeBank) {
    const bankList = Array.isArray(banks) ? banks : [];
    const active = activeBank || bankList[0] || { id: '', title: 'Question bank', description: '', questionCount: 0 };
    return fromHtml(
      '<div id="questionBankBuilderSection" class="form-section builder-section question-bank-builder-section">' +
        '<div class="field-label">Question bank</div>' +
        '<details id="questionBankSelector" class="question-bank-selector">' +
          '<summary><span class="question-bank-summary-copy"><strong id="activeBuilderBankTitle">' + escapeHtml(active.title) + '</strong>' +
          '<span id="activeBuilderBankDescription">' + escapeHtml(active.description || '') + '</span></span>' +
          '<span class="question-bank-summary-meta"><strong id="activeBuilderBankCount">' + Number(active.questionCount || 0) + '</strong><span>questions</span></span></summary>' +
          '<div id="questionBankOptions" class="question-bank-options" role="listbox" aria-label="Available question banks">' +
          bankOptions(bankList, active.id) + '</div>' +
        '</details>' +
        '<p id="questionBankSelectorHelp" class="field-help">Expand to choose a question bank. Future validated banks will appear here automatically and keep separate progress, tests, and Drive backups.</p>' +
      '</div>'
    );
  }

  function updateSelector(container, banks, activeBank) {
    if (!container || !activeBank) return;
    const title = container.querySelector('#activeBuilderBankTitle');
    const description = container.querySelector('#activeBuilderBankDescription');
    const count = container.querySelector('#activeBuilderBankCount');
    const options = container.querySelector('#questionBankOptions');
    if (title) title.textContent = activeBank.title;
    if (description) description.textContent = activeBank.description || '';
    if (count) count.textContent = String(activeBank.questionCount || 0);
    if (options) options.innerHTML = bankOptions(banks, activeBank.id);
  }

  window.BoardsQuestionBankSelectorView = Object.freeze({
    createSelector: createSelector,
    updateSelector: updateSelector,
    bankOptions: bankOptions
  });
})();