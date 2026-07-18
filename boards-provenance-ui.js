(function () {
  'use strict';

  const Config = window.BoardsConfig;
  if (!Config || typeof QUESTIONS === 'undefined') return;

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(Config.storage.keys.app) || '{}') || {};
    } catch (_error) {
      return {};
    }
  }

  function currentQuestion() {
    const state = readState();
    let list = state.chapter === 'all' || state.chapter == null
      ? QUESTIONS
      : QUESTIONS.filter(function (question) { return question.chapter === state.chapter; });
    if (state.view === 'flagged') list = list.filter(function (question) { return state.flagged && state.flagged[question.id]; });
    if (state.view === 'incorrect') list = list.filter(function (question) { return state.missed && state.missed[question.id]; });
    const index = Number(state.index) || 0;
    return list[index] || null;
  }

  function readable(value) {
    if (Array.isArray(value)) return value.join('\n');
    if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value == null ? '' : value);
  }

  function renderProvenance() {
    const card = document.querySelector('#content .card');
    if (!card || card.querySelector('.provenance-strip')) return;
    const question = currentQuestion();
    if (!question || !question.provenance) return;

    const provenance = question.provenance;
    const strip = document.createElement('div');
    const source = provenance.studySource || 'original';
    strip.className = 'provenance-strip provenance-' + source;

    const label = document.createElement('strong');
    label.textContent = provenance.displayLabel || 'ORIGINAL BANK';
    strip.appendChild(label);

    const detail = document.createElement('span');
    detail.className = 'provenance-detail';
    if (source === 'original') detail.textContent = 'Imported source preserved without AI changes.';
    else if (source === 'ai-created') detail.textContent = 'Created by AI as a separate personal supplement.';
    else if (source === 'user-created') detail.textContent = 'Created as a separate personal supplement.';
    else if (source === 'ai-revised') detail.textContent = 'Original source preserved; reviewed overlay applied for study.';
    strip.appendChild(detail);

    if (source === 'ai-revised' && question.originalContent) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'provenance-original-toggle';
      button.textContent = 'Show original fields';
      const panel = document.createElement('div');
      panel.className = 'provenance-original-panel';
      panel.hidden = true;
      const fields = Array.isArray(provenance.modifiedFields) ? provenance.modifiedFields : [];
      panel.textContent = fields.map(function (field) {
        return 'ORIGINAL ' + field.toUpperCase() + ':\n' + readable(question.originalContent[field]);
      }).join('\n\n');
      button.addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        button.textContent = panel.hidden ? 'Show original fields' : 'Hide original fields';
      });
      strip.appendChild(button);
      strip.appendChild(panel);
    }

    const questionText = card.querySelector('.question-text');
    if (questionText) card.insertBefore(strip, questionText);
    else card.insertBefore(strip, card.firstChild);
  }

  function init() {
    const content = document.getElementById('content');
    if (!content) return;
    const observer = new MutationObserver(function () { setTimeout(renderProvenance, 0); });
    observer.observe(content, { childList: true, subtree: true });
    renderProvenance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
