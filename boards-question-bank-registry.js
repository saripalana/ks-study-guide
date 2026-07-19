(function () {
  'use strict';

  const SELECTION_KEY = 'ksBoardsSelectedQuestionBankV1';
  const CATALOG_EVENT = 'ksboards:question-bank-catalog-changed';
  const ACTIVE_EVENT = 'ksboards:active-question-bank-changed';
  const DEFAULT_BANK_ID = 'ks-psychiatry-core';
  const catalog = new Map();

  function cleanId(value) {
    const id = String(value || '').trim().toLowerCase();
    if (!id || !/^[a-z0-9][a-z0-9._:-]*$/.test(id)) throw new Error('Question-bank ids may contain only letters, numbers, periods, colons, underscores, and hyphens.');
    return id;
  }

  function normalizeQuestions(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function validateQuestions(questions, bankId) {
    const ids = new Set();
    questions.forEach(function (question, index) {
      const id = question && question.id != null ? String(question.id).trim() : '';
      if (!id) throw new Error('Question ' + (index + 1) + ' in ' + bankId + ' has no stable id.');
      if (ids.has(id)) throw new Error('Duplicate question id in ' + bankId + ': ' + id);
      ids.add(id);
    });
  }

  function normalizeDefinition(definition) {
    const value = Object.assign({}, definition || {});
    value.id = cleanId(value.id);
    value.title = String(value.title || value.id);
    value.shortTitle = String(value.shortTitle || value.title);
    value.description = String(value.description || '');
    value.status = String(value.status || 'active');
    value.source = String(value.source || 'static');
    value.legacyStorage = value.legacyStorage === true;
    value.questions = normalizeQuestions(value.questions);
    validateQuestions(value.questions, value.id);
    value.ready = value.status === 'active' && value.questions.length > 0;
    value.questionCount = value.questions.length;
    return Object.freeze(value);
  }

  function publicDefinition(definition) {
    return Object.freeze({
      id: definition.id,
      title: definition.title,
      shortTitle: definition.shortTitle,
      description: definition.description,
      status: definition.status,
      source: definition.source,
      legacyStorage: definition.legacyStorage,
      ready: definition.ready,
      questionCount: definition.questionCount
    });
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); }
    catch (error) { console.warn('Could not publish question-bank registry event.', error); }
  }

  function register(definition, options) {
    const normalized = normalizeDefinition(definition);
    const existing = catalog.get(normalized.id);
    if (existing && JSON.stringify(publicDefinition(existing)) !== JSON.stringify(publicDefinition(normalized))) {
      throw new Error('A conflicting definition already exists for question bank ' + normalized.id + '.');
    }
    catalog.set(normalized.id, normalized);
    if (!(options && options.silent)) emit(CATALOG_EVENT, { bank: publicDefinition(normalized), banks: list() });
    return publicDefinition(normalized);
  }

  const originalQuestions = Array.isArray(window.QUESTIONS) ? window.QUESTIONS.slice() : [];
  register({
    id: DEFAULT_BANK_ID,
    title: 'K&S Psychiatry Question Bank',
    shortTitle: 'K&S Psychiatry',
    description: 'The original K&S psychiatry study question bank.',
    status: 'active',
    source: 'data.js',
    legacyStorage: true,
    questions: originalQuestions
  }, { silent: true });

  (Array.isArray(window.BOARDS_QUESTION_BANKS) ? window.BOARDS_QUESTION_BANKS : []).forEach(function (definition) {
    register(definition, { silent: true });
  });

  function list() {
    return Array.from(catalog.values()).map(publicDefinition).sort(function (a, b) {
      if (a.id === DEFAULT_BANK_ID) return -1;
      if (b.id === DEFAULT_BANK_ID) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  function selectedId() {
    try { return cleanId(localStorage.getItem(SELECTION_KEY) || DEFAULT_BANK_ID); }
    catch (error) { return DEFAULT_BANK_ID; }
  }

  function activeInternal() {
    const requested = catalog.get(selectedId());
    if (requested && requested.ready) return requested;
    return catalog.get(DEFAULT_BANK_ID);
  }

  function activeBank() {
    return publicDefinition(activeInternal());
  }

  function activeQuestions() {
    return activeInternal().questions.slice();
  }

  function select(bankId, options) {
    const id = cleanId(bankId);
    const bank = catalog.get(id);
    if (!bank) throw new Error('Question bank not found: ' + id);
    if (!bank.ready) throw new Error(bank.title + ' is listed but is not ready for practice yet.');
    const current = activeInternal();
    if (current.id === id) return publicDefinition(current);
    localStorage.setItem(SELECTION_KEY, id);
    emit(ACTIVE_EVENT, { previousBankId: current.id, bank: publicDefinition(bank) });
    if (!(options && options.reload === false)) window.location.reload();
    return publicDefinition(bank);
  }

  function storageNamespace(bankId) {
    const bank = catalog.get(cleanId(bankId || activeInternal().id));
    if (!bank) throw new Error('Question bank not found.');
    return bank.legacyStorage ? '' : 'abpnBank:' + bank.id + ':';
  }

  function applyIdentity() {
    const bank = activeInternal();
    const eyebrow = document.getElementById('activeBankEyebrow');
    const heading = document.getElementById('activeBankHeading');
    const description = document.getElementById('activeBankDescription');
    if (eyebrow) eyebrow.textContent = bank.shortTitle.toUpperCase() + ' QUESTION BANK';
    if (heading) heading.textContent = bank.title;
    if (description) description.textContent = bank.description + ' ' + bank.questionCount + ' questions are loaded.';
    document.title = bank.title + ' · Psychiatry Board Practice';
  }

  const active = activeInternal();
  window.QUESTIONS = active.questions.slice();

  window.BoardsQuestionBankRegistry = Object.freeze({
    selectionKey: SELECTION_KEY,
    catalogEvent: CATALOG_EVENT,
    activeEvent: ACTIVE_EVENT,
    defaultBankId: DEFAULT_BANK_ID,
    register: register,
    list: list,
    get: function (id) { const bank = catalog.get(cleanId(id)); return bank ? publicDefinition(bank) : null; },
    activeBank: activeBank,
    activeQuestions: activeQuestions,
    select: select,
    storageNamespace: storageNamespace,
    applyIdentity: applyIdentity
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyIdentity);
  else applyIdentity();
})();